from datetime import datetime, timezone

from app.core import RateLimiter, check_run_token, make_run_token, validate_run, week_id, week_reset_at
from app.game_config import tier_for_score
from app.vk_sign import verify_launch_params

from .conftest import APP_ID, SECRET, launch_params


def test_vk_doc_vector():
    # Example from https://dev.vk.ru/ru/games/development/parameters-sign (Node.js section).
    raw = (
        "vk_user_id=494075&vk_app_id=6736218&vk_is_app_user=1&vk_are_notifications_enabled=1"
        "&vk_language=ru&vk_access_token_settings=&vk_platform=android"
        "&sign=htQFduJpLxz7ribXRZpDFUH-XEUhC9rBPTJkjUFEkRA"
    )
    p = verify_launch_params(raw, "wvl68m4dR1UpLrVRli", 6736218)
    assert p is not None and p.user_id == 494075


def test_signature_valid_forged_foreign():
    assert verify_launch_params(launch_params(42), SECRET, APP_ID).user_id == 42
    forged = launch_params(42).replace("vk_user_id=42", "vk_user_id=43")
    assert verify_launch_params(forged, SECRET, APP_ID) is None
    assert verify_launch_params(launch_params(42, secret="other"), SECRET, APP_ID) is None
    assert verify_launch_params(launch_params(42, app_id=1), SECRET, APP_ID) is None
    assert verify_launch_params("", SECRET, APP_ID) is None
    assert verify_launch_params("vk_user_id=1", SECRET, APP_ID) is None


def test_week_boundaries_moscow():
    sunday_late = datetime(2026, 10, 4, 20, 59, 59, tzinfo=timezone.utc)  # 23:59:59 MSK Sunday
    monday = datetime(2026, 10, 4, 21, 0, 0, tzinfo=timezone.utc)  # 00:00 MSK Monday
    assert week_id(sunday_late) == "2026-09-28"
    assert week_id(monday) == "2026-10-05"
    assert week_reset_at(sunday_late) == monday


def test_run_token():
    t = make_run_token("s" * 20, "run", 5, 1000)
    assert check_run_token("s" * 20, t, "run", 5, 1500)
    assert not check_run_token("s" * 20, t, "run", 6, 1500)
    assert not check_run_token("s" * 20, t, "other", 5, 1500)
    assert not check_run_token("s" * 20, t, "run", 5, 1000 + 6 * 3600 + 1)
    assert not check_run_token("s" * 20, "garbage", "run", 5, 1500)


def test_validate_run_bounds():
    ok = dict(score=120, duration_ms=40_000, server_elapsed_ms=45_000, captures=40, tier=tier_for_score(120))
    assert validate_run(**ok).ok
    assert validate_run(**{**ok, "duration_ms": 2_999}).reason == "too_short"
    assert validate_run(**{**ok, "duration_ms": 48_001}).reason == "duration_mismatch"
    assert validate_run(**{**ok, "score": 741, "tier": tier_for_score(741)}).reason == "score_rate"
    assert validate_run(**{**ok, "captures": 59}).reason == "capture_rate"
    assert validate_run(**{**ok, "tier": 5}).reason == "tier_mismatch"
    assert validate_run(**{**ok, "score": 600, "tier": tier_for_score(600)}).review


def test_rate_limiter():
    now = [0.0]
    rl = RateLimiter(clock=lambda: now[0])
    for _ in range(3):
        assert rl.hit("k", 3, 60) == 0
    assert rl.hit("k", 3, 60) > 0
    now[0] = 61
    assert rl.hit("k", 3, 60) == 0
