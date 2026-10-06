"""Chat room state, without FastAPI or the database, so it is easy to test.

- Messages live for one hour (HISTORY_TTL_SEC); older ones are dropped by `purge`.
- Every message can get one like or dislike from each other player.
- `history_for` builds what one player may see: no expired messages and nothing from players
  that this player has blocked.
- `ReportGuard` limits complaints and decides when a player has been reported by enough
  different people to be muted for a while.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

HISTORY_TTL_SEC = 3600
MAX_HISTORY = 60  # safety cap next to the lifetime

REACTIONS = ("up", "down")

REPORT_REASONS = ("words", "spam", "other")
REPORT_WINDOW_SEC = 3600
REPORTS_PER_WINDOW = 10  # complaints one player may send per hour
MUTE_AFTER_REPORTERS = 3  # different players that must complain within the window
MUTE_SEC = 3600
MAX_BLOCKS = 200


@dataclass
class Msg:
    id: int
    ts: int  # milliseconds
    user: dict
    text: str
    up: set[int] = field(default_factory=set)
    down: set[int] = field(default_factory=set)

    @property
    def author(self) -> int:
        return int(self.user["id"])


class ChatRoom:
    def __init__(self, ttl_sec: int = HISTORY_TTL_SEC, cap: int = MAX_HISTORY) -> None:
        self.ttl_ms = ttl_sec * 1000
        self.cap = cap
        self.seq = 0
        self.msgs: deque[Msg] = deque()

    def add(self, user: dict, text: str, now_ms: int) -> Msg:
        self.seq += 1
        m = Msg(id=self.seq, ts=now_ms, user=user, text=text)
        self.msgs.append(m)
        while len(self.msgs) > self.cap:
            self.msgs.popleft()
        return m

    def get(self, msg_id: object) -> Msg | None:
        if not isinstance(msg_id, int) or isinstance(msg_id, bool):
            return None
        for m in reversed(self.msgs):
            if m.id == msg_id:
                return m
        return None

    def cutoff(self, now_ms: int) -> int:
        return now_ms - self.ttl_ms

    def purge(self, now_ms: int) -> int | None:
        """Drops messages older than the lifetime. Returns the cutoff time if anything was removed."""
        cut = self.cutoff(now_ms)
        removed = False
        while self.msgs and self.msgs[0].ts < cut:
            self.msgs.popleft()
            removed = True
        return cut if removed else None

    def react(self, m: Msg, user_id: int, kind: str) -> str | None:
        """Sets, switches or removes (same button twice) the player's reaction. Returns the new one."""
        if kind not in REACTIONS:
            return None
        mine = self.mine(m, user_id)
        m.up.discard(user_id)
        m.down.discard(user_id)
        if mine == kind:
            return None
        (m.up if kind == "up" else m.down).add(user_id)
        return kind

    @staticmethod
    def mine(m: Msg, user_id: int) -> str | None:
        return "up" if user_id in m.up else "down" if user_id in m.down else None

    def public(self, m: Msg, viewer_id: int) -> dict:
        return {
            "id": m.id,
            "ts": m.ts,
            "user": m.user,
            "text": m.text,
            "up": len(m.up),
            "down": len(m.down),
            "mine": self.mine(m, viewer_id),
        }

    def history_for(self, viewer_id: int, blocked: set[int], now_ms: int) -> list[dict]:
        cut = self.cutoff(now_ms)
        return [self.public(m, viewer_id) for m in self.msgs if m.ts >= cut and m.author not in blocked]


class ReportGuard:
    """Complaint limits and the automatic mute. All in memory (one server process)."""

    def __init__(self) -> None:
        self._sent: dict[int, list[float]] = {}  # reporter -> times of their complaints
        self._against: dict[int, dict[int, float]] = {}  # target -> {reporter: time}

    def check(self, reporter: int, target: object, reason: object, now: float) -> str | None:
        """None if the complaint may be sent, otherwise 'bad', 'self', 'limit' or 'dup'."""
        if not isinstance(target, int) or isinstance(target, bool) or reason not in REPORT_REASONS:
            return "bad"
        if target == reporter:
            return "self"
        recent = [t for t in self._sent.get(reporter, []) if t > now - REPORT_WINDOW_SEC]
        self._sent[reporter] = recent
        if len(recent) >= REPORTS_PER_WINDOW:
            return "limit"
        if self._against.get(target, {}).get(reporter, -1e12) > now - REPORT_WINDOW_SEC:
            return "dup"
        return None

    def record(self, reporter: int, target: int, now: float) -> bool:
        """Registers an accepted complaint. True when the target has now been reported by enough
        different players within the window (the caller mutes them)."""
        self._sent.setdefault(reporter, []).append(now)
        by = self._against.setdefault(target, {})
        by[reporter] = now
        for r in [r for r, t in by.items() if t <= now - REPORT_WINDOW_SEC]:
            del by[r]
        if len(by) >= MUTE_AFTER_REPORTERS:
            by.clear()  # the next mute needs a new set of complaints
            return True
        return False

    def sweep(self, now: float) -> None:
        for reporter in list(self._sent):
            self._sent[reporter] = [t for t in self._sent[reporter] if t > now - REPORT_WINDOW_SEC]
            if not self._sent[reporter]:
                del self._sent[reporter]
        for target in list(self._against):
            by = self._against[target]
            for r in [r for r, t in by.items() if t <= now - REPORT_WINDOW_SEC]:
                del by[r]
            if not by:
                del self._against[target]
