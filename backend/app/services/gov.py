"""The government: a weekly election of the mayor of the game, and what the mayor and his assistants get.

The week runs from Monday 00:00 to the next Monday 00:00, Moscow time (UTC+3, no daylight saving).
  Monday - Friday 18:00   candidacy: a player who fulfils the conditions becomes a candidate
  Friday 18:00 - Sunday   voting (candidacy is closed)
  Monday 00:00            the votes are counted; the mayor of the new week takes the post
A mayor cannot be mayor two weeks in a row, and neither can the assistants he chose be assistants
two weeks in a row.
"""

from __future__ import annotations

import random
import time
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import cosmetics, tunables
from ..core import utcnow
from ..deps import ApiError
from ..models import (
    GovAssistant,
    GovCandidate,
    GovElection,
    GovProgress,
    GovRing,
    GovTerm,
    GovVote,
    Notification,
    User,
    WeekBest,
)

MSK = timezone(timedelta(hours=3))
MAX_ASSISTANTS = 4
PLAY_COLORS = ("default", "fire", "ice", "emerald")
# The mayor's bonus works while the mayor is in the game: his client pings the server every minute.
PING_FRESH_SEC = 150


def now() -> datetime:
    """The current time (a function, so that tests can change it)."""
    return utcnow()


def week_start(dt: datetime) -> date:
    """The Monday (Moscow time) of the week that contains `dt`."""
    local = dt.astimezone(MSK).date()
    return local - timedelta(days=local.weekday())


def week_key(d: date) -> str:
    return d.isoformat()


def voting_opens(d: date) -> datetime:
    """Friday 18:00 Moscow time of the week that starts on Monday `d`."""
    return datetime(d.year, d.month, d.day, 18, tzinfo=MSK) + timedelta(days=4)


def week_ends(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=MSK) + timedelta(days=7)


def phase(dt: datetime) -> str:
    return "voting" if dt >= voting_opens(week_start(dt)) else "candidacy"


# ---------------------------------------------------------------- the current term, kept in memory
current: dict = {"week": "", "mayor_id": None, "assistants": set(), "play_color": "default", "bonus_on": False}
_mayor_ping = -1e9


def role_of(user_id: int) -> str | None:
    """'mayor', 'assistant' or None for the current term (no database access)."""
    if current["mayor_id"] == user_id:
        return "mayor"
    return "assistant" if user_id in current["assistants"] else None


def touch(user_id: int) -> None:
    """The mayor is in the game now."""
    global _mayor_ping
    if current["mayor_id"] == user_id:
        _mayor_ping = time.monotonic()


def bonus_active() -> bool:
    return bool(current["mayor_id"]) and bool(current["bonus_on"]) and time.monotonic() - _mayor_ping < PING_FRESH_SEC


async def refresh(session: AsyncSession) -> None:
    """Reads the term of the current week into memory."""
    wk = week_key(week_start(now()))
    term = await session.get(GovTerm, wk)
    assistants: set[int] = set()
    if term is not None:
        rows = await session.execute(
            select(GovAssistant.user_id).where(GovAssistant.term_week == wk, GovAssistant.status == "accepted")
        )
        assistants = {int(u) for (u,) in rows}
    current.update(
        week=wk,
        mayor_id=term.mayor_id if term else None,
        assistants=assistants,
        play_color=term.play_color if term else "default",
        bonus_on=bool(term.bonus_on) if term else False,
    )


# ---------------------------------------------------------------- notifications
def notify(session: AsyncSession, user_id: int | None, kind: str, payload: dict | None = None) -> None:
    session.add(Notification(user_id=user_id, kind=kind, payload=payload or {}, created_at=utcnow()))


async def public_user(session: AsyncSession, user_id: int | None) -> dict | None:
    if not user_id:
        return None
    u = await session.get(User, user_id)
    if u is None:
        return None
    return {"id": u.id, "name": u.display_name, "photo": None if u.profile_deactivated else u.photo_url}


# ---------------------------------------------------------------- progress that counts for the election
async def _progress(session: AsyncSession, wk: str, user_id: int, create: bool = False) -> GovProgress | None:
    row = await session.get(GovProgress, (wk, user_id))
    if row is None and create:
        row = GovProgress(week=wk, user_id=user_id, duel_wins=0, best_solo=0, runs=0)
        session.add(row)
    return row


