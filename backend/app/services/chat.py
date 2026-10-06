"""Database side of the chat: blocked players, complaints and the automatic mute."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..chat_room import MAX_BLOCKS
from ..core import utcnow
from ..models import ChatBlock, ChatReport, User

REPORT_KEEP_DAYS = 30


async def load_blocks(session: AsyncSession, user_id: int) -> set[int]:
    rows = await session.execute(select(ChatBlock.blocked_id).where(ChatBlock.user_id == user_id))
    return {int(r[0]) for r in rows}


async def list_blocked(session: AsyncSession, user_id: int) -> list[dict]:
    rows = await session.execute(
        select(User.id, User.display_name, User.photo_url, User.profile_deactivated)
        .join(ChatBlock, ChatBlock.blocked_id == User.id)
        .where(ChatBlock.user_id == user_id)
        .order_by(ChatBlock.created_at.desc())
    )
    return [
        {"id": int(r[0]), "name": r[1], "photo": None if r[3] else r[2]}
        for r in rows
    ]


async def block(session: AsyncSession, user_id: int, target_id: int) -> str:
    """'ok', 'self', 'unknown' (no such player) or 'limit'."""
    if target_id == user_id:
        return "self"
    if await session.get(User, target_id) is None:
        return "unknown"
    if await session.get(ChatBlock, (user_id, target_id)) is not None:
        return "ok"
    count = (await session.execute(select(func.count()).select_from(ChatBlock).where(ChatBlock.user_id == user_id))).scalar_one()
    if count >= MAX_BLOCKS:
        return "limit"
    session.add(ChatBlock(user_id=user_id, blocked_id=target_id, created_at=utcnow()))
    await session.commit()
    return "ok"


async def unblock(session: AsyncSession, user_id: int, target_id: int) -> None:
    await session.execute(delete(ChatBlock).where(ChatBlock.user_id == user_id, ChatBlock.blocked_id == target_id))
    await session.commit()


async def add_report(
    session: AsyncSession, reporter_id: int, target_id: int, reason: str, msg_id: int | None, text: str | None
) -> bool:
    """Stores a complaint. False if the reported player does not exist."""
    if await session.get(User, target_id) is None:
        return False
    session.add(
        ChatReport(
            created_at=utcnow(),
            reporter_id=reporter_id,
            target_id=target_id,
            reason=reason,
            msg_id=msg_id,
            text=text[:200] if text else None,
        )
    )
    await session.commit()
    return True


async def set_mute(session: AsyncSession, user_id: int, until: datetime) -> None:
    await session.execute(update(User).where(User.id == user_id).values(chat_muted_until=until))
    await session.commit()


async def purge_old_reports(session: AsyncSession) -> int:
    cut = utcnow() - timedelta(days=REPORT_KEEP_DAYS)
    res = await session.execute(delete(ChatReport).where(ChatReport.created_at < cut))
    await session.commit()
    return int(res.rowcount or 0)


async def delete_player_data(session: AsyncSession, user_id: int) -> None:
    """Explicit deletes so SQLite (tests) and PostgreSQL behave the same."""
    await session.execute(delete(ChatBlock).where((ChatBlock.user_id == user_id) | (ChatBlock.blocked_id == user_id)))
    await session.execute(delete(ChatReport).where((ChatReport.reporter_id == user_id) | (ChatReport.target_id == user_id)))
