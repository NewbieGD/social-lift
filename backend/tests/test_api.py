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


async def test_items_collection_and_validation(client):
    await ready_player(client, 60)
    start = (await client.post("/api/runs/start", headers=headers(60))).json()
    await age_run(start["run_id"], 60)
    # Cap (tier 0) and slippers (tier 1) found in a run that reached tier 1.
    r = (await finish(client, 60, start, score=250, duration_ms=50_000, tier=1, captures=40, items=0b11)).json()
    assert r["status"] == "finished"
    boot = (await client.post("/api/session/bootstrap", headers=headers(60))).json()
    assert boot["stats"]["items_mask"] == 0b11
    # Every run starts from zero, so the same item may be picked again.
    start = (await client.post("/api/runs/start", headers=headers(60))).json()
    await age_run(start["run_id"], 60)
    r = (await finish(client, 60, start, score=12, duration_ms=10_000, captures=6, items=0b1)).json()
    assert r["status"] == "finished"
    # An item above the reached tier is rejected.
    start = (await client.post("/api/runs/start", headers=headers(60))).json()
    await age_run(start["run_id"], 60)
    r = (await finish(client, 60, start, score=12, duration_ms=10_000, captures=6, items=0b100)).json()
    assert r["status"] == "rejected" and r["reason"] == "items_invalid"


async def test_duel_resolution(client):
    from app.services import game as game_service

    await ready_player(client, 70)
    await ready_player(client, 71)
    async with SessionLocal() as s:
        ua = await s.get(User, 70)
        ub = await s.get(User, 71)
        ta = await game_service.start_run(s, ua, seed=123, duel_id="d" * 36)
        tb = await game_service.start_run(s, ub, seed=123, duel_id="d" * 36)
    await age_run(ta["run_id"], 60)
    await age_run(tb["run_id"], 60)
    r1 = (await finish(client, 70, ta, score=30, duration_ms=20_000, captures=10)).json()
    assert r1["duel"] == {"status": "pending"}
    r2 = (await finish(client, 71, tb, score=12, duration_ms=20_000, captures=6)).json()
    assert r2["duel"]["status"] == "done" and r2["duel"]["outcome"] == {"70": "win", "71": "loss"} or r2["duel"]["outcome"] == {70: "win", 71: "loss"}
    async with SessionLocal() as s:
        assert (await s.get(User, 70)).duel_wins == 1
        assert (await s.get(User, 71)).duel_wins == 0
    lb = (await client.get("/api/leaderboard?scope=duels", headers=headers(71))).json()
    assert [r["user_id"] for r in lb["rows"]] == [70] and lb["rows"][0]["score"] == 1


async def test_duel_abandon_counts_as_loss(client):
    from app.services import game as game_service

    await ready_player(client, 72)
    await ready_player(client, 73)
    async with SessionLocal() as s:
        ta = await game_service.start_run(s, await s.get(User, 72), seed=5, duel_id="e" * 36)
        await game_service.start_run(s, await s.get(User, 73), seed=5, duel_id="e" * 36)
        await game_service.abandon_duel_run(s, "e" * 36, 73)
    await age_run(ta["run_id"], 60)
    r = (await finish(client, 72, ta, score=12, duration_ms=20_000, captures=6)).json()
    assert r["duel"]["status"] == "done"
    async with SessionLocal() as s:
        assert (await s.get(User, 72)).duel_wins == 1


async def test_weekly_crown_moves_and_notifies(client):
    for uid in (31, 32):
        await ready_player(client, uid)

    async def play(uid, score):
        start = (await client.post("/api/runs/start", headers=headers(uid))).json()
        await age_run(start["run_id"], 30)
        return (await finish(client, uid, start, score=score, duration_ms=10_000, captures=10)).json()

    await play(31, 30)
    first = (await client.get("/api/crown", headers=headers(31))).json()
    assert first["crown"] is True and first["holder"]["id"] == 31
    assert [n["kind"] for n in first["notices"]] == ["won"]
    # notices are handed over once
    assert (await client.get("/api/crown", headers=headers(31))).json()["notices"] == []

    await play(32, 40)  # 32 takes the first place of the week
    mine = (await client.get("/api/crown", headers=headers(31))).json()
    assert mine["crown"] is False and mine["holder"]["id"] == 32
    assert [n["kind"] for n in mine["notices"]] == ["lost"]
    boot = (await client.post("/api/session/bootstrap", headers=headers(32))).json()
    assert boot["stats"]["crown"] is True


async def _big_run(client, uid, score=600):
    start = (await client.post("/api/runs/start", headers=headers(uid))).json()
    await age_run(start["run_id"], 120)
    return await finish(client, uid, start, score=score, duration_ms=60_000, tier=2, captures=80)