async def add_run(session: AsyncSession, user_id: int, score: int, solo: bool) -> None:
    """A counted run: the best solo score and the number of runs of the week."""
    row = await _progress(session, week_key(week_start(now())), user_id, create=True)
    row.runs = (row.runs or 0) + 1
    if solo:
        row.best_solo = max(row.best_solo or 0, score)


async def add_duel_win(session: AsyncSession, user_id: int) -> None:
    row = await _progress(session, week_key(week_start(now())), user_id, create=True)
    row.duel_wins = (row.duel_wins or 0) + 1


async def roll_ring(session: AsyncSession, user_id: int) -> bool:
    """At the start of a solo run: will the candidate's ring lie on a platform in it? Rare, and a player
    who already has this week's ring never gets another."""
    wk = week_key(week_start(now()))
    if await session.get(GovRing, (wk, user_id)) is not None:
        return False
    return random.random() < tunables.get("gov_ring_chance")


async def grant_ring(session: AsyncSession, user_id: int, score: int) -> bool:
    """The ring was picked up in a counted solo run (and the run was good enough): it is the player's for the week."""
    wk = week_key(week_start(now()))
    if score < tunables.get("gov_ring_min_score"):
        return False
    if await session.get(GovRing, (wk, user_id)) is not None:
        return False
    session.add(GovRing(week=wk, user_id=user_id, found_at=utcnow()))
    return True


# ---------------------------------------------------------------- the weekly clock
async def tick(session: AsyncSession) -> None:
    """Moves the election forward: announces the voting, counts the votes on Monday, starts the new term."""
    dt = now()
    start = week_start(dt)
    wk = week_key(start)
    prev = week_key(start - timedelta(days=7))
    changed = False
    old = await session.get(GovElection, prev)
    if old is not None and not old.closed:
        await _close(session, old, wk)
        changed = True
    if await session.get(GovTerm, wk) is None:
        session.add(GovTerm(week=wk, mayor_id=None, bonus_on=False, play_color="default"))
        changed = True
    # Invitations that were not answered in time.
    cutoff = utcnow() - timedelta(hours=tunables.get("gov_invite_hours"))
    stale = await session.execute(
        select(GovAssistant).where(GovAssistant.term_week == wk, GovAssistant.status == "invited", GovAssistant.invited_at < cutoff)
    )
    for a in stale.scalars():
        a.status = "declined"
        a.answered_at = utcnow()
        changed = True
    if dt >= voting_opens(start):
        el = await session.get(GovElection, wk)
        if el is None:
            el = GovElection(week=wk, voting_notified=False, closed=False)
            session.add(el)
        if not el.voting_notified:
            el.voting_notified = True
            notify(session, None, "voting_started", {})
            changed = True
    if changed:
        await session.commit()
    await refresh(session)


async def _close(session: AsyncSession, el: GovElection, new_week: str) -> None:
    """Counts the votes of a finished election and gives the post to the winner."""
    cands = [int(u) for (u,) in await session.execute(select(GovCandidate.user_id).where(GovCandidate.week == el.week))]
    winner: int | None = None
    if len(cands) == 1:
        winner = cands[0]
    elif cands:
        votes = {c: 0 for c in cands}
        for (cid,) in await session.execute(select(GovVote.candidate_id).where(GovVote.week == el.week)):
            if cid in votes:
                votes[int(cid)] += 1

        async def tiebreak(uid: int) -> tuple:
            u = await session.get(User, uid)
            wb = await session.scalar(select(WeekBest.best_score).where(WeekBest.user_id == uid).order_by(WeekBest.achieved_at.desc()).limit(1))
            # More votes, then a higher place in the duel rating (more duel wins), then a higher weekly result.
            return (votes[uid], (u.duel_wins if u else 0) or 0, wb or 0)

        scored = [(await tiebreak(c), c) for c in cands]
        scored.sort(reverse=True)
        ranked = [c for _, c in scored]
        winner = ranked[0]
    el.closed = True
    el.winner_id = winner
    term = await session.get(GovTerm, new_week)
    if term is None:
        term = GovTerm(week=new_week, mayor_id=winner, bonus_on=False, play_color="default")
        session.add(term)
    else:
        term.mayor_id = winner
    if winner:
        who = await public_user(session, winner)
        notify(session, None, "mayor_elected", {"user": who})
        notify(session, winner, "mayor_you", {})
    else:
        notify(session, None, "no_mayor", {})


