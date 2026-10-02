"""Pure logic without I/O: weeks, run tokens, run validation and rate limiting."""

from __future__ import annotations

import hashlib
import hmac
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from . import game_config as gc

MSK = timezone(timedelta(hours=3))  # Moscow has no DST.


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; treat them as UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------- Weeks (Monday 00:00 Moscow) ----------

def week_start(now: datetime) -> datetime:
    local = now.astimezone(MSK)
    monday = (local - timedelta(days=local.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return monday.astimezone(timezone.utc)


def week_id(now: datetime) -> str:
    return week_start(now).astimezone(MSK).strftime("%Y-%m-%d")


def week_reset_at(now: datetime) -> datetime:
    return week_start(now) + timedelta(days=7)


def old_week_ids(now: datetime, keep: int = gc.WEEKS_TO_KEEP) -> str:
    """Week ids strictly older than this are stale (ids sort lexicographically)."""
    return (week_start(now) - timedelta(days=7 * (keep - 1))).astimezone(MSK).strftime("%Y-%m-%d")


# ---------- Run tokens ----------

def make_run_token(secret: str, run_id: str, user_id: int, started_ts: int) -> str:
    msg = f"{run_id}.{user_id}.{started_ts}".encode()
    sig = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
    return f"{started_ts}.{sig}"


def check_run_token(secret: str, token: str, run_id: str, user_id: int, now_ts: int) -> bool:
    try:
        ts_raw, sig = token.split(".", 1)
        started_ts = int(ts_raw)
    except ValueError:
        return False
    expected = make_run_token(secret, run_id, user_id, started_ts)
    if not hmac.compare_digest(expected, token):
        return False
    return 0 <= now_ts - started_ts <= gc.RUN_TOKEN_TTL_SEC


# ---------- Run validation ----------

@dataclass(frozen=True)
class RunVerdict:
    ok: bool
    reason: str = ""
    review: bool = False


def validate_run(
    *,
    score: int,
    duration_ms: int,
    server_elapsed_ms: int,
    captures: int,
    tier: int,
) -> RunVerdict:
    if duration_ms < gc.MIN_DURATION_MS:
        return RunVerdict(False, "too_short")
    if duration_ms > server_elapsed_ms + gc.CLOCK_TOLERANCE_MS:
        return RunVerdict(False, "duration_mismatch")
    seconds = duration_ms / 1000
    limit = gc.MAX_POINTS_PER_SECOND * seconds + gc.POINTS_MARGIN
    if score > limit:
        return RunVerdict(False, "score_rate")
    if captures > seconds * gc.MAX_CAPTURES_PER_SECOND + gc.CAPTURES_MARGIN:
        return RunVerdict(False, "capture_rate")
    if score > 0 and captures == 0:
        return RunVerdict(False, "score_without_captures")
    if tier != gc.tier_for_score(score):
        return RunVerdict(False, "tier_mismatch")
    return RunVerdict(True, review=score > limit * gc.REVIEW_SHARE)


# ---------- Rate limiting ----------

class RateLimiter:
    """Sliding-window limiter kept in process memory (one process). Swap for Redis later."""

    def __init__(self, clock=time.monotonic) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._clock = clock
        self._calls = 0

    def hit(self, key: str, limit: int, window: float) -> float:
        """Registers a request. Returns 0 if allowed, else seconds until retry."""
        now = self._clock()
        q = self._hits.setdefault(key, deque())
        while q and q[0] <= now - window:
            q.popleft()
        if len(q) >= limit:
            return max(0.1, q[0] + window - now)
        q.append(now)
        self._calls += 1
        if self._calls % 1000 == 0:
            self._sweep(now)
        return 0.0

    def _sweep(self, now: float, max_window: float = 600) -> None:
        stale = [k for k, q in self._hits.items() if not q or q[-1] <= now - max_window]
        for k in stale:
            del self._hits[k]

    def reset(self) -> None:
        self._hits.clear()


limiter = RateLimiter()
