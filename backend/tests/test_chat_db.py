"""Chat moderation storage: blocked players, complaints, cleanup and data deletion."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.chat_room import MAX_BLOCKS
from app.core import utcnow
from app.db import SessionLocal
from app.models import ChatBlock, ChatReport, User
from app.services import chat as chat_service

from .conftest import headers, ready_player


async def test_block_list_unblock(client):
    for uid in (301, 302, 303):
        await ready_player(client, uid)
    async with SessionLocal() as s:
        assert await chat_service.block(s, 301, 302) == "ok"
        assert await chat_service.block(s, 301, 302) == "ok"  # twice is harmless
        assert await chat_service.block(s, 301, 303) == "ok"
        assert await chat_service.block(s, 301, 301) == "self"
        assert await chat_service.block(s, 301, 999_999) == "unknown"
        assert await chat_service.load_blocks(s, 301) == {302, 303}
        assert await chat_service.load_blocks(s, 302) == set()  # one-way
        names = [r["id"] for r in await chat_service.list_blocked(s, 301)]
        assert sorted(names) == [302, 303]
        await chat_service.unblock(s, 301, 302)
        assert await chat_service.load_blocks(s, 301) == {303}


async def test_block_limit(client):
    await ready_player(client, 310)
    async with SessionLocal() as s:
        now = utcnow()
        for i in range(MAX_BLOCKS):
            s.add(User(id=10_000 + i, created_at=now, last_seen_at=now))
        await s.flush()
        for i in range(MAX_BLOCKS):
            s.add(ChatBlock(user_id=310, blocked_id=10_000 + i, created_at=now))
        s.add(User(id=20_000, created_at=now, last_seen_at=now))
        await s.commit()
        assert await chat_service.block(s, 310, 20_000) == "limit"


async def test_report_is_stored_and_unknown_target_refused(client):
    await ready_player(client, 320)
    await ready_player(client, 321)
    async with SessionLocal() as s:
        assert await chat_service.add_report(s, 320, 321, "spam", 5, "x" * 500) is True
        assert await chat_service.add_report(s, 320, 999_998, "spam", None, None) is False
        row = (await s.execute(select(ChatReport))).scalar_one()
        assert (row.reporter_id, row.target_id, row.reason, row.msg_id, row.status) == (320, 321, "spam", 5, "new")
        assert len(row.text) == 200  # the snapshot is cut to the column size


async def test_old_reports_are_deleted(client):
    await ready_player(client, 330)
    await ready_player(client, 331)
    async with SessionLocal() as s:
        old = utcnow() - timedelta(days=chat_service.REPORT_KEEP_DAYS + 1)
        s.add(ChatReport(created_at=old, reporter_id=330, target_id=331, reason="words", text="old"))
        s.add(ChatReport(created_at=utcnow(), reporter_id=330, target_id=331, reason="words", text="new"))
        await s.commit()
        assert await chat_service.purge_old_reports(s) == 1
        left = (await s.execute(select(ChatReport.text))).scalars().all()
        assert left == ["new"]


async def test_mute_is_saved(client):
    await ready_player(client, 340)
    until = datetime.now(timezone.utc) + timedelta(hours=1)
    async with SessionLocal() as s:
        await chat_service.set_mute(s, 340, until)
    async with SessionLocal() as s:
        saved = (await s.get(User, 340)).chat_muted_until
        assert saved is not None and abs((saved.replace(tzinfo=timezone.utc) - until).total_seconds()) < 2


async def test_deleting_a_player_removes_chat_data(client):
    for uid in (350, 351, 352):
        await ready_player(client, uid)
    async with SessionLocal() as s:
        await chat_service.block(s, 350, 351)
        await chat_service.block(s, 352, 350)
        await chat_service.add_report(s, 350, 352, "words", 1, "a")
        await chat_service.add_report(s, 351, 350, "spam", 2, "b")
        await chat_service.add_report(s, 351, 352, "spam", 3, "c")
    assert (await client.delete("/api/me", headers=headers(350))).status_code == 200
    async with SessionLocal() as s:
        blocks = (await s.execute(select(func.count()).select_from(ChatBlock))).scalar_one()
        reports = (await s.execute(select(ChatReport.text))).scalars().all()
        assert blocks == 0  # every block that involved the deleted player is gone
        assert reports == ["c"]  # only the complaint that did not involve them stays
