"""Business logic for players, runs and rankings. The server is the source of truth."""

from __future__ import annotations

import json
import secrets
import time
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .. import game_config as gc
from ..config import settings
from ..core import (
    RunVerdict,
    aware,
    check_run_token,
    make_run_token,
    old_week_ids,
    utcnow,
    validate_run,
    week_id,
    week_reset_at,
)
from ..deps import ApiError, Caller
from ..models import CoinTx, Event, OwnedCosmetic, Run, User, WeekBest
from ..schemas import RunFinishIn
from . import crown, shop

# ---------- Users ----------


async def get_or_create_user(session: AsyncSession, caller: Caller) -> User:
    now = utcnow()
    user = await session.get(User, caller.user_id)
    if user is None:
        user = User(
            id=caller.user_id,
            created_at=now,
            last_seen_at=now,
            last_platform=caller.platform,
            settings={},
            settings_updated_at=0,
            tutorial_done=False,
            best_all=0,
            best_tier=0,
            total_runs=0,
            last_tier=0,
            best_combo=0,
            total_captures=0,
            items_mask=0,
            item_misses="",
            duel_wins=0,
            profile_deactivated=False,
        )
        session.add(user)
        try:
            await session.commit()
        except IntegrityError:
            # A parallel request created the same player first.
            await session.rollback()
            user = await session.get(User, caller.user_id)
            if user is None:
                raise
    else:
        user.last_seen_at = now
        user.last_platform = caller.platform
        await session.commit()
    return user


async def require_user(session: AsyncSession, caller: Caller, *, lock: bool = False) -> User:
    user = await session.get(User, caller.user_id, with_for_update=lock)
    if user is None:
        raise ApiError(404, "no_player", "Call /session/bootstrap first")
    return user


def consent_ok(user: User) -> bool:
    return (user.consent_version or 0) >= settings.terms_version


def profile_dict(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.display_name,
        "photo": None if user.profile_deactivated else user.photo_url,
    }


# ---------- Items ----------


def parse_misses(raw: str | None) -> list[int]:
    out = [0] * gc.ITEM_COUNT
    for i, part in enumerate((raw or "").split(",")[: gc.ITEM_COUNT]):
        if part.isdigit():
            out[i] = min(99, int(part))
    return out


def update_collection(user: User, picked: int, reached_tier: int) -> None:
    """The wardrobe remembers every item ever found. It is a collection only: no score effect."""
    del reached_tier
    user.items_mask = (user.items_mask or 0) | picked


# ---------- Ranks ----------


async def rank_all(session: AsyncSession, score: int, at: datetime | None) -> int | None:
    if score <= 0:
        return None
    better = or_(User.best_all > score, and_(User.best_all == score, User.best_all_at < at))
    count = await session.scalar(select(func.count()).select_from(User).where(better))
    return int(count or 0) + 1


async def rank_week(session: AsyncSession, wid: str, score: int, at: datetime | None) -> int | None:
    if score <= 0:
        return None
    better = or_(WeekBest.best_score > score, and_(WeekBest.best_score == score, WeekBest.achieved_at < at))
    count = await session.scalar(
        select(func.count()).select_from(WeekBest).where(WeekBest.week_id == wid, better)
    )
    return int(count or 0) + 1


async def week_entry(session: AsyncSession, wid: str, user_id: int) -> WeekBest | None:
    return await session.get(WeekBest, (wid, user_id))


async def player_stats(session: AsyncSession, user: User) -> dict:
    wid = week_id(utcnow())
    wb = await week_entry(session, wid, user.id)
    return {
        "best_all": user.best_all,
        "best_tier": user.best_tier,
        "best_week": wb.best_score if wb else 0,
        "last_score": user.last_score,
        "total_runs": user.total_runs,
        "last_tier": user.last_tier or 0,
        "best_combo": user.best_combo or 0,
        "total_captures": user.total_captures or 0,
        "items_mask": user.items_mask or 0,
        "duel_wins": user.duel_wins or 0,
        "item_misses": parse_misses(user.item_misses),
        "rank_all": await rank_all(session, user.best_all, aware(user.best_all_at)),
        "rank_week": await rank_week(session, wid, wb.best_score, aware(wb.achieved_at)) if wb else None,
    }


# ---------- Runs ----------


async def start_run(session: AsyncSession, user: User, *, seed: int | None = None, duel_id: str | None = None) -> dict:
    if not consent_ok(user):
        raise ApiError(403, "consent_required", "Accept the terms first")
    now = utcnow()
    run = Run(
        id=str(uuid.uuid4()),
        user_id=user.id,
        seed=secrets.randbits(32) if seed is None else seed,
        started_at=now,
        status="started",
        items_start=user.items_mask or 0,
        duel_id=duel_id,
    )
    session.add(run)
    await session.commit()
    started_ts = int(now.timestamp())
    return {
        "run_id": run.id,
        "seed": run.seed,
        "started_at": int(now.timestamp() * 1000),
        "token": make_run_token(settings.run_signing_secret, run.id, user.id, started_ts),
        "items_mask": run.items_start,
        "item_misses": parse_misses(user.item_misses),
    }


