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
from datetime import datetime, timezone
from dataclasses import dataclass, field

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .config import settings
from .db import SessionLocal
from .models import User
from . import chat_filter
from .chat_room import MUTE_SEC, REACTIONS, ChatRoom, ReportGuard
from .services import chat as chat_svc
from .services import game, notify
from .vk_sign import verify_launch_params

log = logging.getLogger("duel")
router = APIRouter(prefix="/api")

INVITE_TIMEOUT_SEC = 15
START_DELAY_MS = 3500
MAX_MESSAGE_BYTES = 16_000
CHAT_COOLDOWN_SEC = 30
PURGE_EVERY_SEC = 30


@dataclass
class Conn:
    ws: WebSocket
    user_id: int
    name: str | None
    photo: str | None
    state: str = "idle"  # idle | run | searching | invited | duel
    duel: str | None = None
    invite_from: int | None = None
    declined: dict[int, float] = field(default_factory=dict)
    msgs: list[float] = field(default_factory=list)
    in_chat: bool = False
    chat_rank: int | None = None
    last_chat: float = -1e9
    blocked: set[int] = field(default_factory=set)  # players whose chat messages and challenges this player does not get
    muted_until: float = 0.0  # epoch seconds; set automatically after several complaints


@dataclass
class Duel:
    id: str
    a: int
    b: int
    done: set[int] = field(default_factory=set)


room = ChatRoom()
guard = ReportGuard()
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
    return {"id": c.user_id, "name": c.name, "photo": c.photo, "rank": c.chat_rank}


def chat_members() -> list[Conn]:
    return [c for c in conns.values() if c.in_chat]


def now_ms() -> int:
    return int(time.time() * 1000)


async def chat_broadcast(msg: dict, sender: int | None = None) -> None:
    """Sends to everyone in the chat except players who blocked `sender`."""
    for c in chat_members():
        if sender is not None and sender in c.blocked and c.user_id != sender:
            continue
        await send(c, msg)


def visible_users(viewer: Conn) -> list[dict]:
    return [chat_user(c) for c in chat_members() if c.user_id == viewer.user_id or c.user_id not in viewer.blocked]


async def chat_send_users() -> None:
    for c in chat_members():
        await send(c, {"t": "chat_users", "users": visible_users(c)})


def chat_wait(c: Conn) -> int:
    return max(0, int(CHAT_COOLDOWN_SEC - (time.monotonic() - c.last_chat) + 0.999))


def mute_wait(c: Conn) -> int:
    return max(0, int(c.muted_until - time.time() + 0.999))


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
            "msgs": room.history_for(me.user_id, me.blocked, now_ms()),
            "users": visible_users(me),
            "wait": chat_wait(me),
            "muted": mute_wait(me),
            "blocked": sorted(me.blocked),
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
    if not me.in_chat:
        return
    muted = mute_wait(me)
    if muted > 0:
        await send(me, {"t": "chat_err", "code": "muted", "wait": muted})
        return
    text = chat_filter.clean(raw)
    problem = chat_filter.check(text)
    if problem:
        await send(me, {"t": "chat_err", "code": problem})
        return
    wait = chat_wait(me)
    if wait > 0:
        await send(me, {"t": "chat_err", "code": "cooldown", "wait": wait})
        return
    me.last_chat = time.monotonic()
    msg = room.add(chat_user(me), text, now_ms())
    for c in chat_members():
        if me.user_id in c.blocked:
            continue
        await send(c, {"t": "chat", "msg": room.public(msg, c.user_id)})
    await send(me, {"t": "chat_cd", "wait": CHAT_COOLDOWN_SEC})


async def chat_react(me: Conn, msg_id: object, kind: object) -> None:
    """Like or dislike (the same button again takes it back). Not on your own messages."""
    if not me.in_chat or kind not in REACTIONS:
        return
    m = room.get(msg_id)
    if m is None or m.author == me.user_id or m.author in me.blocked:
        return
    mine = room.react(m, me.user_id, kind)
    note = {"t": "chat_react", "id": m.id, "up": len(m.up), "down": len(m.down), "by": me.user_id, "r": mine}
    await chat_broadcast(note, sender=m.author)


