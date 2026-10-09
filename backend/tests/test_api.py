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
    # 10 points = 1 coin, rounded down per run.
    assert r1["coins_earned"] == 1 and r1["coins"] == 1
    # Sending the same finish again (a retry) must not pay twice.
    r2 = (await finish(client, 80, start, score=12)).json()
    assert r2["coins_earned"] == 1 and r2["coins"] == 1
    start = (await client.post("/api/runs/start", headers=headers(80))).json()
    r3 = (await finish(client, 80, start, score=30)).json()
    assert r3["coins"] == 4
    boot = (await client.post("/api/session/bootstrap", headers=headers(80))).json()
    assert boot["shop"]["coins"] == 4


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
    assert sorted(r["new_items"]) == ["bg_dusk", "starter_feet", "starter_head", "starter_legs", "starter_torso"]
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
    assert sorted(boot["shop"]["owned"]) == [
        "bg_dusk", "prop_basketball", "prop_football", "starter_feet", "starter_head", "starter_legs", "starter_torso",
    ]


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
    await finish(client, 85, start, score=50)  # 5 coins: still not enough for 30
    assert (await client.post("/api/shop/buy", json={"item_id": "shop_test"}, headers=headers(85))).status_code == 402
    async with SessionLocal() as s:
        user = await s.get(User, 85)
        user.coins = 50
        await s.commit()
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


async def _play_duel(client, a, b, duel_no, score_a, score_b):
    """A duel between two players: both finish a run on the same seed."""
    from app.services import game as game_service

    duel_id = f"{duel_no:03d}".ljust(36, "0")
    async with SessionLocal() as s:
        ta = await game_service.start_run(s, await s.get(User, a), seed=7, duel_id=duel_id)
        tb = await game_service.start_run(s, await s.get(User, b), seed=7, duel_id=duel_id)
    await age_run(ta["run_id"], 60)
    await age_run(tb["run_id"], 60)
    await finish(client, a, ta, score=score_a, duration_ms=20_000, captures=10)
    return await finish(client, b, tb, score=score_b, duration_ms=20_000, captures=6)


async def test_duel_win_streak_counts_different_opponents_only(client):
    for uid in (90, 91, 92):
        await ready_player(client, uid)
    # Player 90 beats 91, then 92, then 91 again: three wins, but only two different opponents.
    await _play_duel(client, 90, 91, 1, 40, 12)
    await _play_duel(client, 90, 92, 2, 40, 12)
    async with SessionLocal() as s:
        w = await s.get(User, 90)
        assert w.duel_streak == 2 and w.best_duel_streak == 2 and list(w.duel_streak_opps) == [91, 92]
    shop = (await client.get("/api/shop", headers=headers(90))).json()
    assert shop["owned"] == ["ninja_head"] and shop["duel_streak"] == 2
    await _play_duel(client, 90, 91, 3, 40, 12)
    async with SessionLocal() as s:
        w = await s.get(User, 90)
        assert w.duel_wins == 3 and w.duel_streak == 2  # the repeat win does not extend the streak
        loser = await s.get(User, 91)
        assert loser.duel_streak == 0
    # A loss breaks the streak and the list of beaten players.
    await _play_duel(client, 91, 90, 4, 40, 12)
    async with SessionLocal() as s:
        w = await s.get(User, 90)
        assert w.duel_streak == 0 and list(w.duel_streak_opps) == [] and w.best_duel_streak == 2


async def test_ten_different_wins_open_the_legion_set_and_the_trophy(client):
    await ready_player(client, 130)
    for i in range(10):
        await ready_player(client, 131 + i)
        await _play_duel(client, 130, 131 + i, 10 + i, 40, 12)
    shop = (await client.get("/api/shop", headers=headers(130))).json()
    owned = set(shop["owned"])
    assert {"legion_head", "legion_torso", "legion_arms", "legion_legs", "legion_torch", "pet_trophy"} <= owned
    assert shop["duel_streak"] == 10


async def test_duel_loser_pays_the_stake_to_the_winner(client):
    await ready_player(client, 150)
    await ready_player(client, 151)
    async with SessionLocal() as s:
        (await s.get(User, 150)).coins = 100
        (await s.get(User, 151)).coins = 700
        await s.commit()
    res = (await _play_duel(client, 150, 151, 40, 40, 12)).json()
    # 151 lost: pays 500; 150 gets it.
    assert res["duel"]["status"] == "done" and res["duel"]["stake"]["151"] == -500 and res["duel"]["stake"]["150"] == 500
    async with SessionLocal() as s:
        assert (await s.get(User, 150)).coins == 600 and (await s.get(User, 151)).coins == 200  # points of a duel pay nothing
    # A poor loser pays only what he has. 150 now has 600 and loses against 151.
    async with SessionLocal() as s:
        (await s.get(User, 150)).coins = 300
        await s.commit()
    await _play_duel(client, 151, 150, 41, 40, 12)
    async with SessionLocal() as s:
        loser = await s.get(User, 150)
        assert loser.coins == 0  # all he had (300)
    # A draw moves nothing.
    async with SessionLocal() as s:
        before = (await s.get(User, 151)).coins
    await _play_duel(client, 150, 151, 42, 30, 30)
    async with SessionLocal() as s:
        assert (await s.get(User, 151)).coins == before  # a draw moves nothing, and the points pay nothing