def _finish_response(run: Run, user: User, extra: dict) -> dict:
    return {
        "run_id": run.id,
        "status": run.status,
        "reason": (run.flags or "").replace("duel_done:", "").replace("duel_done", "") or None
        if run.status == "rejected"
        else None,
        "score": run.score or 0,
        "best_all": user.best_all,
        "best_tier": user.best_tier,
        **extra,
    }


_last_cleanup = 0.0


async def finish_run(session: AsyncSession, caller: Caller, body: RunFinishIn) -> dict:
    now = utcnow()
    if not check_run_token(settings.run_signing_secret, body.token, body.run_id, caller.user_id, int(now.timestamp())):
        raise ApiError(403, "run_token_invalid", "Run token is invalid or expired")

    # Lock order: user first, then run, so parallel finishes of one player serialize.
    user = await require_user(session, caller, lock=True)
    run = await session.get(Run, body.run_id, with_for_update=True)
    if run is None or run.user_id != caller.user_id:
        raise ApiError(404, "run_not_found", "Run not found")

    wid = week_id(now)
    if run.status in ("finished", "rejected"):
        # Idempotent retry: report the stored outcome.
        stats = await player_stats(session, user)
        paid = await shop.run_payout(session, user.id, run.id)
        await session.commit()
        return _finish_response(
            run,
            user,
            {
                "is_record": False,
                "is_week_record": False,
                "coins": user.coins or 0,
                "coins_earned": paid,
                "new_items": [],
                **_ranks(stats, stats),
            },
        )

    before = await player_stats(session, user)
    server_elapsed_ms = int((now - aware(run.started_at)).total_seconds() * 1000)
    verdict = validate_run(
        score=body.score,
        duration_ms=body.duration_ms,
        server_elapsed_ms=server_elapsed_ms,
        captures=body.captures,
        tier=body.tier,
    )

    run.finished_at = now
    run.duration_ms = body.duration_ms
    run.score = body.score
    run.tier = body.tier
    run.captures = body.captures
    run.max_combo = body.max_combo
    run.input_log = json.dumps(body.input_log, separators=(",", ":"))
    run.items = body.items

    # Items may only come from tiers reached in this run (every run starts with nothing worn).
    if verdict.ok and body.items and body.items >> (body.tier + 1):
        verdict = RunVerdict(False, "items_invalid")

    is_record = False
    is_week_record = False
    coins_earned = 0
    new_items: list[str] = []
    if not verdict.ok:
        run.status = "rejected"
        run.flags = verdict.reason
    else:
        run.status = "finished"
        run.flags = "review" if verdict.review else None
        user.last_score = body.score
        user.last_run_at = now
        user.total_runs += 1
        user.best_tier = max(user.best_tier, body.tier)
        user.last_tier = body.tier
        user.best_combo = max(user.best_combo or 0, min(body.max_combo, body.captures))
        user.total_captures = (user.total_captures or 0) + body.captures
        update_collection(user, body.items, body.tier)
        if body.score > user.best_all:
            user.best_all = body.score
            user.best_all_at = now
            is_record = True
        wb = await week_entry(session, wid, user.id)
        if wb is None and body.score > 0:
            session.add(WeekBest(week_id=wid, user_id=user.id, best_score=body.score, achieved_at=now))
            is_week_record = True
        elif wb is not None and body.score > wb.best_score:
            wb.best_score = body.score
            wb.achieved_at = now
            is_week_record = True
        # Coins: 1 point = 1 coin, paid once per counted run; a new record may open cosmetics.
        coins_earned = await shop.credit_run(session, user, run.id, body.score)
        new_items = await shop.sync_unlocks(session, user)
    await session.commit()

    await _cleanup_weeks(session)
    after = await player_stats(session, user)
    duel = await resolve_duel(session, run.duel_id) if run.duel_id else None
    if is_week_record:
        # A new weekly best may change the first place: move the crown and send the notices.
        await crown.refresh(session)
    return _finish_response(
        run,
        user,
        {
            "is_record": is_record,
            "is_week_record": is_week_record,
            "duel": duel,
            "coins": user.coins or 0,
            "coins_earned": coins_earned,
            "new_items": new_items,
            **_ranks(before, after),
        },
    )


def _ranks(before: dict, after: dict) -> dict:
    return {
        "rank_all": after["rank_all"],
        "rank_week": after["rank_week"],
        "prev_rank_all": before["rank_all"],
        "prev_rank_week": before["rank_week"],
        "best_week": after["best_week"],
    }