async def chat_report(me: Conn, target: object, msg_id: object, reason: object) -> None:
    if not me.in_chat:
        return
    now = time.time()
    problem = guard.check(me.user_id, target, reason, now)
    if problem:
        await send(me, {"t": "chat_err", "code": "report_" + problem})
        return
    assert isinstance(target, int) and isinstance(reason, str)
    m = room.get(msg_id)
    text = m.text if m is not None and m.author == target else None
    async with SessionLocal() as session:
        stored = await chat_svc.add_report(session, me.user_id, target, reason, m.id if text else None, text)
    if not stored:
        await send(me, {"t": "chat_err", "code": "report_bad"})
        return
    await send(me, {"t": "chat_report_ok"})
    if guard.record(me.user_id, target, now):
        until = now + MUTE_SEC
        async with SessionLocal() as session:
            await chat_svc.set_mute(session, target, datetime.fromtimestamp(until, tz=timezone.utc))
        tc = conns.get(target)
        if tc is not None:
            tc.muted_until = until
            await send(tc, {"t": "chat_err", "code": "muted", "wait": MUTE_SEC})
        log.info("chat mute: player %s after complaints", target)


async def chat_block(me: Conn, target: object) -> None:
    if not isinstance(target, int) or isinstance(target, bool):
        return
    async with SessionLocal() as session:
        res = await chat_svc.block(session, me.user_id, target)
    if res != "ok":
        await send(me, {"t": "chat_err", "code": "block_" + res})
        return
    me.blocked.add(target)
    await send(me, {"t": "chat_blocked", "id": target, "blocked": sorted(me.blocked)})
    if me.in_chat:
        await send(me, {"t": "chat_users", "users": visible_users(me)})


async def chat_unblock(me: Conn, target: object) -> None:
    if not isinstance(target, int) or isinstance(target, bool):
        return
    async with SessionLocal() as session:
        await chat_svc.unblock(session, me.user_id, target)
    me.blocked.discard(target)
    await send(me, {"t": "chat_blocked", "id": None, "blocked": sorted(me.blocked)})
    await chat_blocks_list(me)
    if me.in_chat:
        await chat_join(me)  # sends the history again, now with that player's messages


async def chat_blocks_list(me: Conn) -> None:
    async with SessionLocal() as session:
        users = await chat_svc.list_blocked(session, me.user_id)
    await send(me, {"t": "chat_blocks", "users": users})


async def chat_maintenance() -> None:
    """Every half minute: drop chat messages older than an hour; once an hour: old complaints."""
    last_reports = 0.0
    while True:
        await asyncio.sleep(PURGE_EVERY_SEC)
        try:
            cut = room.purge(now_ms())
            if cut is not None:
                await chat_broadcast({"t": "chat_purge", "before": cut})
            now = time.time()
            guard.sweep(now)
            if now - last_reports > 3600:
                last_reports = now
                async with SessionLocal() as session:
                    await chat_svc.purge_old_reports(session)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - housekeeping must never stop
            log.warning("chat maintenance failed: %s", type(exc).__name__)


_maintenance: asyncio.Task | None = None


def start_maintenance() -> None:
    global _maintenance
    if _maintenance is None or _maintenance.done():
        _maintenance = asyncio.get_running_loop().create_task(chat_maintenance())


async def stop_maintenance() -> None:
    global _maintenance
    if _maintenance is not None:
        _maintenance.cancel()
        try:
            await _maintenance
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
        _maintenance = None