async def test_coins_paid_once_per_run(client):
    await ready_player(client, 80)
    start = (await client.post("/api/runs/start", headers=headers(80))).json()
    r1 = (await finish(client, 80, start, score=12)).json()
    assert r1["coins_earned"] == 12 and r1["coins"] == 12
    # Sending the same finish again (a retry) must not pay twice.
    r2 = (await finish(client, 80, start, score=12)).json()
    assert r2["coins_earned"] == 12 and r2["coins"] == 12
    start = (await client.post("/api/runs/start", headers=headers(80))).json()
    r3 = (await finish(client, 80, start, score=30)).json()
    assert r3["coins"] == 42
    boot = (await client.post("/api/session/bootstrap", headers=headers(80))).json()
    assert boot["shop"]["coins"] == 42


async def test_rejected_run_pays_nothing(client):
    await ready_player(client, 81)
    start = (await client.post("/api/runs/start", headers=headers(81))).json()
    r = (await finish(client, 81, start, score=99999, duration_ms=1000)).json()
    assert r["status"] == "rejected" and r["coins_earned"] == 0 and r["coins"] == 0


async def test_record_opens_starter_items_and_loadout(client):
    await ready_player(client, 82)
    # Below the threshold nothing opens.
    start = (await client.post("/api/runs/start", headers=headers(82))).json()
    r = (await finish(client, 82, start, score=12)).json()
    assert r["new_items"] == []
    boot = (await client.post("/api/session/bootstrap", headers=headers(82))).json()
    assert boot["shop"]["owned"] == [] and len(boot["shop"]["catalog"]) >= 4
    # A single run of 500+ opens all four starter items.
    r = (await _big_run(client, 82)).json()
    assert sorted(r["new_items"]) == ["starter_feet", "starter_head", "starter_legs", "starter_torso"]
    # A second record does not grant them again.
    r = (await _big_run(client, 82, score=620)).json()
    assert r["new_items"] == []
    resp = await client.put("/api/loadout", json={"loadout": {"head": "starter_head", "feet": "starter_feet"}}, headers=headers(82))
    assert resp.status_code == 200 and resp.json()["loadout"] == {"head": "starter_head", "feet": "starter_feet"}
    # Taking a slot off keeps the others.
    resp = await client.put("/api/loadout", json={"loadout": {"head": None}}, headers=headers(82))
    assert resp.json()["loadout"] == {"feet": "starter_feet"}
    boot = (await client.post("/api/session/bootstrap", headers=headers(82))).json()
    assert boot["shop"]["loadout"] == {"feet": "starter_feet"}


async def test_loadout_rejects_foreign_and_wrong_slot(client):
    await ready_player(client, 83)
    bad = await client.put("/api/loadout", json={"loadout": {"head": "starter_head"}}, headers=headers(83))
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "not_owned"
    await _big_run(client, 83)
    wrong = await client.put("/api/loadout", json={"loadout": {"head": "starter_feet"}}, headers=headers(83))
    assert wrong.status_code == 400 and wrong.json()["error"]["code"] == "wrong_slot"
    unknown = await client.put("/api/loadout", json={"loadout": {"head": "nope"}}, headers=headers(83))
    assert unknown.json()["error"]["code"] == "unknown_item"
    slot = await client.put("/api/loadout", json={"loadout": {"tail": "starter_head"}}, headers=headers(83))
    assert slot.json()["error"]["code"] == "unknown_slot"


async def test_existing_player_gets_items_on_next_start(client):
    await ready_player(client, 84)
    async with SessionLocal() as s:
        user = await s.get(User, 84)
        user.best_all = 700  # a player who passed the threshold before the shop existed
        await s.commit()
    boot = (await client.post("/api/session/bootstrap", headers=headers(84))).json()
    assert sorted(boot["shop"]["owned"]) == ["starter_feet", "starter_head", "starter_legs", "starter_torso"]


