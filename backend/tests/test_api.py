from datetime import timedelta

from sqlalchemy import func, select

from app.core import utcnow
from app.db import SessionLocal
from app.models import Run, User, WeekBest

from .conftest import headers, ready_player


async def finish(client, user_id, start, **kw):
    body = {
        "run_id": start["run_id"],
        "token": start["token"],
        "score": 12,
        "duration_ms": 3000,
        "tier": 0,
        "captures": 6,
        "max_combo": 3,
        "input_log": [[0, 8, 1], [30, 0, 0]],
    }
    body.update(kw)
    return await client.post("/api/runs/finish", json=body, headers=headers(user_id))


async def age_run(run_id: str, seconds: int) -> None:
    async with SessionLocal() as s:
        run = await s.get(Run, run_id)
        run.started_at = utcnow() - timedelta(seconds=seconds)
        await s.commit()


async def test_health_and_auth(client):
    assert (await client.get("/api/health")).status_code == 200
    r = await client.post("/api/session/bootstrap")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"
    bad = {"X-VK-Launch-Params": headers(5)["X-VK-Launch-Params"].replace("vk_user_id=5", "vk_user_id=6")}
    assert (await client.post("/api/session/bootstrap", headers=bad)).status_code == 401


async def test_bootstrap_and_consent_gate(client):
    r = await client.post("/api/session/bootstrap", headers=headers(10))
    data = r.json()
    assert data["flags"] == {"consent_ok": False, "tutorial_done": False}
    assert data["stats"]["best_all"] == 0
    r = await client.post("/api/runs/start", headers=headers(10))
    assert r.status_code == 403 and r.json()["error"]["code"] == "consent_required"
    assert (await client.post("/api/consent", json={"version": 2}, headers=headers(10))).status_code == 409
    assert (await client.post("/api/consent", json={"version": 1}, headers=headers(10))).status_code == 200
    assert (await client.post("/api/runs/start", headers=headers(10))).status_code == 200


async def test_finish_valid_and_idempotent(client):
    await ready_player(client, 11)
    start = (await client.post("/api/runs/start", headers=headers(11))).json()
    r1 = (await finish(client, 11, start)).json()
    assert r1["status"] == "finished" and r1["is_record"] and r1["best_all"] == 12
    assert r1["rank_all"] == 1 and r1["rank_week"] == 1
    r2 = (await finish(client, 11, start, score=99)).json()
    assert r2["status"] == "finished" and r2["score"] == 12
    async with SessionLocal() as s:
        user = await s.get(User, 11)
        assert user.total_runs == 1
        assert user.best_combo == 3 and user.total_captures == 6 and user.last_tier == 0
    boot = (await client.post("/api/session/bootstrap", headers=headers(11))).json()
    assert boot["stats"]["best_combo"] == 3 and boot["stats"]["total_captures"] == 6


async def test_finish_rejections(client):
    await ready_player(client, 12)
    start = (await client.post("/api/runs/start", headers=headers(12))).json()
    r = (await finish(client, 12, start, duration_ms=10_000)).json()
    assert r["status"] == "rejected" and r["reason"] == "duration_mismatch"
    start = (await client.post("/api/runs/start", headers=headers(12))).json()
    await age_run(start["run_id"], 60)
    r = (await finish(client, 12, start, score=2000, duration_ms=50_000, tier=9, captures=30)).json()
    assert r["status"] == "rejected" and r["reason"] == "score_rate"
    assert r["best_all"] == 0


async def test_foreign_and_expired_runs(client):
    await ready_player(client, 13)
    await ready_player(client, 14)
    start = (await client.post("/api/runs/start", headers=headers(13))).json()
    r = await finish(client, 14, start)
    assert r.status_code == 403
    r = await finish(client, 13, start, token="1000." + "0" * 64)
    assert r.status_code == 403
    r = await finish(client, 13, {"run_id": "0" * 36, "token": start["token"]})
    assert r.status_code == 403


async def test_ranks_ties_and_gap(client):
    for uid in (21, 22, 23):
        await ready_player(client, uid)
    results = {}
    for uid, score in ((21, 30), (22, 30), (23, 12)):
        start = (await client.post("/api/runs/start", headers=headers(uid))).json()
        await age_run(start["run_id"], 30)
        results[uid] = (await finish(client, uid, start, score=score, duration_ms=10_000, captures=10)).json()
    assert results[21]["rank_all"] == 1  # earlier achiever wins the tie
    assert results[22]["rank_all"] == 2
    assert results[23]["rank_all"] == 3
    lb = (await client.get("/api/leaderboard?scope=all", headers=headers(23))).json()
    assert [r["user_id"] for r in lb["rows"]] == [21, 22, 23]
    assert lb["me"]["rank"] == 3 and lb["me"]["gap_to_next"] == 19
    week = (await client.get("/api/leaderboard?scope=week", headers=headers(22))).json()
    assert week["me"]["rank"] == 2 and week["reset_at"] > week["server_time"]


async def test_player_outside_top(client):
    now = utcnow()
    async with SessionLocal() as s:
        for i in range(40):
            s.add(
                User(
                    id=1000 + i, created_at=now, last_seen_at=now, settings={}, settings_updated_at=0,
                    best_all=1000 - i, best_all_at=now, best_tier=5, total_runs=1,
                    tutorial_done=True, profile_deactivated=False,
                )
            )
        await s.commit()
    lb = (await client.get("/api/leaderboard?scope=all", headers=headers(1039))).json()
    assert len(lb["rows"]) == 30
    assert lb["me"]["rank"] == 40 and lb["me"]["gap_to_next"] == 2


async def test_rate_limit(client):
    await ready_player(client, 30)
    codes = [(await client.post("/api/runs/start", headers=headers(30))).status_code for _ in range(13)]
    assert codes[:12] == [200] * 12
    assert codes[12] == 429


async def test_settings_sync_and_delete(client):
    await ready_player(client, 40)
    r = await client.put("/api/settings", json={"settings": {"layout": "row"}, "updated_at": 200}, headers=headers(40))
    assert r.json()["settings"] == {"layout": "row"}
    r = await client.put("/api/settings", json={"settings": {"layout": "field"}, "updated_at": 100}, headers=headers(40))
    assert r.json()["settings"] == {"layout": "row"}  # older write ignored
    start = (await client.post("/api/runs/start", headers=headers(40))).json()
    await finish(client, 40, start)
    assert (await client.delete("/api/me", headers=headers(40))).status_code == 200
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(Run).where(Run.user_id == 40)) == 0
        assert await s.scalar(select(func.count()).select_from(WeekBest).where(WeekBest.user_id == 40)) == 0
        assert await s.get(User, 40) is None
    r = await client.post("/api/session/bootstrap", headers=headers(40))
    assert r.json()["flags"]["consent_ok"] is False


async def test_validation_errors(client):
    await ready_player(client, 50)
    r = await client.post("/api/runs/finish", json={"run_id": "x"}, headers=headers(50))
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"
    r = await client.put("/api/settings", json={"settings": {"a": {"nested": 1}}, "updated_at": 1}, headers=headers(50))
    assert r.status_code == 422