async def _cleanup_weeks(session: AsyncSession) -> None:
    """Lazy cleanup: at most once an hour per process, drop weeks older than the retention window."""
    global _last_cleanup
    if time.monotonic() - _last_cleanup < 3600:
        return
    _last_cleanup = time.monotonic()
    await session.execute(delete(WeekBest).where(WeekBest.week_id < old_week_ids(utcnow())))
    await session.commit()
    await crown.prune(session)


# ---------- Duels ----------

# Called with the outcome when a duel is decided: (duel_id, {user_id: "win"|"loss"|"draw"}).
duel_listeners: list = []


async def resolve_duel(session: AsyncSession, duel_id: str) -> dict:
    """Decides a duel once both runs are over (finished, rejected or abandoned).

    The winner gets +1 duel win exactly once. A rejected or abandoned run loses.
    Returns {"status": "pending"} until both sides are done.
    """
    result = await session.execute(select(Run).where(Run.duel_id == duel_id).with_for_update())
    runs = list(result.scalars())
    if len(runs) != 2 or any(r.status == "started" for r in runs):
        await session.commit()
        return {"status": "pending"}
    if any(r.flags == "duel_done" or (r.flags or "").startswith("duel_done") for r in runs):
        await session.commit()
        return {"status": "done", "outcome": _outcomes(runs)}

    outcome = _outcomes(runs)
    now = utcnow()
    for r in runs:
        if outcome.get(r.user_id) == "win":
            user = await session.get(User, r.user_id, with_for_update=True)
            if user is not None:
                user.duel_wins = (user.duel_wins or 0) + 1
                user.duel_wins_at = now
        # Mark both runs so the duel is never counted twice (keeps the review flag readable).
        r.flags = "duel_done" if not r.flags or r.flags == "review" else f"duel_done:{r.flags}"[:64]
    await session.commit()
    for fn in duel_listeners:
        try:
            fn(duel_id, outcome)
        except Exception:  # noqa: BLE001 - notifications must never break a finish
            pass
    return {"status": "done", "outcome": outcome}


def _outcomes(runs: list[Run]) -> dict[int, str]:
    a, b = runs
    def score(r: Run) -> int:
        return (r.score or 0) if r.status == "finished" else -1
    sa_, sb = score(a), score(b)
    if sa_ == sb:
        return {a.user_id: "draw", b.user_id: "draw"}
    return {a.user_id: "win" if sa_ > sb else "loss", b.user_id: "win" if sb > sa_ else "loss"}


async def abandon_duel_run(session: AsyncSession, duel_id: str, user_id: int) -> None:
    """A player left a duel before finishing: their run is abandoned (counts as a loss)."""
    result = await session.execute(
        select(Run).where(Run.duel_id == duel_id, Run.user_id == user_id).with_for_update()
    )
    run = result.scalars().first()
    if run is not None and run.status == "started":
        run.status = "abandoned"
        run.finished_at = utcnow()
    await session.commit()
    await resolve_duel(session, duel_id)


async def duel_rank(session: AsyncSession, user: User) -> tuple[int | None, int | None]:
    wins = user.duel_wins or 0
    if wins <= 0:
        return None, None
    better = await session.scalar(select(func.count()).select_from(User).where(User.duel_wins > wins))
    nxt = await session.scalar(
        select(User.duel_wins).where(User.duel_wins > wins).order_by(User.duel_wins.asc()).limit(1)
    )
    return int(better or 0) + 1, (nxt - wins + 1) if nxt is not None else None


# ---------- Leaderboard ----------


@dataclass
class _Cached:
    at: float
    rows: list[dict]


_cache: dict[str, _Cached] = {}


def clear_leaderboard_cache() -> None:
    _cache.clear()