# ---------------------------------------------------------------- candidacy
async def eligibility(session: AsyncSession, user: User) -> dict:
    """What the player has for the candidacy, and whether he may apply now."""
    dt = now()
    start = week_start(dt)
    wk = week_key(start)
    prog = await session.get(GovProgress, (wk, user.id))
    need_wins = tunables.get("gov_apply_duel_wins")
    need_rec = tunables.get("gov_apply_record")
    have_ring = await session.get(GovRing, (wk, user.id)) is not None
    # The mayor in office now cannot be elected again for the next term (not two times in a row).
    cur_term = await session.get(GovTerm, wk)
    was_mayor = cur_term is not None and cur_term.mayor_id == user.id
    is_candidate = await session.get(GovCandidate, (wk, user.id)) is not None
    ph = phase(dt)
    wins = (prog.duel_wins if prog else 0) or 0
    rec = (prog.best_solo if prog else 0) or 0
    reason = None
    if is_candidate:
        reason = "already"
    elif ph != "candidacy":
        reason = "voting"
    elif was_mayor:
        reason = "was_mayor"
    elif wins < need_wins or rec < need_rec or not have_ring:
        reason = "conditions"
    return {
        "phase": ph,
        "wins": {"have": wins, "need": need_wins},
        "record": {"have": rec, "need": need_rec},
        "ring": have_ring,
        "is_candidate": is_candidate,
        "can_apply": reason is None,
        "reason": reason,
    }


async def apply(session: AsyncSession, user: User) -> None:
    await tick(session)
    el = await eligibility(session, user)
    if not el["can_apply"]:
        # The code names the reason: conditions | voting | was_mayor | already
        raise ApiError(409, el["reason"] or "conditions", "Cannot apply")
    wk = week_key(week_start(now()))
    session.add(GovCandidate(week=wk, user_id=user.id, created_at=utcnow()))
    if await session.get(GovElection, wk) is None:
        session.add(GovElection(week=wk, voting_notified=False, closed=False))
    await session.commit()


async def vote(session: AsyncSession, user: User, candidate_id: int) -> None:
    await tick(session)
    dt = now()
    wk = week_key(week_start(dt))
    if phase(dt) != "voting":
        raise ApiError(409, "not_voting", "Voting has not started")
    if candidate_id == user.id:
        raise ApiError(409, "self_vote", "You cannot vote for yourself")
    if await session.get(GovCandidate, (wk, candidate_id)) is None:
        raise ApiError(404, "no_candidate", "Not a candidate")
    prog = await session.get(GovProgress, (wk, user.id))
    created = user.created_at if user.created_at.tzinfo else user.created_at.replace(tzinfo=timezone.utc)
    if ((prog.runs if prog else 0) or 0) < tunables.get("gov_vote_min_runs") or now() - created < timedelta(days=tunables.get("gov_vote_min_age_days")):
        raise ApiError(403, "cannot_vote", "Play more to vote")
    row = await session.get(GovVote, (wk, user.id))
    if row is None:
        session.add(GovVote(week=wk, voter_id=user.id, candidate_id=candidate_id, created_at=utcnow()))
    else:
        row.candidate_id = candidate_id
        row.created_at = utcnow()
    await session.commit()


# ---------------------------------------------------------------- the mayor's management
def _require_mayor(user: User) -> None:
    if role_of(user.id) != "mayor":
        raise ApiError(403, "not_mayor", "Only the mayor can do this")


async def _active_assistants(session: AsyncSession, wk: str) -> list[GovAssistant]:
    rows = await session.execute(
        select(GovAssistant).where(GovAssistant.term_week == wk, GovAssistant.status.in_(("invited", "accepted"))).order_by(GovAssistant.id)
    )
    return list(rows.scalars())


