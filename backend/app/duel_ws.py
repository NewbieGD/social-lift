"""Live duels over WebSocket: presence, invitations and relaying inputs between two players.

Both players play the same seed; each client re-simulates the opponent from the relayed
inputs (the simulation is deterministic). Results are validated like normal runs, and the
duel is decided on the server when both runs are over (see services.game.resolve_duel).
State lives in this process (one instance on Amvera).
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import secrets
import time
import uuid
from datetime import timedelta
from collections import deque
from dataclasses import dataclass, field

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .config import settings
from . import tunables
from .core import utcnow
from .db import SessionLocal
from sqlalchemy import func, select

from .models import ChatBlock, ChatReport, User
from . import chat_filter, cosmetics
from .services import game, notify, shop
from .vk_sign import verify_launch_params

log = logging.getLogger("duel")
router = APIRouter(prefix="/api")

INVITE_TIMEOUT_SEC = 15
START_DELAY_MS = 3500
MAX_MESSAGE_BYTES = 16_000
CHAT_COOLDOWN_SEC = 30
CHAT_HISTORY = 60


@dataclass
class Conn:
    ws: WebSocket
    user_id: int
    name: str | None
    photo: str | None
    state: str = "idle"  # idle | run | searching | invited | duel | watching
    duel: str | None = None
    invite_from: int | None = None
    declined: dict[int, float] = field(default_factory=dict)
    msgs: list[float] = field(default_factory=list)
    in_chat: bool = False
    chat_rank: int | None = None
    # Others may be offered a link to this player's VK page.
    link: bool = True
    last_chat: float = -1e9
    # The duel this player is watching (as a spectator), if any.
    watching: str | None = None
    # Players whose chat messages this player does not want to see.
    blocked: set[int] = field(default_factory=set)
    report_times: list[float] = field(default_factory=list)


@dataclass
class Duel:
    id: str
    a: int
    b: int
    done: set[int] = field(default_factory=set)
    # For spectators: the level and when it started, who plays (with how they look), the inputs
    # sent so far by each player, the final scores of those who are out, and who is watching.
    seed: int = 0
    started_at: float = 0.0  # time.time() when the countdown ends (seconds)
    players: dict[int, dict] = field(default_factory=dict)
    logs: dict[int, list] = field(default_factory=dict)
    scores: dict[int, int] = field(default_factory=dict)
    spectators: set[int] = field(default_factory=set)

    @property
    def log_size(self) -> int:
        return sum(len(v) for v in self.logs.values())


CHAT_REPORT_HIDE = 3  # distinct complaints that remove a message for everybody
CHAT_REPORT_MUTE = 5  # distinct players who complained within a day: a mute for an hour
CHAT_MUTE_SEC = 3600
REPORT_REASONS = ("abuse", "spam", "other")

chat_history: deque[dict] = deque(maxlen=CHAT_HISTORY)
chat_muted: dict[int, float] = {}  # user id -> time.monotonic() until which the player cannot write
chat_seq = 0
conns: dict[int, Conn] = {}
duels: dict[str, Duel] = {}
invites: dict[int, tuple[int, float]] = {}  # target -> (from, time)


async def send(c: Conn | None, msg: dict) -> None:
    if c is None:
        return
    try:
        await c.ws.send_text(json.dumps(msg, separators=(",", ":")))
    except Exception:  # noqa: BLE001 - the socket may be closing
        pass


def opponent_of(d: Duel, user_id: int) -> int:
    return d.b if user_id == d.a else d.a


def public(c: Conn) -> dict:
    return {"id": c.user_id, "name": c.name, "photo": c.photo}


def chat_user(c: Conn) -> dict:
    """Public data of a chat member: avatar, name and place in the all-time leaderboard."""
    return {"id": c.user_id, "name": c.name, "photo": c.photo, "rank": c.chat_rank, "link": c.link}


def chat_members() -> list[Conn]:
    return [c for c in conns.values() if c.in_chat]


async def chat_broadcast(msg: dict) -> None:
    sender = (msg.get("msg") or {}).get("user", {}).get("id") if msg.get("t") == "chat" else None
    for c in chat_members():
        # A player who blocked the sender never receives the message.
        if sender is not None and sender in c.blocked:
            continue
        await send(c, msg)


async def chat_send_users() -> None:
    for c in chat_members():
        users = [chat_user(m) for m in chat_members() if m.user_id not in c.blocked]
        await send(c, {"t": "chat_users", "users": users})


def chat_wait(c: Conn) -> int:
    return max(0, int(tunables.get("chat_cooldown_sec") - (time.monotonic() - c.last_chat) + 0.999))


async def chat_join(me: Conn) -> None:
    fresh = not me.in_chat
    if fresh:
        async with SessionLocal() as session:
            user = await session.get(User, me.user_id)
            me.chat_rank = await game.rank_all(session, user.best_all, user.best_all_at) if user else None
        me.in_chat = True
    await send(
        me,
        {
            "t": "chat_hist",
            "msgs": [m for m in chat_history if m["user"]["id"] not in me.blocked],
            "users": [chat_user(c) for c in chat_members() if c.user_id not in me.blocked],
            "wait": chat_wait(me),
        },
    )
    if fresh:
        for c in chat_members():
            if c is not me and me.user_id not in c.blocked:
                await send(c, {"t": "chat_user", "action": "join", "user": chat_user(me)})
        await chat_send_users()


async def chat_leave(me: Conn) -> None:
    if not me.in_chat:
        return
    me.in_chat = False
    await chat_send_users()


async def chat_say(me: Conn, raw: object) -> None:
    global chat_seq
    if not me.in_chat:
        return
    text = chat_filter.clean(raw)
    problem = chat_filter.check(text)
    if problem:
        await send(me, {"t": "chat_err", "code": problem})
        return
    muted = chat_muted.get(me.user_id, 0) - time.monotonic()
    if muted > 0:
        await send(me, {"t": "chat_err", "code": "muted", "wait": int(muted) + 1})
        return
    wait = chat_wait(me)
    if wait > 0:
        await send(me, {"t": "chat_err", "code": "cooldown", "wait": wait})
        return
    me.last_chat = time.monotonic()
    chat_seq += 1
    msg = {"id": chat_seq, "ts": int(time.time() * 1000), "user": chat_user(me), "text": text}
    chat_history.append(msg)
    await chat_broadcast({"t": "chat", "msg": msg})
    await send(me, {"t": "chat_cd", "wait": tunables.get("chat_cooldown_sec")})


async def chat_report(me: Conn, msg_id: object, reason: object) -> None:
    """A complaint about a chat message. Enough complaints hide it and mute the author for a while."""
    if not isinstance(msg_id, int) or reason not in REPORT_REASONS:
        return
    now = time.monotonic()
    me.report_times[:] = [t for t in me.report_times if now - t < 60]
    if len(me.report_times) >= 6:
        await send(me, {"t": "report_err", "code": "too_many"})
        return
    msg = next((m for m in chat_history if m["id"] == msg_id), None)
    if msg is None or msg["user"]["id"] == me.user_id:
        await send(me, {"t": "report_err", "code": "gone"})
        return
    me.report_times.append(now)
    author = msg["user"]["id"]
    async with SessionLocal() as session:
        exists = await session.scalar(
            select(func.count())
            .select_from(ChatReport)
            .where(ChatReport.reporter_id == me.user_id, ChatReport.reported_id == author, ChatReport.msg_ts == msg["ts"])
        )
        if not exists:
            session.add(
                ChatReport(
                    reporter_id=me.user_id,
                    reported_id=author,
                    msg_ts=msg["ts"],
                    text=str(msg["text"])[:240],
                    reason=reason,
                    created_at=utcnow(),
                )
            )
            await session.commit()
        same_msg = await session.scalar(
            select(func.count())
            .select_from(ChatReport)
            .where(ChatReport.reported_id == author, ChatReport.msg_ts == msg["ts"])
        )
        day_reporters = await session.scalar(
            select(func.count(func.distinct(ChatReport.reporter_id))).where(
                ChatReport.reported_id == author, ChatReport.created_at > utcnow() - timedelta(days=1)
            )
        )
    await send(me, {"t": "report_ok"})
    if (same_msg or 0) >= tunables.get("chat_report_hide"):
        try:
            chat_history.remove(msg)
        except ValueError:
            pass
        await chat_broadcast({"t": "chat_remove", "id": msg_id})
    if (day_reporters or 0) >= tunables.get("chat_report_mute") and chat_muted.get(author, 0) < time.monotonic():
        chat_muted[author] = time.monotonic() + tunables.get("chat_mute_sec")
        target = conns.get(author)
        if target is not None:
            await send(target, {"t": "chat_err", "code": "muted", "wait": tunables.get("chat_mute_sec")})


async def challenge(me: Conn, target_id: object) -> None:
    """A direct duel challenge to a chosen player (from the chat)."""
    if not isinstance(target_id, int) or target_id == me.user_id:
        return
    target = conns.get(target_id)
    if me.state != "idle":
        await send(me, {"t": "busy", "who": "me"})
        return
    if target is None or target.state != "idle" or target.user_id in invites or me.user_id in target.blocked:
        await send(me, {"t": "busy", "who": "them", "name": target.name if target else None})
        return
    # Both players need the stake on the account.
    coins = await _coins([me.user_id, target.user_id])
    if coins.get(me.user_id, 0) < game.duel_stake():
        await send(me, {"t": "stake_short", "need": game.duel_stake(), "have": coins.get(me.user_id, 0), "who": "me"})
        return
    if coins.get(target.user_id, 0) < game.duel_stake():
        await send(me, {"t": "stake_short", "need": game.duel_stake(), "have": coins.get(target.user_id, 0), "who": "them", "name": target.name})
        return
    await invite(me, target)


async def broadcast_online() -> None:
    n = len(conns)
    for c in list(conns.values()):
        await send(c, {"t": "online", "n": n})


def _on_result(duel_id: str, outcome: dict[int, str]) -> None:
    d = duels.pop(duel_id, None)
    stakes = game.duel_stakes.pop(duel_id, {})
    if d is not None:
        # The watchers learn how it ended and go back to idle.
        for sid in list(d.spectators):
            sc = conns.get(sid)
            if sc is not None:
                sc.watching = None
                if sc.state == "watching":
                    sc.state = "idle"
                asyncio.get_running_loop().create_task(
                    send(sc, {"t": "spec_end", "duel": duel_id, "outcome": {str(k): v for k, v in outcome.items()}})
                )
        d.spectators.clear()
    for uid, res in outcome.items():
        c = conns.get(uid)
        if c is not None:
            if c.duel == duel_id:
                c.duel = None
                c.state = "idle"
            asyncio.get_running_loop().create_task(
                send(c, {"t": "result", "duel": duel_id, "outcome": res, "coins": stakes.get(uid, 0)})
            )
    del d


game.duel_listeners.append(_on_result)


def _allowed_origin(ws: WebSocket) -> bool:
    origin = (ws.headers.get("origin") or "").rstrip("/")
    if settings.is_dev or not settings.allowed_origins:
        return True
    return origin in settings.allowed_origins


def _rate_ok(c: Conn) -> bool:
    now = time.monotonic()
    c.msgs = [t for t in c.msgs if t > now - 1]
    c.msgs.append(now)
    return len(c.msgs) <= 40


@router.websocket("/duel/ws")
async def duel_socket(ws: WebSocket) -> None:
    params = verify_launch_params(ws.query_params.get("p", ""), settings.vk_secret_key, settings.vk_app_id)
    # Accept first and close with a code: a refusal before the handshake only shows up in the
    # browser as an anonymous "connection failed" with no way to tell why.
    await ws.accept()
    if params is None:
        log.warning("duel socket refused: bad launch params")
        await ws.close(code=4401, reason="launch params")
        return
    if not _allowed_origin(ws):
        log.warning("duel socket refused: origin %r not in ALLOWED_ORIGINS", ws.headers.get("origin"))
        await ws.close(code=4401, reason="origin")
        return
    async with SessionLocal() as session:
        user = await session.get(User, params.user_id)
        if user is None or not game.consent_ok(user):
            await ws.close(code=4403, reason="consent")
            return
        me = Conn(
            ws=ws,
            user_id=user.id,
            name=user.display_name,
            photo=None if user.profile_deactivated else user.photo_url,
            link=not user.hide_vk_link,
        )
        rows = await session.execute(select(ChatBlock.blocked_id).where(ChatBlock.user_id == user.id))
        me.blocked = {int(b) for (b,) in rows}
    old = conns.get(me.user_id)
    if old is not None:
        try:
            await old.ws.close(code=4409)
        except Exception:  # noqa: BLE001
            pass
    conns[me.user_id] = me
    await broadcast_online()
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > MAX_MESSAGE_BYTES or not _rate_ok(me):
                continue
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if isinstance(msg, dict):
                await handle(me, msg)
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        log.warning("duel socket error: %s", type(exc).__name__)
    finally:
        if conns.get(me.user_id) is me:
            del conns[me.user_id]
        spec_leave(me)
        await chat_leave(me)
        await leave_duel(me)
        await broadcast_online()


async def handle(me: Conn, msg: dict) -> None:
    t = msg.get("t")
    if t == "state" and me.state in ("idle", "run"):
        me.state = "run" if msg.get("v") == "run" else "idle"
    elif t == "find":
        await find(me)
    elif t == "chat_join":
        await chat_join(me)
    elif t == "chat_leave":
        await chat_leave(me)
    elif t == "report":
        await chat_report(me, msg.get("msg_id"), msg.get("reason"))
    elif t == "chat":
        await chat_say(me, msg.get("text"))
    elif t == "challenge":
        await challenge(me, msg.get("to"))
    elif t == "cancel":
        if me.state == "searching":
            me.state = "idle"
            for target, (frm, _) in list(invites.items()):
                if frm == me.user_id:
                    invites.pop(target, None)
                    tc = conns.get(target)
                    if tc and tc.state == "invited":
                        tc.state = "idle"
                        await send(tc, {"t": "invite_cancel"})
    elif t == "accept":
        await accept(me)
    elif t == "decline":
        inv = invites.pop(me.user_id, None)
        me.state = "idle"
        if inv:
            frm = conns.get(inv[0])
            if frm:
                frm.declined[me.user_id] = time.monotonic()
                frm.state = "idle"
                await send(frm, {"t": "declined"})
    elif t == "leave" and me.duel:
        duel_id = me.duel
        d = duels.get(duel_id)
        me.duel = None
        me.state = "idle"
        if d is not None:
            await send(conns.get(opponent_of(d, me.user_id)), {"t": "opp_left"})
            async with SessionLocal() as session:
                await game.abandon_duel_run(session, duel_id, me.user_id)
    elif t in ("inputs", "dead") and me.duel:
        d = duels.get(me.duel)
        if d is None:
            return
        other = conns.get(opponent_of(d, me.user_id))
        if t == "inputs":
            log_ = msg.get("log")
            upto = msg.get("upto")
            if isinstance(log_, list) and isinstance(upto, int) and len(log_) <= 2000:
                await send(other, {"t": "inputs", "upto": upto, "log": log_})
                # Kept for people who join as spectators later (bounded), and passed on to those watching.
                if d.log_size < SPEC_LOG_MAX:
                    d.logs.setdefault(me.user_id, []).extend(log_)
                for sid in list(d.spectators):
                    await send(conns.get(sid), {"t": "spec_inputs", "duel": d.id, "uid": me.user_id, "upto": upto, "log": log_})
        else:
            score = msg.get("score")
            score = score if isinstance(score, int) else 0
            d.scores[me.user_id] = score
            await send(other, {"t": "opp_dead", "score": score})
            for sid in list(d.spectators):
                await send(conns.get(sid), {"t": "spec_dead", "duel": d.id, "uid": me.user_id, "score": score})
    elif t == "spec_list":
        await spec_list(me)
    elif t == "spec_join":
        await spec_join(me, msg.get("duel"))
    elif t == "spec_leave":
        spec_leave(me)


# Spectators ("watch a duel"): up to this many per duel, and the inputs kept for latecomers.
SPEC_MAX_PER_DUEL = 30
SPEC_LOG_MAX = 6000


def _live_duels() -> list[Duel]:
    return [d for d in duels.values() if d.players and d.a in conns and d.b in conns]


async def spec_list(me: Conn) -> None:
    """The duels that are running now, to pick one to watch."""
    now = time.time()
    rows = []
    for d in _live_duels()[:20]:
        a, b = d.players.get(d.a), d.players.get(d.b)
        if not a or not b:
            continue
        rows.append(
            {
                "id": d.id,
                "a": {k: a[k] for k in ("id", "name", "photo")},
                "b": {k: b[k] for k in ("id", "name", "photo")},
                "elapsed": max(0, int(now - d.started_at)),
                "watchers": len(d.spectators),
            }
        )
    await send(me, {"t": "spec_list", "duels": rows})


async def spec_join(me: Conn, duel_id: object) -> None:
    d = duels.get(duel_id) if isinstance(duel_id, str) else None
    if d is None or me.state != "idle" or me.user_id in (d.a, d.b) or len(d.spectators) >= SPEC_MAX_PER_DUEL:
        await send(me, {"t": "spec_err", "code": "unavailable"})
        return
    me.state = "watching"
    me.watching = d.id
    d.spectators.add(me.user_id)
    await send(
        me,
        {
            "t": "spec_start",
            "duel": d.id,
            "seed": d.seed,
            "elapsed_ms": int((time.time() - d.started_at) * 1000),
            "players": [d.players[d.a], d.players[d.b]],
            "logs": {str(uid): d.logs.get(uid, []) for uid in (d.a, d.b)},
            "scores": {str(uid): d.scores.get(uid) for uid in (d.a, d.b)},
        },
    )


def spec_leave(me: Conn) -> None:
    d = duels.get(me.watching) if me.watching else None
    if d is not None:
        d.spectators.discard(me.user_id)
    me.watching = None
    if me.state == "watching":
        me.state = "idle"


async def _coins(user_ids: list[int]) -> dict[int, int]:
    """The coins of players (for the duel stake)."""
    if not user_ids:
        return {}
    async with SessionLocal() as session:
        rows = await session.execute(select(User.id, User.coins).where(User.id.in_(user_ids)))
        return {int(i): int(c or 0) for i, c in rows}


async def find(me: Conn) -> None:
    if me.state not in ("idle",):
        return
    now = time.monotonic()
    pool = [
        c
        for c in conns.values()
        if c.user_id != me.user_id
        and c.state == "idle"
        and now - me.declined.get(c.user_id, -999) > 120
        and c.user_id not in invites
        and c.user_id not in me.blocked
        and me.user_id not in c.blocked
    ]
    coins = await _coins([me.user_id, *[c.user_id for c in pool]])
    if coins.get(me.user_id, 0) < game.duel_stake():
        await send(me, {"t": "stake_short", "need": game.duel_stake(), "have": coins.get(me.user_id, 0), "who": "me"})
        return
    # Only players who can pay the stake are offered.
    pool = [c for c in pool if coins.get(c.user_id, 0) >= game.duel_stake()]
    if not pool:
        await send(me, {"t": "none", "n": len(conns)})
        return
    await invite(me, random.choice(pool))


async def invite(me: Conn, target: Conn) -> None:
    now = time.monotonic()
    me.state = "searching"
    target.state = "invited"
    invites[target.user_id] = (me.user_id, now)
    await send(target, {"t": "invite", "from": public(me), "timeout": tunables.get("invite_timeout_sec"), "stake": game.duel_stake()})
    await send(me, {"t": "waiting", "to": public(target), "timeout": tunables.get("invite_timeout_sec")})
    asyncio.get_event_loop().create_task(_expire_invite(target.user_id, me.user_id))
    # Also tell the challenged player in VK, in case the game is in the background.
    asyncio.get_event_loop().create_task(
        notify.send_notification(target.user_id, notify.duel_challenge_text(me.name))
    )


async def _expire_invite(target_id: int, from_id: int) -> None:
    await asyncio.sleep(tunables.get("invite_timeout_sec"))
    inv = invites.get(target_id)
    if inv and inv[0] == from_id:
        invites.pop(target_id, None)
        tc = conns.get(target_id)
        if tc and tc.state == "invited":
            tc.state = "idle"
            await send(tc, {"t": "invite_cancel"})
        fc = conns.get(from_id)
        if fc and fc.state == "searching":
            fc.state = "idle"
            await send(fc, {"t": "declined"})


async def _look(session, user: User) -> dict:
    """How a player looks: the styles they wear and their pet, shown on the opponent's screen."""
    owned = await shop.owned_ids(session, user.id)
    decor = cosmetics.clean_decor(user.decor or {}, owned)
    return {"loadout": cosmetics.clean_loadout(user.loadout or {}, owned), "pet": decor.get("pet")}


