"""Server-side game numbers. Keep TIER_THRESHOLDS in sync with frontend gameConfig.ts."""

TIER_THRESHOLDS: list[int] = [0, 60, 150, 280, 450, 650, 900, 1200, 1600, 2100, 2700, 3500, 4500]

# Anti-cheat limits for a finished run (design doc, section 8).
MAX_POINTS_PER_SECOND = 16
POINTS_MARGIN = 100
REVIEW_SHARE = 0.7
MAX_CAPTURES_PER_SECOND = 1.4
CAPTURES_MARGIN = 2
MIN_DURATION_MS = 3000
CLOCK_TOLERANCE_MS = 3000
RUN_TOKEN_TTL_SEC = 6 * 3600
MAX_INPUT_LOG = 20000

# Rate limits: (requests, window seconds).
LIMIT_RUNS = (12, 60)
LIMIT_LEADERBOARD = (30, 60)
LIMIT_IP = (120, 60)
LIMIT_DEFAULT = (60, 60)

LEADERBOARD_SIZE = 30
LEADERBOARD_CACHE_SEC = 20
WEEKS_TO_KEEP = 8
PROFILE_TTL_SEC = 24 * 3600

# Interstitial ads (design doc, section 9). Sent to the client in bootstrap.
ADS = {
    "enabled": False,
    "min_runs_before": 2,
    "every_n_runs": 3,
    "min_interval_sec": 120,
    "timeout_sec": 5,
}


def tier_for_score(score: int) -> int:
    tier = 0
    for i, threshold in enumerate(TIER_THRESHOLDS):
        if score >= threshold:
            tier = i
    return tier