async def test_cannot_start_a_duel_without_the_stake(client):
    import json

    from app import duel_ws

    class FakeWS:
        def __init__(self):
            self.sent = []

        async def send_text(self, text):
            self.sent.append(json.loads(text))

    await ready_player(client, 160)
    async with SessionLocal() as s:
        (await s.get(User, 160)).coins = 499
        await s.commit()
    me = duel_ws.Conn(ws=FakeWS(), user_id=160, name="A", photo=None)
    duel_ws.conns[160] = me
    try:
        await duel_ws.find(me)
        assert me.ws.sent and me.ws.sent[-1]["t"] == "stake_short" and me.ws.sent[-1]["need"] == 500
    finally:
        duel_ws.conns.pop(160, None)


async def test_chat_blocks(client):
    await ready_player(client, 170)
    await ready_player(client, 171)
    me = headers(170)
    assert (await client.get("/api/chat/blocks", headers=me)).json() == {"blocked": []}
    assert (await client.post("/api/chat/block", json={"user_id": 170}, headers=me)).status_code == 400
    assert (await client.post("/api/chat/block", json={"user_id": 999999}, headers=me)).status_code == 404
    r = await client.post("/api/chat/block", json={"user_id": 171}, headers=me)
    assert r.status_code == 200 and [b["id"] for b in r.json()["blocked"]] == [171]
    # Blocking twice changes nothing.
    again = await client.post("/api/chat/block", json={"user_id": 171}, headers=me)
    assert [b["id"] for b in again.json()["blocked"]] == [171]
    gone = await client.delete("/api/chat/block/171", headers=me)
    assert gone.json() == {"blocked": []}


async def test_chat_reports_hide_a_message_and_mute_the_author(client):
    import json
    import time

    from app import duel_ws

    class FakeWS:
        def __init__(self):
            self.sent = []

        async def send_text(self, text):
            self.sent.append(json.loads(text))

    await ready_player(client, 180)  # the author
    reporters = []
    for uid in range(181, 186):
        await ready_player(client, uid)
        c = duel_ws.Conn(ws=FakeWS(), user_id=uid, name=f"R{uid}", photo=None, in_chat=True)
        duel_ws.conns[uid] = c
        reporters.append(c)
    author = duel_ws.Conn(ws=FakeWS(), user_id=180, name="Author", photo=None, in_chat=True)
    duel_ws.conns[180] = author
    msg = {"id": 9001, "ts": int(time.time() * 1000), "user": duel_ws.chat_user(author), "text": "rude words"}
    duel_ws.chat_history.append(msg)
    try:
        # A reason must be one of the known ones, and nobody reports himself.
        await duel_ws.chat_report(reporters[0], 9001, "weird")
        assert not reporters[0].ws.sent
        await duel_ws.chat_report(author, 9001, "abuse")
        assert author.ws.sent[-1]["t"] == "report_err"
        for c in reporters[:2]:
            await duel_ws.chat_report(c, 9001, "abuse")
        assert msg in duel_ws.chat_history  # two complaints are not enough
        # The same player complaining again counts once.
        await duel_ws.chat_report(reporters[0], 9001, "abuse")
        await duel_ws.chat_report(reporters[2], 9001, "spam")
        assert msg not in duel_ws.chat_history  # the third one hides it
        # The author was warned once by the first complaint, and told that the message was removed.
        warns = [m for m in author.ws.sent if m["t"] == "chat_warned"]
        assert len(warns) == 2 and warns[0]["removed"] is False and warns[1]["removed"] is True
        assert any(m["t"] == "chat_remove" and m["id"] == 9001 for m in reporters[3].ws.sent)
    finally:
        for uid in range(180, 186):
            duel_ws.conns.pop(uid, None)
        duel_ws.chat_history.clear()


async def test_decor_rules_and_purchase(client, monkeypatch):
    await ready_player(client, 92)
    # Nothing is owned yet: a background cannot be used.
    bad = await client.put("/api/decor", json={"decor": {"bg": "bg_dusk"}}, headers=headers(92))
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "not_owned"
    # A score of 150 opens the dusk background.
    async with SessionLocal() as s:
        user = await s.get(User, 92)
        user.best_all = 150
        user.coins = 1500
        await s.commit()
    await client.post("/api/session/bootstrap", headers=headers(92))
    ok = await client.put("/api/decor", json={"decor": {"bg": "bg_dusk"}}, headers=headers(92))
    assert ok.status_code == 200 and ok.json()["decor"] == {"bg": "bg_dusk"}
    # Wrong kind, bad positions, duplicates and unowned objects are rejected.
    assert (await client.put("/api/decor", json={"decor": {"bg": "prop_cup"}}, headers=headers(92))).status_code == 400
    bad = await client.put("/api/decor", json={"decor": {"props": [{"id": "prop_cup", "x": 1.5, "y": 0.5, "r": 0}]}}, headers=headers(92))
    assert bad.json()["error"]["code"] == "not_owned"  # not bought yet
    # Buying a priced object, then placing it anywhere on the screen and turning it.
    buy = await client.post("/api/shop/buy", json={"item_id": "prop_cup"}, headers=headers(92))
    assert buy.status_code == 200 and buy.json()["coins"] == 1100
    off = await client.put("/api/decor", json={"decor": {"props": [{"id": "prop_cup", "x": 1.5, "y": 0.5, "r": 0}]}}, headers=headers(92))
    assert off.json()["error"]["code"] == "bad_position"
    turned = await client.put("/api/decor", json={"decor": {"props": [{"id": "prop_cup", "x": 0.3, "y": 0.8, "r": 45}]}}, headers=headers(92))
    assert turned.json()["error"]["code"] == "bad_position"
    twice = await client.put(
        "/api/decor",
        json={"decor": {"props": [{"id": "prop_cup", "x": 0.3, "y": 0.8, "r": 0}, {"id": "prop_cup", "x": 0.6, "y": 0.8, "r": 0}]}},
        headers=headers(92),
    )
    assert twice.json()["error"]["code"] == "duplicate_item"
    placed = await client.put("/api/decor", json={"decor": {"props": [{"id": "prop_cup", "x": 0.3, "y": 0.8, "r": 90}]}}, headers=headers(92))
    assert placed.json()["decor"] == {"bg": "bg_dusk", "props": [{"id": "prop_cup", "x": 0.3, "y": 0.8, "r": 90}]}
    # Moving it replaces the list; an empty list takes everything away.
    moved = await client.put("/api/decor", json={"decor": {"props": [{"id": "prop_cup", "x": 0.7, "y": 0.9, "r": 270}]}}, headers=headers(92))
    assert moved.json()["decor"]["props"] == [{"id": "prop_cup", "x": 0.7, "y": 0.9, "r": 270}]
    cleared = await client.put("/api/decor", json={"decor": {"bg": None, "props": []}}, headers=headers(92))
    assert cleared.json()["decor"] == {}
    boot = (await client.post("/api/session/bootstrap", headers=headers(92))).json()
    assert boot["shop"]["decor"] == {} and "prop_cup" in boot["shop"]["owned"]