async def accept(me: Conn) -> None:
    inv = invites.pop(me.user_id, None)
    if not inv:
        me.state = "idle"
        await send(me, {"t": "invite_cancel"})
        return
    other = conns.get(inv[0])
    if other is None or other.state != "searching":
        me.state = "idle"
        await send(me, {"t": "invite_cancel"})
        return
    # The stake is checked again: coins may have been spent while the invitation was waiting.
    coins = await _coins([me.user_id, other.user_id])
    short = [c for c in (me, other) if coins.get(c.user_id, 0) < game.duel_stake()]
    if short:
        for c in (me, other):
            c.state = "idle"
        for c in short:
            await send(c, {"t": "stake_short", "need": game.duel_stake(), "have": coins.get(c.user_id, 0), "who": "me"})
        for c in (me, other):
            if c not in short:
                await send(c, {"t": "invite_cancel" if c is me else "declined"})
        return
    duel_id = str(uuid.uuid4())
    seed = secrets.randbits(32)
    async with SessionLocal() as session:
        ua = await session.get(User, other.user_id)
        ub = await session.get(User, me.user_id)
        if ua is None or ub is None:
            return
        ta = await game.start_run(session, ua, seed=seed, duel_id=duel_id)
        tb = await game.start_run(session, ub, seed=seed, duel_id=duel_id)
        looks = {ua.id: await _look(session, ua), ub.id: await _look(session, ub)}
    start_at = int(time.time() * 1000) + START_DELAY_MS
    duels[duel_id] = Duel(
        id=duel_id,
        a=other.user_id,
        b=me.user_id,
        seed=seed,
        started_at=start_at / 1000,
        players={
            other.user_id: {**public(other), "look": looks.get(other.user_id)},
            me.user_id: {**public(me), "look": looks.get(me.user_id)},
        },
    )
    for c, ticket, opp in ((other, ta, me), (me, tb, other)):
        c.state = "duel"
        c.duel = duel_id
        await send(
            c,
            {
                "t": "start",
                "duel": duel_id,
                "seed": seed,
                "start_at": start_at,
                "ticket": ticket,
                "opponent": {**public(opp), "look": looks.get(opp.user_id)},
                "stake": game.duel_stake(),
            },
        )


async def leave_duel(me: Conn) -> None:
    """Leaving mid-duel (closing the game) abandons the run: it counts as a loss."""
    duel_id = me.duel
    inv = invites.pop(me.user_id, None)
    if inv:
        fc = conns.get(inv[0])
        if fc and fc.state == "searching":
            fc.state = "idle"
            await send(fc, {"t": "declined"})
    for target, (frm, _) in list(invites.items()):
        if frm == me.user_id:
            invites.pop(target, None)
            tc = conns.get(target)
            if tc and tc.state == "invited":
                tc.state = "idle"
                await send(tc, {"t": "invite_cancel"})
    if not duel_id or duel_id not in duels:
        return
    d = duels[duel_id]
    await send(conns.get(opponent_of(d, me.user_id)), {"t": "opp_left"})
    async with SessionLocal() as session:
        await game.abandon_duel_run(session, duel_id, me.user_id)