async def leaderboard(session: AsyncSession, user: User, scope: str) -> tuple[dict, list[int]]:
    """Returns the response and the ids whose VK profiles look stale."""
    now = utcnow()
    wid = week_id(now)
    key = f"{scope}:{wid}"
    cached = _cache.get(key)
    if cached and time.monotonic() - cached.at < gc.LEADERBOARD_CACHE_SEC:
        rows = cached.rows
    else:
        rows = await _top_rows(session, scope, wid)
        _cache[key] = _Cached(time.monotonic(), rows)

    if scope == "duels":
        my_rank, gap = await duel_rank(session, user)
        my_score = user.duel_wins or 0
        me = {
            "score": my_score,
            "rank": my_rank,
            "next_rank": (my_rank - 1) if my_rank and my_rank > 1 else None,
            "gap_to_next": gap,
        }
        stale_before = now.timestamp() - gc.PROFILE_TTL_SEC
        stale = [r["user_id"] for r in rows if r["_synced"] is None or r["_synced"] < stale_before]
        public_rows = [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]
        return {
            "scope": scope,
            "week_id": wid,
            "reset_at": int(week_reset_at(now).timestamp() * 1000),
            "server_time": int(now.timestamp() * 1000),
            "rows": public_rows,
            "me": me,
        }, stale
    if scope == "week":
        wb = await week_entry(session, wid, user.id)
        my_score = wb.best_score if wb else 0
        my_at = aware(wb.achieved_at) if wb else None
        my_rank = await rank_week(session, wid, my_score, my_at) if wb else None
        nxt = await _next_above_week(session, wid, my_score, my_at) if wb else None
    else:
        my_score = user.best_all
        my_at = aware(user.best_all_at)
        my_rank = await rank_all(session, my_score, my_at)
        nxt = await _next_above_all(session, my_score, my_at) if my_rank else None

    me = {
        "score": my_score,
        "rank": my_rank,
        "next_rank": (my_rank - 1) if my_rank and my_rank > 1 else None,
        "gap_to_next": (nxt - my_score + 1) if nxt is not None else None,
    }
    stale_before = now.timestamp() - gc.PROFILE_TTL_SEC
    stale = [r["user_id"] for r in rows if r["_synced"] is None or r["_synced"] < stale_before]
    public_rows = [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]
    response = {
        "scope": scope,
        "week_id": wid,
        "reset_at": int(week_reset_at(now).timestamp() * 1000),
        "server_time": int(now.timestamp() * 1000),
        "rows": public_rows,
        "me": me,
    }
    return response, stale


async def _top_rows(session: AsyncSession, scope: str, wid: str) -> list[dict]:
    if scope == "duels":
        q = (
            select(User.duel_wins, User)
            .where(User.duel_wins > 0)
            .order_by(User.duel_wins.desc(), User.duel_wins_at.asc())
            .limit(gc.LEADERBOARD_SIZE)
        )
    elif scope == "week":
        q = (
            select(WeekBest.best_score, User)
            .join(User, User.id == WeekBest.user_id)
            .where(WeekBest.week_id == wid, WeekBest.best_score > 0)
            .order_by(WeekBest.best_score.desc(), WeekBest.achieved_at.asc())
            .limit(gc.LEADERBOARD_SIZE)
        )
    else:
        q = (
            select(User.best_all, User)
            .where(User.best_all > 0)
            .order_by(User.best_all.desc(), User.best_all_at.asc())
            .limit(gc.LEADERBOARD_SIZE)
        )
    result = await session.execute(q)
    rows = []
    for i, (score, u) in enumerate(result.all(), start=1):
        synced = aware(u.profile_synced_at)
        rows.append(
            {
                "rank": i,
                "user_id": u.id,
                "name": u.display_name,
                "photo": None if u.profile_deactivated else u.photo_url,
                "deactivated": bool(u.profile_deactivated),
                "score": int(score),
                "_synced": synced.timestamp() if synced else None,
            }
        )
    return rows


async def _next_above_all(session: AsyncSession, score: int, at: datetime | None) -> int | None:
    better = or_(User.best_all > score, and_(User.best_all == score, User.best_all_at < at))
    q = select(User.best_all).where(better).order_by(User.best_all.asc(), User.best_all_at.desc()).limit(1)
    return await session.scalar(q)


async def _next_above_week(session: AsyncSession, wid: str, score: int, at: datetime | None) -> int | None:
    better = or_(WeekBest.best_score > score, and_(WeekBest.best_score == score, WeekBest.achieved_at < at))
    q = (
        select(WeekBest.best_score)
        .where(WeekBest.week_id == wid, better)
        .order_by(WeekBest.best_score.asc(), WeekBest.achieved_at.desc())
        .limit(1)
    )
    return await session.scalar(q)


# ---------- Misc ----------


async def delete_player(session: AsyncSession, caller: Caller) -> None:
    # Explicit deletes so SQLite (tests) and PostgreSQL behave the same.
    await session.execute(delete(CoinTx).where(CoinTx.user_id == caller.user_id))
    await session.execute(delete(OwnedCosmetic).where(OwnedCosmetic.user_id == caller.user_id))
    await session.execute(delete(Run).where(Run.user_id == caller.user_id))
    await session.execute(delete(WeekBest).where(WeekBest.user_id == caller.user_id))
    await session.execute(delete(User).where(User.id == caller.user_id))
    await session.commit()
    clear_leaderboard_cache()


async def log_event(session: AsyncSession, type_: str, platform: str, value: int | None) -> None:
    session.add(Event(created_at=utcnow(), type=type_, platform=platform[:32] or None, value=value))
    await session.commit()