async def test_buy_with_coins(client, monkeypatch):
    from app import cosmetics

    monkeypatch.setitem(cosmetics.ITEMS, "shop_test", cosmetics.Item("shop_test", "head", price=30))
    await ready_player(client, 85)
    # Not for sale / unknown / not enough coins.
    assert (await client.post("/api/shop/buy", json={"item_id": "starter_head"}, headers=headers(85))).json()["error"]["code"] == "not_for_sale"
    assert (await client.post("/api/shop/buy", json={"item_id": "zzz"}, headers=headers(85))).status_code == 404
    poor = await client.post("/api/shop/buy", json={"item_id": "shop_test"}, headers=headers(85))
    assert poor.status_code == 402 and poor.json()["error"]["code"] == "not_enough_coins"
    start = (await client.post("/api/runs/start", headers=headers(85))).json()
    await finish(client, 85, start, score=50)
    ok = await client.post("/api/shop/buy", json={"item_id": "shop_test"}, headers=headers(85))
    assert ok.status_code == 200 and ok.json()["coins"] == 20 and "shop_test" in ok.json()["owned"]
    again = await client.post("/api/shop/buy", json={"item_id": "shop_test"}, headers=headers(85))
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_owned"
    assert (await client.get("/api/shop", headers=headers(85))).json()["coins"] == 20


async def test_delete_removes_coins_and_cosmetics(client):
    from app.models import CoinTx, OwnedCosmetic

    await ready_player(client, 86)
    await _big_run(client, 86)
    assert (await client.delete("/api/me", headers=headers(86))).status_code == 200
    async with SessionLocal() as s:
        assert (await s.execute(select(func.count()).select_from(CoinTx))).scalar() == 0
        assert (await s.execute(select(func.count()).select_from(OwnedCosmetic))).scalar() == 0


async def test_higher_records_open_night_parts_one_by_one(client):
    await ready_player(client, 87)
    async with SessionLocal() as s:
        user = await s.get(User, 87)
        user.best_all = 1250
        await s.commit()
    boot = (await client.post("/api/session/bootstrap", headers=headers(87))).json()
    owned = set(boot["shop"]["owned"])
    assert {"night_head", "night_torso"} <= owned and "night_arms" not in owned and "brute_head" not in owned


async def test_run_drop_is_rolled_by_the_server_and_claimed_once(client, monkeypatch):
    from app import cosmetics

    monkeypatch.setattr(cosmetics, "DROP_CHANCE", 1.0)
    await ready_player(client, 88)
    start = (await client.post("/api/runs/start", headers=headers(88))).json()
    drop = start["drop"]
    assert drop in cosmetics.ITEMS and cosmetics.ITEMS[drop].drop
    # Reporting a find in a run that scored too little does nothing.
    low = (await finish(client, 88, start, score=50, drop_found=True)).json()
    assert drop not in low["new_items"]
    start = (await client.post("/api/runs/start", headers=headers(88))).json()
    drop = start["drop"]
    await age_run(start["run_id"], 120)
    ok = (await finish(client, 88, start, score=300, duration_ms=60_000, tier=1, captures=60, drop_found=True)).json()
    assert drop in ok["new_items"]
    # Claiming again (a retried finish) does not grant it twice.
    again = (await finish(client, 88, start, score=300, duration_ms=60_000, tier=1, captures=60, drop_found=True)).json()
    assert again["new_items"] == []
    shop = (await client.get("/api/shop", headers=headers(88))).json()
    assert shop["owned"].count(drop) == 1
    # A run that did not report a find grants nothing, and an owned part is not offered again.
    start = (await client.post("/api/runs/start", headers=headers(88))).json()
    assert start["drop"] != drop


async def test_no_drop_without_a_roll(client, monkeypatch):
    from app import cosmetics

    monkeypatch.setattr(cosmetics, "DROP_CHANCE", 0.0)
    await ready_player(client, 89)
    start = (await client.post("/api/runs/start", headers=headers(89))).json()
    assert start["drop"] is None
    await age_run(start["run_id"], 120)
    r = (await finish(client, 89, start, score=300, duration_ms=60_000, tier=1, captures=60, drop_found=True)).json()
    assert r["new_items"] == []


async def test_duel_win_streak_opens_ninja_parts(client):
    from app.services import game as game_service

    await ready_player(client, 90)
    await ready_player(client, 91)
    for i in range(2):
        duel_id = f"{i}" * 36
        async with SessionLocal() as s:
            ta = await game_service.start_run(s, await s.get(User, 90), seed=7, duel_id=duel_id)
            tb = await game_service.start_run(s, await s.get(User, 91), seed=7, duel_id=duel_id)
        await age_run(ta["run_id"], 60)
        await age_run(tb["run_id"], 60)
        await finish(client, 90, ta, score=40, duration_ms=20_000, captures=10)
        await finish(client, 91, tb, score=12, duration_ms=20_000, captures=6)
    async with SessionLocal() as s:
        winner = await s.get(User, 90)
        loser = await s.get(User, 91)
        assert winner.duel_streak == 2 and winner.best_duel_streak == 2 and loser.duel_streak == 0
    shop = (await client.get("/api/shop", headers=headers(90))).json()
    assert shop["owned"] == ["ninja_head"] and shop["duel_streak"] == 2
