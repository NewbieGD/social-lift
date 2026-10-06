"""Chat room rules that need no server: lifetime, reactions, blocks, complaint limits."""

from app.chat_room import (
    HISTORY_TTL_SEC,
    MUTE_AFTER_REPORTERS,
    REPORTS_PER_WINDOW,
    ChatRoom,
    ReportGuard,
)

H = HISTORY_TTL_SEC * 1000


def user(i: int) -> dict:
    return {"id": i, "name": f"u{i}", "photo": None, "rank": None}


def test_messages_expire_after_an_hour():
    room = ChatRoom()
    room.add(user(1), "old", now_ms=0)
    room.add(user(2), "fresh", now_ms=H - 1000)
    assert room.purge(now_ms=H - 1) is None  # nothing is an hour old yet
    cut = room.purge(now_ms=H + 1)
    assert cut == 1
    assert [m.text for m in room.msgs] == ["fresh"]


def test_history_hides_expired_even_before_purge_runs():
    room = ChatRoom()
    room.add(user(1), "old", now_ms=0)
    room.add(user(2), "fresh", now_ms=H)
    texts = [m["text"] for m in room.history_for(3, set(), now_ms=H + 5)]
    assert texts == ["fresh"]


def test_cap_still_applies():
    room = ChatRoom(cap=3)
    for i in range(5):
        room.add(user(1), str(i), now_ms=i)
    assert [m.text for m in room.msgs] == ["2", "3", "4"]


def test_blocked_players_are_not_in_history():
    room = ChatRoom()
    room.add(user(1), "from blocked", now_ms=10)
    room.add(user(2), "from friend", now_ms=11)
    shown = room.history_for(3, {1}, now_ms=20)
    assert [m["text"] for m in shown] == ["from friend"]


def test_reaction_set_switch_and_take_back():
    room = ChatRoom()
    m = room.add(user(1), "hi", now_ms=1)
    assert room.react(m, 5, "up") == "up"
    assert (len(m.up), len(m.down)) == (1, 0)
    assert room.react(m, 5, "down") == "down"  # switching moves the vote
    assert (len(m.up), len(m.down)) == (0, 1)
    assert room.react(m, 5, "down") is None  # same button again removes it
    assert (len(m.up), len(m.down)) == (0, 0)
    assert room.react(m, 5, "heart") is None  # unknown reaction is ignored


def test_public_view_has_counts_and_own_reaction():
    room = ChatRoom()
    m = room.add(user(1), "hi", now_ms=1)
    room.react(m, 5, "up")
    room.react(m, 6, "up")
    room.react(m, 7, "down")
    mine = room.public(m, 5)
    assert (mine["up"], mine["down"], mine["mine"]) == (2, 1, "up")
    assert room.public(m, 99)["mine"] is None


def test_get_by_id_rejects_junk():
    room = ChatRoom()
    m = room.add(user(1), "hi", now_ms=1)
    assert room.get(m.id) is m
    for junk in (None, "1", 1.0, True, -5):
        assert room.get(junk) is None


def test_report_validation():
    g = ReportGuard()
    assert g.check(1, 2, "words", 0) is None
    assert g.check(1, 2, "spam", 0) is None
    assert g.check(1, 2, "other", 0) is None
    assert g.check(1, 2, "rude", 0) == "bad"
    assert g.check(1, "2", "words", 0) == "bad"
    assert g.check(1, True, "words", 0) == "bad"
    assert g.check(1, 1, "words", 0) == "self"


def test_same_player_cannot_report_same_target_twice_in_an_hour():
    g = ReportGuard()
    assert g.check(1, 2, "words", 0) is None
    g.record(1, 2, 0)
    assert g.check(1, 2, "spam", 10) == "dup"
    assert g.check(1, 2, "spam", 3601) is None  # after the window it is allowed again


def test_report_limit_per_hour():
    g = ReportGuard()
    for target in range(100, 100 + REPORTS_PER_WINDOW):
        assert g.check(1, target, "words", 0) is None
        g.record(1, target, 0)
    assert g.check(1, 999, "words", 1) == "limit"
    assert g.check(1, 999, "words", 3601) is None


def test_mute_needs_several_different_players():
    g = ReportGuard()
    # One angry player cannot mute someone alone, however often they try.
    assert g.record(1, 50, 0) is False
    assert g.record(1, 50, 1) is False
    # The mute fires on the MUTE_AFTER_REPORTERS-th different player (player 1 already counts as the first).
    results = [g.record(r, 50, 2) for r in range(2, MUTE_AFTER_REPORTERS + 1)]
    assert results[-1] is True and not any(results[:-1])
    # After a mute the counter starts over.
    assert g.record(10, 50, 3) is False


def test_old_complaints_do_not_add_up():
    g = ReportGuard()
    g.record(1, 50, 0)
    g.record(2, 50, 1)
    assert g.record(3, 50, 3700) is False  # the first two are more than an hour old


def test_sweep_forgets_old_data():
    g = ReportGuard()
    g.record(1, 50, 0)
    g.sweep(10_000)
    assert g._sent == {} and g._against == {}
