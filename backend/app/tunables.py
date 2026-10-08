"""Game balance that can be changed WITHOUT a new deploy.

Every number here has a default in the code. The owner can override it from the admin page
(`/admin`, needs ADMIN_KEY): the override is stored in the database, takes effect within about
half a minute on every server instance and survives restarts. "Reset" removes the override and
the default from the code applies again.

Besides the numbers below, any item can have its own `price.<id>` (coins), `record.<id>` (record
needed) and `streak.<id>` (duel win streak needed) override.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Tunable:
    key: str
    default: float
    kind: str  # int | float
    lo: float
    hi: float
    group: str
    desc: str


TUNABLES: dict[str, Tunable] = {
    t.key: t
    for t in (
        Tunable("points_per_coin", 10, "int", 1, 1000, "Монеты", "Сколько очков забега дают 1 монету (чем больше число, тем медленнее копятся монеты)."),
        Tunable("duel_stake", 500, "int", 0, 100000, "Дуэли", "Ставка в дуэли в монетах: проигравший платит её победителю. 0 отключает ставку."),
        Tunable("invite_timeout_sec", 15, "int", 5, 120, "Дуэли", "Сколько секунд игрок может принять вызов на дуэль."),
        Tunable("drop_chance", 0.35, "float", 0, 1, "Находки", "Шанс (от 0 до 1), что в забеге вообще появится вещь на платформе."),
        Tunable("drop_min_score", 100, "int", 0, 100000, "Находки", "Сколько очков нужно набрать в забеге, чтобы найденная вещь засчиталась."),
        Tunable("chat_cooldown_sec", 30, "int", 0, 600, "Чат", "Пауза между сообщениями одного игрока (секунды)."),
        Tunable("chat_report_hide", 3, "int", 1, 50, "Чат", "Сколько разных жалоб убирают сообщение из чата."),
        Tunable("chat_report_mute", 5, "int", 1, 100, "Чат", "Сколько разных игроков за сутки должны пожаловаться, чтобы автора на время лишили права писать."),
        Tunable("chat_mute_sec", 3600, "int", 60, 604800, "Чат", "На сколько секунд автору запрещают писать после жалоб."),
    )
}

# Overrides loaded from the database: {key: number}. Replaced as a whole on reload.
_overrides: dict[str, float] = {}


def set_overrides(values: dict[str, float]) -> None:
    global _overrides
    _overrides = dict(values)


def overrides() -> dict[str, float]:
    return dict(_overrides)


def get(key: str):
    """The current value: the override if there is one, otherwise the default from the code."""
    t = TUNABLES[key]
    v = _overrides.get(key, t.default)
    return int(round(v)) if t.kind == "int" else float(v)


def item_override(prefix: str, item_id: str, default):
    """`price.<id>`, `record.<id>` or `streak.<id>`: an override for one item, or its default."""
    v = _overrides.get(f"{prefix}.{item_id}")
    return default if v is None else int(round(v))


def check(key: str, value: float, item_prefixes: dict[str, set[str]]) -> str | None:
    """Error code for a proposed override, or None. `item_prefixes` maps a prefix to valid item ids."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        return "bad_value"
    t = TUNABLES.get(key)
    if t is not None:
        return None if t.lo <= value <= t.hi else "out_of_range"
    prefix, _, item_id = key.partition(".")
    if prefix in item_prefixes and item_id in item_prefixes[prefix]:
        return None if 0 <= value <= 10_000_000 else "out_of_range"
    return "unknown_key"