async def challenge(me: Conn, target_id: object) -> None:
    """A direct duel challenge to a chosen player (from the chat)."""
    if not isinstance(target_id, int) or target_id == me.user_id:
        return
    target = conns.get(target_id)
    if me.state != "idle":
        await send(me, {"t": "busy", "who": "me"})
        return
    if target is None or target.state != "idle" or target.user_id in invites or me.user_id in target.blocked:
        # A player who blocked you looks just like a busy one.
        await send(me, {"t": "busy", "who": "them", "name": target.name if target else None})
        return
    await invite(me, target)


async def broadcast_online() -> None:
    n = len(conns)
    for c in list(conns.values()):
        await send(c, {"t": "online", "n": n})


def _on_result(duel_id: str, outcome: dict[int, str]) -> None:
    d = duels.pop(duel_id, None)
    for uid, res in outcome.items():
        c = conns.get(uid)
        if c is not None:
            if c.duel == duel_id:
                c.duel = None
                c.state = "idle"
            asyncio.get_running_loop().create_task(send(c, {"t": "result", "duel": duel_id, "outcome": res}))
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
        me = Conn(ws=ws, user_id=user.id, name=user.display_name, photo=None if user.profile_deactivated else user.photo_url)
        me.blocked = await chat_svc.load_blocks(session, user.id)
        if user.chat_muted_until is not None:
            until = user.chat_muted_until
            me.muted_until = (until if until.tzinfo else until.replace(tzinfo=timezone.utc)).timestamp()
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
    elif t == "chat":
        await chat_say(me, msg.get("text"))
    elif t == "chat_react":
        await chat_react(me, msg.get("id"), msg.get("r"))
    elif t == "chat_report":
        await chat_report(me, msg.get("user"), msg.get("id"), msg.get("reason"))
    elif t == "chat_block":
        await chat_block(me, msg.get("id"))
    elif t == "chat_unblock":
        await chat_unblock(me, msg.get("id"))
    elif t == "chat_blocks":
        await chat_blocks_list(me)
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
        else:
            score = msg.get("score")
            await send(other, {"t": "opp_dead", "score": score if isinstance(score, int) else 0})


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
        and c.user_id not in me.blocked  # nobody you blocked
        and me.user_id not in c.blocked  # and nobody who blocked you
    ]
    if not pool:
        await send(me, {"t": "none", "n": len(conns)})
        return
    await invite(me, random.choice(pool))


async def invite(me: Conn, target: Conn) -> None:
    now = time.monotonic()
    me.state = "searching"
    target.state = "invited"
    invites[target.user_id] = (me.user_id, now)
    await send(target, {"t": "invite", "from": public(me), "timeout": INVITE_TIMEOUT_SEC})
    await send(me, {"t": "waiting", "to": public(target), "timeout": INVITE_TIMEOUT_SEC})
    asyncio.get_event_loop().create_task(_expire_invite(target.user_id, me.user_id))
    # Also tell the challenged player in VK, in case the game is in the background.
    asyncio.get_event_loop().create_task(
        notify.send_notification(target.user_id, notify.duel_challenge_text(me.name))
    )


async def _expire_invite(target_id: int, from_id: int) -> None:
    await asyncio.sleep(INVITE_TIMEOUT_SEC)
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
    duel_id = str(uuid.uuid4())
    seed = secrets.randbits(32)
    async with SessionLocal() as session:
        ua = await session.get(User, other.user_id)
        ub = await session.get(User, me.user_id)
        if ua is None or ub is None:
            return
        ta = await game.start_run(session, ua, seed=seed, duel_id=duel_id)
        tb = await game.start_run(session, ub, seed=seed, duel_id=duel_id)
    duels[duel_id] = Duel(id=duel_id, a=other.user_id, b=me.user_id)
    start_at = int(time.time() * 1000) + START_DELAY_MS
    for c, ticket, opp in ((other, ta, me), (me, tb, other)):
        c.state = "duel"
        c.duel = duel_id
        await send(c, {"t": "start", "duel": duel_id, "seed": seed, "start_at": start_at, "ticket": ticket, "opponent": public(opp)})


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