async def test_pets_open_at_1300_and_can_be_chosen(client):
    await ready_player(client, 93)
    async with SessionLocal() as s:
        user = await s.get(User, 93)
        user.best_all = 1200
        await s.commit()
    boot = (await client.post("/api/session/bootstrap", headers=headers(93))).json()
    assert not any(i.startswith("pet_") for i in boot["shop"]["owned"])
    assert (await client.put("/api/decor", json={"decor": {"pet": "pet_cat"}}, headers=headers(93))).json()["error"]["code"] == "not_owned"
    async with SessionLocal() as s:
        user = await s.get(User, 93)
        user.best_all = 1300
        await s.commit()
    boot = (await client.post("/api/session/bootstrap", headers=headers(93))).json()
    assert {"pet_cat", "pet_dog", "pet_parrot"} <= set(boot["shop"]["owned"])
    ok = await client.put("/api/decor", json={"decor": {"pet": "pet_parrot"}}, headers=headers(93))
    assert ok.status_code == 200 and ok.json()["decor"]["pet"] == "pet_parrot"
    # A pet is not a background and a background is not a pet.
    assert (await client.put("/api/decor", json={"decor": {"bg": "pet_cat"}}, headers=headers(93))).json()["error"]["code"] == "wrong_kind"
    assert (await client.put("/api/decor", json={"decor": {"pet": "bg_dusk"}}, headers=headers(93))).json()["error"]["code"] == "wrong_kind"
    cleared = await client.put("/api/decor", json={"decor": {"pet": None}}, headers=headers(93))
    assert "pet" not in cleared.json()["decor"]


async def test_privacy_switch_and_public_profile(client):
    await ready_player(client, 94)
    await ready_player(client, 95)
    async with SessionLocal() as s:
        user = await s.get(User, 95)
        user.best_all = 900
        user.display_name = "Тест П."
        await s.commit()
    await client.post("/api/session/bootstrap", headers=headers(95))  # grants cosmetics for the record
    # Another player sees the in-game profile, with a link offered by default.
    prof = (await client.get("/api/players/95", headers=headers(94))).json()
    assert prof["id"] == 95 and prof["link"] is True and prof["stats"]["best_all"] == 900
    assert prof["styles_total"] >= 28 and prof["collection_owned"] >= 5 and prof["loadout"] == {}
    # Hiding the link is respected in the profile and in the leaderboard rows.
    off = await client.put("/api/privacy", json={"hide_vk_link": True}, headers=headers(95))
    assert off.status_code == 200 and off.json()["hide_vk_link"] is True
    assert (await client.get("/api/players/95", headers=headers(94))).json()["link"] is False
    boot = (await client.post("/api/session/bootstrap", headers=headers(95))).json()
    assert boot["privacy"]["hide_vk_link"] is True
    lb = (await client.get("/api/leaderboard?scope=all", headers=headers(94))).json()
    assert [r["link"] for r in lb["rows"] if r["user_id"] == 95] == [False]
    # Unknown players and deactivated profiles are not available.
    assert (await client.get("/api/players/123456", headers=headers(94))).status_code == 404
    async with SessionLocal() as s:
        user = await s.get(User, 95)
        user.profile_deactivated = True
        await s.commit()
    assert (await client.get("/api/players/95", headers=headers(94))).status_code == 404


