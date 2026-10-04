"""The crown of the weekly leader.

Whoever is first in the weekly leaderboard wears a crown (menu hero and in the game). The
current holder is stored in one row. After every finished run and on every session start the
holder is compared with the real leader; when it changed, the old holder loses the crown and
gets a notice (in the game, and a VK notification when allowed), and the new one is told too.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import aware, utcnow, week_id
from ..models import CrownNotice, CrownState, User, WeekBest
from . import notify

log = logging.getLogger("crown")

NOTICE_TTL_DAYS = 14
_tasks: set[asyncio.Task] = set()


def _name(user: User | None) -> str:
    return ((user.display_name if user else None) or "Игрок").strip()[:60]


async def weekly_leader(session: AsyncSession, wid: str) -> int | None:
    """User id of the first place of the week (same tie-break as the leaderboard)."""
    row = await session.execute(
        select(WeekBest.user_id)
        .where(WeekBest.week_id == wid, WeekBest.best_score > 0)
        .order_by(WeekBest.best_score.desc(), WeekBest.achieved_at.asc())
        .limit(1)
    )
    return row.scalar_one_or_none()


async def _state(session: AsyncSession) -> CrownState:
    st = await session.scalar(select(CrownState).where(CrownState.id == 1).with_for_update())
    if st is None:
        st = CrownState(id=1, week_id="", holder_id=None, since=None)
        session.add(st)
        try:
            await session.flush()
        except IntegrityError:  # another request created it first
            await session.rollback()
            st = await session.scalar(select(CrownState).where(CrownState.id == 1).with_for_update())
            assert st is not None
    return st


async def refresh(session: AsyncSession) -> int | None:
    """Brings the stored holder in line with the leaderboard. Returns the holder id."""
    now = utcnow()
    wid = week_id(now)
    leader = await weekly_leader(session, wid)
    st = await _state(session)
    if st.holder_id == leader and (st.week_id == wid or leader is None):
        st.week_id = wid
        await session.commit()
        return leader

    prev = st.holder_id
    new_user = await session.get(User, leader) if leader else None
    st.holder_id = leader
    st.week_id = wid
    st.since = now

    jobs: list[tuple[int, str]] = []
    prev_user = await session.get(User, prev) if prev else None
    if prev_user is not None and prev != leader:
        if leader:
            session.add(CrownNotice(user_id=prev, kind="lost", other_name=_name(new_user), created_at=now))
            jobs.append((prev, notify.crown_lost_text(_name(new_user))))
        else:
            session.add(CrownNotice(user_id=prev, kind="expired", other_name=None, created_at=now))
            jobs.append((prev, notify.crown_expired_text()))
    if leader and leader != prev:
        session.add(CrownNotice(user_id=leader, kind="won", other_name=None, created_at=now))
        jobs.append((leader, notify.crown_won_text()))
    await session.commit()

    if jobs:
        task = asyncio.create_task(_send(jobs))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
    return leader


async def _send(jobs: list[tuple[int, str]]) -> None:
    for uid, text in jobs:
        try:
            await notify.send_notification(uid, text)
        except Exception:  # noqa: BLE001 - best effort
            log.warning("crown notification failed")


async def take_notices(session: AsyncSession, user_id: int) -> list[dict]:
    """Pending crown messages of the player; they are deleted once handed over."""
    rows = (
        await session.scalars(
            select(CrownNotice).where(CrownNotice.user_id == user_id).order_by(CrownNotice.id).limit(5)
        )
    ).all()
    out = [{"kind": r.kind, "name": r.other_name} for r in rows]
    if rows:
        await session.execute(delete(CrownNotice).where(CrownNotice.user_id == user_id))
        await session.commit()
    return out


async def info(session: AsyncSession, user: User) -> dict:
    """Everything the client needs: am I crowned, who is, and notices for me."""
    holder_id = await refresh(session)
    holder = await session.get(User, holder_id) if holder_id else None
    return {
        "crown": holder_id == user.id,
        "holder": None
        if holder is None
        else {
            "id": holder.id,
            "name": holder.display_name,
            "photo": None if holder.profile_deactivated else holder.photo_url,
        },
        "notices": await take_notices(session, user.id),
    }


async def prune(session: AsyncSession) -> None:
    from datetime import timedelta

    await session.execute(delete(CrownNotice).where(CrownNotice.created_at < utcnow() - timedelta(days=NOTICE_TTL_DAYS)))
    await session.commit()


__all__ = ["refresh", "take_notices", "info", "weekly_leader", "prune", "aware"]