async def find_players(session: AsyncSession, user: User, which: str, q: str, chat_ids: set[int]) -> list[dict]:
    """Players the mayor may want as assistants: only those who played this week."""
    wk = week_key(week_start(now()))
    prev = week_key(week_start(now()) - timedelta(days=7))
    prev_assist = {int(u) for (u,) in await session.execute(select(GovAssistant.user_id).where(GovAssistant.term_week == prev, GovAssistant.status == "accepted"))}
    played = select(GovProgress.user_id).where(GovProgress.week == wk, GovProgress.runs > 0)
    stmt = select(User).where(User.id.in_(played), User.id != user.id)
    if which == "top":
        stmt = stmt.join(GovProgress, (GovProgress.user_id == User.id) & (GovProgress.week == wk)).order_by(GovProgress.best_solo.desc())
    elif which == "chat":
        stmt = stmt.where(User.id.in_(chat_ids or {0}))
    elif which == "rivals":
        from ..models import Run

        mine = select(Run.duel_id).where(Run.user_id == user.id, Run.duel_id.is_not(None))
        stmt = stmt.where(User.id.in_(select(Run.user_id).where(Run.duel_id.in_(mine), Run.user_id != user.id)))
    if q:
        stmt = stmt.where(func.lower(User.display_name).like(f"%{q.lower()[:30]}%"))
    rows = await session.execute(stmt.limit(20))
    out = []
    for u in rows.scalars().unique():
        if u.id in prev_assist or role_of(u.id) is not None:
            continue
        out.append({"id": u.id, "name": u.display_name, "photo": None if u.profile_deactivated else u.photo_url})
    return out


async def invite_assistant(session: AsyncSession, mayor: User, target_id: int) -> dict:
    await tick(session)
    _require_mayor(mayor)
    wk = week_key(week_start(now()))
    prev = week_key(week_start(now()) - timedelta(days=7))
    if target_id == mayor.id or role_of(target_id) is not None:
        raise ApiError(409, "bad_target", "This player already has a post")
    target = await session.get(User, target_id)
    if target is None:
        raise ApiError(404, "no_player", "Player not found")
    prog = await session.get(GovProgress, (wk, target_id))
    if not prog or (prog.runs or 0) <= 0:
        raise ApiError(409, "not_active", "The player has not played this week")
    if await session.scalar(select(func.count()).select_from(GovAssistant).where(GovAssistant.term_week == prev, GovAssistant.user_id == target_id, GovAssistant.status == "accepted")):
        raise ApiError(409, "was_assistant", "He was an assistant last week")
    active = await _active_assistants(session, wk)
    if len(active) >= MAX_ASSISTANTS:
        raise ApiError(409, "full", "All places are taken")
    row = await session.scalar(select(GovAssistant).where(GovAssistant.term_week == wk, GovAssistant.user_id == target_id))
    if row is not None and row.status in ("invited", "accepted"):
        raise ApiError(409, "already", "Already invited")
    if row is None:
        session.add(GovAssistant(term_week=wk, user_id=target_id, status="invited", invited_at=utcnow()))
    else:
        row.status = "invited"
        row.invited_at = utcnow()
        row.answered_at = None
    who = await public_user(session, mayor.id)
    notify(session, target_id, "assistant_invite", {"from": who})
    await session.commit()
    return await public_user(session, target_id) or {}


async def respond(session: AsyncSession, user: User, accept: bool) -> dict:
    await tick(session)
    wk = week_key(week_start(now()))
    row = await session.scalar(select(GovAssistant).where(GovAssistant.term_week == wk, GovAssistant.user_id == user.id, GovAssistant.status == "invited"))
    if row is None:
        raise ApiError(404, "no_invite", "No invitation")
    row.status = "accepted" if accept else "declined"
    row.answered_at = utcnow()
    who = await public_user(session, user.id)
    term = await session.get(GovTerm, wk)
    if term and term.mayor_id:
        notify(session, term.mayor_id, "assistant_answer", {"user": who, "accepted": accept})
    if accept:
        notify(session, None, "assistant_set", {"user": who})
    await session.commit()
    await refresh(session)
    return who or {}


async def remove_assistant(session: AsyncSession, mayor: User, target_id: int) -> None:
    await tick(session)
    _require_mayor(mayor)
    wk = week_key(week_start(now()))
    row = await session.scalar(select(GovAssistant).where(GovAssistant.term_week == wk, GovAssistant.user_id == target_id, GovAssistant.status.in_(("invited", "accepted"))))
    if row is None:
        raise ApiError(404, "no_assistant", "Not your assistant")
    row.status = "removed"
    row.answered_at = utcnow()
    notify(session, target_id, "assistant_removed", {})
    await session.commit()
    await refresh(session)