async def test_five_or_more_objects_can_be_placed(client):
    await ready_player(client, 96)
    async with SessionLocal() as s:
        user = await s.get(User, 96)
        user.best_all = 800
        user.coins = 100000
        await s.commit()
    await client.post("/api/session/bootstrap", headers=headers(96))
    for item in ("prop_lamp", "prop_bat", "prop_cup", "prop_sword", "prop_tv"):
        assert (await client.post("/api/shop/buy", json={"item_id": item}, headers=headers(96))).status_code == 200
    ids = ["prop_football", "prop_basketball", "prop_lamp", "prop_bat", "prop_cup", "prop_sword", "prop_tv"]
    placement = [{"id": i, "x": 0.1 + 0.1 * n, "y": 0.8, "r": 0} for n, i in enumerate(ids)]
    ok = await client.put("/api/decor", json={"decor": {"props": placement}}, headers=headers(96))
    assert ok.status_code == 200 and len(ok.json()["decor"]["props"]) == 7
    # An old client that still sends the three fixed places keeps working.
    legacy = await client.put("/api/decor", json={"decor": {"props": {"left": "prop_cup", "wall": "prop_tv"}}}, headers=headers(96))
    assert [p["id"] for p in legacy.json()["decor"]["props"]] == ["prop_cup", "prop_tv"]


async def test_profile_shows_what_the_player_wears_and_chose(client):
    from app.models import OwnedCosmetic

    await ready_player(client, 97)
    await ready_player(client, 98)
    async with SessionLocal() as s:
        user = await s.get(User, 97)
        user.best_all = 1400
        await s.commit()
    await client.post("/api/session/bootstrap", headers=headers(97))  # grants starter items, backgrounds and pets
    wear = await client.put("/api/loadout", json={"loadout": {"head": "starter_head", "feet": "starter_feet"}}, headers=headers(97))
    assert wear.status_code == 200
    decor = await client.put(
        "/api/decor",
        json={"decor": {"bg": "bg_dusk", "pet": "pet_dog", "props": [{"id": "prop_football", "x": 0.8, "y": 0.9, "r": 90}]}},
        headers=headers(97),
    )
    assert decor.status_code == 200
    # Another player opens this profile and sees the same state.
    prof = (await client.get("/api/players/97", headers=headers(98))).json()
    assert prof["loadout"] == {"head": "starter_head", "feet": "starter_feet"}
    assert prof["decor"]["bg"] == "bg_dusk" and prof["decor"]["pet"] == "pet_dog"
    assert prof["decor"]["props"] == [{"id": "prop_football", "x": 0.8, "y": 0.9, "r": 90}]


async def test_duel_start_sends_the_opponent_look(client):
    """The look helper used by the duel start returns the worn styles and the chosen pet."""
    from app.duel_ws import _look

    await ready_player(client, 99)
    async with SessionLocal() as s:
        user = await s.get(User, 99)
        user.best_all = 1400
        await s.commit()
    await client.post("/api/session/bootstrap", headers=headers(99))
    await client.put("/api/loadout", json={"loadout": {"torso": "starter_torso"}}, headers=headers(99))
    await client.put("/api/decor", json={"decor": {"pet": "pet_cat"}}, headers=headers(99))
    async with SessionLocal() as s:
        look = await _look(s, await s.get(User, 99))
    assert look == {"loadout": {"torso": "starter_torso"}, "pet": "pet_cat"}


# ---------------------------------------------------------------- purchases for VK votes

def _vk_sign(params: dict) -> str:
    import hashlib

    from .conftest import SECRET

    raw = "".join(f"{k}={params[k]}" for k in sorted(params)) + SECRET
    return hashlib.md5(raw.encode()).hexdigest()


async def _vk_notify(client, **params):
    from urllib.parse import urlencode

    from .conftest import APP_ID

    base = {"app_id": str(APP_ID)}
    base.update({k: str(v) for k, v in params.items()})
    base["sig"] = _vk_sign(base)
    r = await client.post("/api/vk/payments", content=urlencode(base), headers={"content-type": "application/x-www-form-urlencoded"})
    assert r.status_code == 200
    return r.json()


async def test_vk_get_item_and_purchase_delivers_the_set(client):
    await ready_player(client, 120)
    info = await _vk_notify(client, notification_type="get_item_test", user_id=120, receiver_id=120, order_id=1, lang="ru_RU", item="seraph_set")
    assert info["response"]["price"] == 10 and info["response"]["item_id"] == "seraph_set" and len(info["response"]["title"]) <= 48
    paid = await _vk_notify(
        client, notification_type="order_status_change_test", user_id=120, receiver_id=120, order_id=777, date=1790000000,
        status="chargeable", item="seraph_set", item_title="Набор", item_price=10,
    )
    assert paid["response"]["order_id"] == 777 and paid["response"]["app_order_id"] >= 1
    shop = (await client.get("/api/shop", headers=headers(120))).json()
    assert {"seraph_head", "seraph_torso", "seraph_arms", "seraph_legs", "seraph_torch"} <= set(shop["owned"])
    assert any(p["id"] == "seraph_set" and p["votes"] == 10 for p in shop["products"])
    # The same notification again: the same answer and nothing is given twice.
    again = await _vk_notify(
        client, notification_type="order_status_change_test", user_id=120, receiver_id=120, order_id=777, date=1790000000,
        status="chargeable", item="seraph_set", item_title="Набор", item_price=10,
    )
    assert again == paid
    # The goods can be worn, the flashlight has a slot of its own.
    wear = await client.put("/api/loadout", json={"loadout": {"torch": "seraph_torch", "head": "seraph_head"}}, headers=headers(120))
    assert wear.status_code == 200 and wear.json()["loadout"] == {"torch": "seraph_torch", "head": "seraph_head"}
    # A bought set is no longer offered.
    owned = await _vk_notify(client, notification_type="get_item_test", user_id=120, receiver_id=120, order_id=2, lang="ru_RU", item="seraph_set")
    assert owned["error"]["error_code"] == 100


async def test_vk_payment_checks(client):
    await ready_player(client, 121)
    # Bad signature.
    bad = await client.post(
        "/api/vk/payments",
        content="notification_type=get_item&app_id=7000000&user_id=121&item=seraph_set&sig=00",
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    assert bad.json()["error"]["error_code"] == 10
    # Unknown product, unknown user, another price, a gift.
    assert (await _vk_notify(client, notification_type="get_item", user_id=121, receiver_id=121, order_id=1, lang="ru_RU", item="nothing"))["error"]["error_code"] == 20
    assert (await _vk_notify(client, notification_type="get_item", user_id=999999, receiver_id=999999, order_id=1, lang="ru_RU", item="seraph_set"))["error"]["error_code"] == 22
    cheap = await _vk_notify(
        client, notification_type="order_status_change", user_id=121, receiver_id=121, order_id=5, date=1,
        status="chargeable", item="seraph_set", item_title="x", item_price=1,
    )
    assert cheap["error"]["error_code"] == 101
    gift = await _vk_notify(
        client, notification_type="order_status_change", user_id=121, receiver_id=122, order_id=6, date=1,
        status="chargeable", item="seraph_set", item_title="x", item_price=10,
    )
    assert gift["error"]["error_code"] == 11
    shop = (await client.get("/api/shop", headers=headers(121))).json()
    assert not any(i.startswith("seraph") for i in shop["owned"])
    # Premium goods cannot be bought for coins.
    async with SessionLocal() as s:
        user = await s.get(User, 121)
        user.coins = 10**6
        await s.commit()
    r = await client.post("/api/shop/buy", json={"item_id": "seraph_head"}, headers=headers(121))
    assert r.json()["error"]["code"] == "not_for_sale"


async def test_vk_refund_takes_the_goods_back(client):
    await ready_player(client, 122)
    await _vk_notify(
        client, notification_type="order_status_change", user_id=122, receiver_id=122, order_id=31, date=1,
        status="chargeable", item="pet_spark", item_title="x", item_price=10,
    )
    assert "pet_spark" in (await client.get("/api/shop", headers=headers(122))).json()["owned"]
    assert (await client.put("/api/decor", json={"decor": {"pet": "pet_spark"}}, headers=headers(122))).status_code == 200
    back = await _vk_notify(
        client, notification_type="order_status_change", user_id=122, receiver_id=122, order_id=31, date=1,
        status="refunded", item="pet_spark", item_title="x", item_price=10,
    )
    assert back["response"]["order_id"] == 31
    shop = (await client.get("/api/shop", headers=headers(122))).json()
    assert "pet_spark" not in shop["owned"] and "pet" not in shop["decor"]


# ---------------------------------------------------------------- balance without a deploy

async def test_admin_balance_changes_apply_without_a_deploy(client, monkeypatch):
    from types import SimpleNamespace

    from app import admin, tunables
    from app.services import game as game_service

    await ready_player(client, 190)
    # Without ADMIN_KEY the page and the API are off.
    assert (await client.get("/admin")).status_code == 404
    assert (await client.get("/api/admin/balance", headers={"x-admin-key": "k"})).status_code == 404
    monkeypatch.setattr(admin, "settings", SimpleNamespace(admin_key="secret-key"))
    try:
        assert (await client.get("/api/admin/balance")).status_code == 403
        assert (await client.get("/api/admin/balance", headers={"x-admin-key": "wrong"})).status_code == 403
        good = {"x-admin-key": "secret-key"}
        rows = (await client.get("/api/admin/balance", headers=good)).json()["rows"]
        stake = next(r for r in rows if r["key"] == "duel_stake")
        assert stake["default"] == 500 and stake["value"] == 500 and not stake["overridden"]
        # Change the stake and a price: the game uses the new numbers at once.
        assert (await client.put("/api/admin/balance", json={"key": "duel_stake", "value": 200}, headers=good)).status_code == 200
        assert game_service.duel_stake() == 200
        assert (await client.put("/api/admin/balance", json={"key": "price.prop_cup", "value": 55}, headers=good)).status_code == 200
        cup = next(i for i in (await client.get("/api/shop", headers=headers(190))).json()["catalog"] if i["id"] == "prop_cup")
        assert cup["price"] == 55
        boot = (await client.post("/api/session/bootstrap", headers=headers(190))).json()
        assert boot["tunables"]["duel_stake"] == 200
        # Bad requests are refused.
        assert (await client.put("/api/admin/balance", json={"key": "duel_stake", "value": -5}, headers=good)).json()["error"]["code"] == "out_of_range"
        assert (await client.put("/api/admin/balance", json={"key": "nonsense", "value": 1}, headers=good)).json()["error"]["code"] == "unknown_key"
        assert (await client.put("/api/admin/balance", json={"key": "price.bg_dusk", "value": 1}, headers=good)).json()["error"]["code"] == "unknown_key"  # not for sale
        # Reset returns the default from the code.
        await client.delete("/api/admin/balance/duel_stake", headers=good)
        await client.delete("/api/admin/balance/price.prop_cup", headers=good)
        assert game_service.duel_stake() == 500
        stats = (await client.get("/api/admin/stats", headers=good)).json()
        assert stats["players_total"] >= 1
        assert (await client.get("/admin")).status_code == 200
    finally:
        tunables.set_overrides({})


async def test_spectators_watch_a_duel(client):
    import asyncio
    import json
    import time

    from app import duel_ws

    class FakeWS:
        def __init__(self):
            self.sent = []

        async def send_text(self, text):
            self.sent.append(json.loads(text))

    a = duel_ws.Conn(ws=FakeWS(), user_id=210, name="A", photo=None, state="duel", duel="d" * 36)
    b = duel_ws.Conn(ws=FakeWS(), user_id=211, name="B", photo=None, state="duel", duel="d" * 36)
    w = duel_ws.Conn(ws=FakeWS(), user_id=212, name="W", photo=None)
    for c in (a, b, w):
        duel_ws.conns[c.user_id] = c
    duel_id = "d" * 36
    duel_ws.duels[duel_id] = duel_ws.Duel(
        id=duel_id, a=210, b=211, seed=77, started_at=time.time() - 12,
        players={210: {"id": 210, "name": "A", "photo": None, "look": None}, 211: {"id": 211, "name": "B", "photo": None, "look": None}},
    )
    try:
        # Inputs sent before anybody watches are kept for latecomers.
        await duel_ws.handle(a, {"t": "inputs", "upto": 30, "log": [[0, 8, 1], [20, 0, 0]]})
        await duel_ws.handle(w, {"t": "spec_list"})
        listing = w.ws.sent[-1]
        assert listing["t"] == "spec_list" and listing["duels"][0]["id"] == duel_id and listing["duels"][0]["elapsed"] >= 11
        # Players and unknown duels cannot be joined; a watcher can.
        await duel_ws.handle(a, {"t": "spec_join", "duel": duel_id})
        assert a.ws.sent[-1]["t"] == "spec_err"
        await duel_ws.handle(w, {"t": "spec_join", "duel": "nope"})
        assert w.ws.sent[-1]["t"] == "spec_err"
        await duel_ws.handle(w, {"t": "spec_join", "duel": duel_id})
        start = w.ws.sent[-1]
        assert start["t"] == "spec_start" and start["seed"] == 77 and start["elapsed_ms"] >= 11_000
        assert start["logs"]["210"] == [[0, 8, 1], [20, 0, 0]] and w.state == "watching"
        # What the players do next reaches the watcher.
        await duel_ws.handle(b, {"t": "inputs", "upto": 60, "log": [[40, -8, 0]]})
        assert w.ws.sent[-1] == {"t": "spec_inputs", "duel": duel_id, "uid": 211, "upto": 60, "log": [[40, -8, 0]]}
        await duel_ws.handle(b, {"t": "dead", "score": 55})
        assert w.ws.sent[-1]["t"] == "spec_dead" and w.ws.sent[-1]["score"] == 55
        # A watcher cannot start duels or be challenged while watching.
        await duel_ws.find(w)
        assert w.state == "watching"
        # The end of the duel is announced and the watcher is free again.
        duel_ws._on_result(duel_id, {210: "win", 211: "loss"})
        await asyncio.sleep(0.05)
        assert w.ws.sent[-1]["t"] == "spec_end" and w.ws.sent[-1]["outcome"] == {"210": "win", "211": "loss"}
        assert w.state == "idle" and w.watching is None
    finally:
        for uid in (210, 211, 212):
            duel_ws.conns.pop(uid, None)
        duel_ws.duels.pop(duel_id, None)


# ---------------------------------------------------------------- the government (mayor election)

def _msk(y, m, d, h=12, mi=0):
    from datetime import datetime

    from app.services.gov import MSK

    return datetime(y, m, d, h, mi, tzinfo=MSK)


def test_gov_week_math():
    from app.services import gov

    mon = _msk(2026, 10, 12, 0, 5)  # a Monday
    assert gov.week_start(mon).isoformat() == "2026-10-12"
    assert gov.week_start(_msk(2026, 10, 18, 23, 59)).isoformat() == "2026-10-12"  # Sunday evening
    assert gov.week_start(_msk(2026, 10, 19, 0, 1)).isoformat() == "2026-10-19"
    assert gov.phase(_msk(2026, 10, 16, 17, 59)) == "candidacy"  # Friday before 18:00
    assert gov.phase(_msk(2026, 10, 16, 18, 0)) == "voting"
    assert gov.phase(_msk(2026, 10, 18, 23, 0)) == "voting"
    assert gov.phase(_msk(2026, 10, 19, 0, 1)) == "candidacy"


async def _gov_players(client, ids, wk, wins=3, best=2000, runs=5, ring=True, age_days=10):
    """Players who fulfil the conditions of a candidate (progress and the ring of the week)."""
    from datetime import timedelta

    from app.core import utcnow
    from app.models import GovProgress, GovRing

    for uid in ids:
        await ready_player(client, uid)
    async with SessionLocal() as s:
        for uid in ids:
            u = await s.get(User, uid)
            u.created_at = utcnow() - timedelta(days=age_days)
            s.add(GovProgress(week=wk, user_id=uid, duel_wins=wins, best_solo=best, runs=runs))
            if ring:
                s.add(GovRing(week=wk, user_id=uid, found_at=utcnow()))
        await s.commit()


async def test_gov_election_flow_and_mayor_privileges(client, monkeypatch):
    from app.services import gov, shop as shop_service
    from app import cosmetics

    clock = {"t": _msk(2026, 10, 12, 12)}
    monkeypatch.setattr(gov, "now", lambda: clock["t"])
    try:
        await _gov_players(client, [300, 301, 302, 303, 304], "2026-10-12")
        # Candidacy: 300 and 301 qualify; 302 has no ring.
        async with SessionLocal() as s:
            from app.models import GovRing

            await s.delete(await s.get(GovRing, ("2026-10-12", 302)))
            await s.commit()
        assert (await client.post("/api/gov/apply", headers=headers(300))).status_code == 200
        assert (await client.post("/api/gov/apply", headers=headers(301))).status_code == 200
        no = await client.post("/api/gov/apply", headers=headers(302))
        assert no.status_code == 409 and no.json()["error"]["code"] == "conditions"
        state = (await client.get("/api/gov/state", headers=headers(303))).json()
        assert state["phase"] == "candidacy" and [c["id"] for c in state["candidates"]] == [300, 301] and state["mayor"] is None
        # No voting before Friday 18:00.
        assert (await client.post("/api/gov/vote", json={"candidate_id": 300}, headers=headers(303))).status_code == 409
        # Friday evening: the voting starts, the candidacy is closed.
        clock["t"] = _msk(2026, 10, 16, 18, 30)
        late = await client.post("/api/gov/apply", headers=headers(303))
        assert late.status_code == 409 and late.json()["error"]["code"] == "voting"
        state = (await client.get("/api/gov/state", headers=headers(303))).json()
        assert state["phase"] == "voting"
        # Voting: not for yourself, only for candidates; the vote can be changed.
        assert (await client.post("/api/gov/vote", json={"candidate_id": 300}, headers=headers(300))).status_code == 409
        assert (await client.post("/api/gov/vote", json={"candidate_id": 304}, headers=headers(302))).status_code == 404
        assert (await client.post("/api/gov/vote", json={"candidate_id": 301}, headers=headers(302))).status_code == 200
        assert (await client.post("/api/gov/vote", json={"candidate_id": 300}, headers=headers(302))).status_code == 200
        assert (await client.post("/api/gov/vote", json={"candidate_id": 300}, headers=headers(303))).status_code == 200
        assert (await client.post("/api/gov/vote", json={"candidate_id": 301}, headers=headers(304))).status_code == 200
        # Too few runs: no vote.
        await ready_player(client, 305)
        assert (await client.post("/api/gov/vote", json={"candidate_id": 300}, headers=headers(305))).status_code == 403
        # Monday 00:10: the votes are counted, 300 has 2 votes against 1.
        clock["t"] = _msk(2026, 10, 19, 0, 10)
        state = (await client.get("/api/gov/state", headers=headers(303))).json()
        assert state["mayor"]["id"] == 300 and state["week"] == "2026-10-19" and state["phase"] == "candidacy"
        assert state["me"]["role"] is None and gov.role_of(300) == "mayor"
        # The mayor has the mayor's things only for the term; the throne background too.
        async with SessionLocal() as s:
            owned = await shop_service.owned_ids(s, 300)
        assert {"mayor_head", "mayor_torso", "mayor_arms", "mayor_legs", "mayor_torch", "bg_throne"} <= owned
        assert not (cosmetics.gov_items("assistant") & owned)
        # The notifications: everybody is told about the new mayor, the winner personally.
        note = (await client.get("/api/notifications", headers=headers(303))).json()
        kinds = [n["kind"] for n in note["items"]]
        assert "mayor_elected" in kinds and "voting_started" in kinds and note["unread"] >= 2
        mine = (await client.get("/api/notifications", headers=headers(300))).json()
        assert any(n["kind"] == "mayor_you" for n in mine["items"])
        assert (await client.post("/api/notifications/read", headers=headers(303))).json() == {"unread": 0}
        assert (await client.get("/api/notifications", headers=headers(303))).json()["unread"] == 0
        # Last week's mayor cannot be mayor again straight away, even with everything done.
        await _gov_players_week(client, [300], "2026-10-19")
        again = await client.post("/api/gov/apply", headers=headers(300))
        assert again.status_code == 409 and again.json()["error"]["code"] == "was_mayor"
        # The mayor names assistants: only those who played this week.
        await _gov_players_week(client, [302, 303, 304, 306, 307], "2026-10-19", ring=False)
        assert (await client.post("/api/gov/assistants", json={"user_id": 302}, headers=headers(303))).status_code == 403  # not the mayor
        assert (await client.post("/api/gov/assistants", json={"user_id": 305}, headers=headers(300))).status_code == 409  # did not play
        for uid in (302, 303, 304, 306):
            assert (await client.post("/api/gov/assistants", json={"user_id": uid}, headers=headers(300))).status_code == 200
        assert (await client.post("/api/gov/assistants", json={"user_id": 307}, headers=headers(300))).json()["error"]["code"] == "full"
        inv = (await client.get("/api/notifications", headers=headers(302))).json()
        assert any(n["kind"] == "assistant_invite" for n in inv["items"])
        assert (await client.post("/api/gov/respond", json={"accept": True}, headers=headers(302))).json()["me"]["role"] == "assistant"
        assert (await client.post("/api/gov/respond", json={"accept": False}, headers=headers(303))).status_code == 200
        async with SessionLocal() as s:
            asst = await shop_service.owned_ids(s, 302)
        assert cosmetics.gov_items("assistant") <= asst and not (cosmetics.gov_items("mayor") & asst)
        # The mayor removes an assistant; the place becomes free.
        assert (await client.delete("/api/gov/assistants/302", headers=headers(300))).status_code == 200
        assert gov.role_of(302) is None
        # Settings: the coin bonus works only while the mayor is in the game.
        assert (await client.put("/api/gov/settings", json={"bonus": True, "play_color": "fire"}, headers=headers(300))).json()["settings"] == {"bonus_on": True, "play_color": "fire", "colors": list(gov.PLAY_COLORS)}
        assert (await client.put("/api/gov/settings", json={"play_color": "pink"}, headers=headers(300))).status_code == 400
        assert (await client.put("/api/gov/settings", json={"bonus": False}, headers=headers(302))).status_code == 403
        await client.put("/api/gov/settings", json={"bonus": True}, headers=headers(300))
        monkeypatch.setattr(gov, "_mayor_ping", -1e9)
        assert gov.bonus_active() is False  # the mayor is not in the game
        await client.post("/api/gov/ping", headers=headers(300))
        assert gov.bonus_active() is True
        async with SessionLocal() as s:
            user = await s.get(User, 306)
            before = user.coins or 0
            paid = await shop_service.credit_run(s, user, "bonus-run-1", 1000)
        assert paid == 110  # 1000 points = 100 coins, and 10% more
        # The next Monday the government changes: nobody has a post any more.
        clock["t"] = _msk(2026, 10, 26, 0, 5)
        await client.get("/api/gov/state", headers=headers(303))
        assert gov.role_of(300) is None and gov.bonus_active() is False and gov.current["play_color"] == "default"
    finally:
        gov.current.update(week="", mayor_id=None, assistants=set(), play_color="default", bonus_on=False)


async def _gov_players_week(client, ids, wk, ring=True):
    """Progress of the week for players that already exist (a new week starts from zero)."""
    from app.core import utcnow
    from app.models import GovProgress, GovRing

    for uid in ids:
        await ready_player(client, uid)
    async with SessionLocal() as s:
        for uid in ids:
            if await s.get(GovProgress, (wk, uid)) is None:
                s.add(GovProgress(week=wk, user_id=uid, duel_wins=3, best_solo=2000, runs=5))
            if ring and await s.get(GovRing, (wk, uid)) is None:
                s.add(GovRing(week=wk, user_id=uid, found_at=utcnow()))
        await s.commit()


async def test_gov_ties_one_candidate_and_no_candidates(client, monkeypatch):
    from app.services import gov

    clock = {"t": _msk(2026, 11, 2, 12)}
    monkeypatch.setattr(gov, "now", lambda: clock["t"])
    try:
        # An empty election: nobody becomes mayor.
        await client.get("/api/gov/state", headers=headers(310) if False else (await _gov_headers(client, 310)))
        clock["t"] = _msk(2026, 11, 9, 0, 5)
        assert (await client.get("/api/gov/state", headers=headers(310))).json()["mayor"] is None
        # One candidate wins without a vote; a tie goes to the one with more duel wins.
        wk = "2026-11-09"
        await _gov_players(client, [311, 312, 313, 314], wk)
        async with SessionLocal() as s:
            (await s.get(User, 312)).duel_wins = 9
            (await s.get(User, 311)).duel_wins = 2
            await s.commit()
        clock["t"] = _msk(2026, 11, 10, 12)
        await client.post("/api/gov/apply", headers=headers(311))
        await client.post("/api/gov/apply", headers=headers(312))
        clock["t"] = _msk(2026, 11, 14, 19)
        assert (await client.post("/api/gov/vote", json={"candidate_id": 311}, headers=headers(313))).status_code == 200
        assert (await client.post("/api/gov/vote", json={"candidate_id": 312}, headers=headers(314))).status_code == 200
        clock["t"] = _msk(2026, 11, 16, 0, 5)
        assert (await client.get("/api/gov/state", headers=headers(313))).json()["mayor"]["id"] == 312  # 1:1, more duel wins
        # One candidate.
        wk2 = "2026-11-16"
        await _gov_players_week(client, [313], wk2)
        clock["t"] = _msk(2026, 11, 17, 12)
        await client.post("/api/gov/apply", headers=headers(313))
        clock["t"] = _msk(2026, 11, 23, 0, 5)
        assert (await client.get("/api/gov/state", headers=headers(314))).json()["mayor"]["id"] == 313
    finally:
        gov.current.update(week="", mayor_id=None, assistants=set(), play_color="default", bonus_on=False)


async def _gov_headers(client, uid):
    await ready_player(client, uid)
    return headers(uid)


async def test_gov_ring_is_rare_and_once_a_week(client, monkeypatch):
    import random

    from app.services import gov

    monkeypatch.setattr(gov, "now", lambda: _msk(2026, 12, 7, 12))
    await ready_player(client, 320)
    monkeypatch.setattr(random, "random", lambda: 0.0)
    async with SessionLocal() as s:
        assert await gov.maybe_ring(s, 320, 799) is False  # too low a score
        assert await gov.maybe_ring(s, 320, 900) is True
        await s.commit()
    async with SessionLocal() as s:
        assert await gov.maybe_ring(s, 320, 3000) is False  # one ring per week
    monkeypatch.setattr(random, "random", lambda: 0.5)
    await ready_player(client, 321)
    async with SessionLocal() as s:
        assert await gov.maybe_ring(s, 321, 3000) is False  # luck is needed