async def set_settings(session: AsyncSession, mayor: User, bonus: bool | None, play_color: str | None) -> None:
    await tick(session)
    _require_mayor(mayor)
    term = await session.get(GovTerm, week_key(week_start(now())))
    if term is None:
        raise ApiError(404, "no_term", "No term")
    if bonus is not None:
        term.bonus_on = bonus
    if play_color is not None:
        if play_color not in PLAY_COLORS:
            raise ApiError(400, "bad_color", "Unknown color")
        term.play_color = play_color
    await session.commit()
    await refresh(session)


# ---------------------------------------------------------------- what the client shows
async def state(session: AsyncSession, user: User) -> dict:
    await tick(session)
    dt = now()
    start = week_start(dt)
    wk = week_key(start)
    ph = phase(dt)
    cands = []
    rows = await session.execute(select(GovCandidate).where(GovCandidate.week == wk).order_by(GovCandidate.created_at))
    for c in rows.scalars():
        p = await public_user(session, c.user_id)
        if p:
            cands.append(p)
    my_vote = await session.scalar(select(GovVote.candidate_id).where(GovVote.week == wk, GovVote.voter_id == user.id))
    assist = []
    for a in await _active_assistants(session, wk):
        p = await public_user(session, a.user_id)
        if p:
            assist.append({**p, "status": a.status})
    my_invite = await session.scalar(select(GovAssistant.id).where(GovAssistant.term_week == wk, GovAssistant.user_id == user.id, GovAssistant.status == "invited"))
    prog = await session.get(GovProgress, (wk, user.id))
    created = user.created_at if user.created_at.tzinfo else user.created_at.replace(tzinfo=timezone.utc)
    can_vote = ph == "voting" and ((prog.runs if prog else 0) or 0) >= tunables.get("gov_vote_min_runs") and now() - created >= timedelta(days=tunables.get("gov_vote_min_age_days"))
    return {
        "week": wk,
        "phase": ph,
        "voting_opens_at": int(voting_opens(start).timestamp() * 1000),
        "ends_at": int(week_ends(start).timestamp() * 1000),
        "mayor": await public_user(session, current["mayor_id"]),
        "assistants": assist,
        "candidates": cands,
        "me": {
            "role": role_of(user.id),
            "eligibility": await eligibility(session, user),
            "my_vote": my_vote,
            "can_vote": can_vote,
            "runs": (prog.runs if prog else 0) or 0,
            "vote_need_runs": tunables.get("gov_vote_min_runs"),
            "invited": my_invite is not None,
        },
        "settings": {"bonus_on": bool(current["bonus_on"]), "play_color": current["play_color"], "colors": list(PLAY_COLORS)},
        "bonus_active": bonus_active(),
        "bonus_percent": tunables.get("gov_bonus_percent"),
    }


def brief(user_id: int) -> dict:
    """The small part that goes with the bootstrap (memory only)."""
    return {
        "role": role_of(user_id),
        "play_color": current["play_color"],
        "bonus_active": bonus_active(),
        "bonus_percent": tunables.get("gov_bonus_percent"),
        "mayor_id": current["mayor_id"],
    }


# ---------------------------------------------------------------- the bell
async def notifications(session: AsyncSession, user: User) -> dict:
    since = utcnow() - timedelta(days=14)
    rows = await session.execute(
        select(Notification)
        .where((Notification.user_id.is_(None)) | (Notification.user_id == user.id), Notification.created_at > since)
        .order_by(Notification.id.desc())
        .limit(40)
    )
    items = [
        {"id": n.id, "kind": n.kind, "payload": n.payload, "at": int(n.created_at.timestamp() * 1000), "unread": n.id > (user.notif_read_id or 0), "personal": n.user_id is not None}
        for n in rows.scalars()
    ]
    return {"items": items, "unread": sum(1 for i in items if i["unread"])}


async def unread_count(session: AsyncSession, user: User) -> int:
    since = utcnow() - timedelta(days=14)
    n = await session.scalar(
        select(func.count()).select_from(Notification).where(
            (Notification.user_id.is_(None)) | (Notification.user_id == user.id), Notification.created_at > since, Notification.id > (user.notif_read_id or 0)
        )
    )
    return int(n or 0)


async def mark_read(session: AsyncSession, user: User) -> None:
    top = await session.scalar(select(func.max(Notification.id)))
    user.notif_read_id = int(top or 0)
    await session.commit()
