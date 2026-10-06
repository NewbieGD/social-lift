"""Cosmetic catalog and its rules. Pure functions: no database, easy to test.

Cosmetics never change the score. A player owns an item once (kept for good) and wears at most
one item per slot. Ways to get an item (`unlock`):

  {"record": N}   - the best score of a single run reached N (granted automatically)
  {"drop": True}  - found in a run: the server rolls a drop for the run at its start and grants it
                    when the finished run reports that it was picked up
  {"duel_streak": N} - N duel wins in a row (best streak, granted automatically)
  price           - bought for coins (None = not for sale yet)
"""

from __future__ import annotations

from dataclasses import dataclass

SLOTS = ("head", "torso", "arms", "legs", "feet")


@dataclass(frozen=True)
class Item:
    id: str
    slot: str
    # Set id for matching sets ("" = a single item).
    set: str = ""
    # Record needed (best single-run score); None = not earned by record.
    record: int | None = None
    # Duel wins in a row needed; None = not earned in duels.
    duel_streak: int | None = None
    # Price in coins; None = not for sale (yet).
    price: int | None = None
    # May drop on a platform during a run.
    drop: bool = False


def _set(set_id: str, parts: tuple[str, ...], **how) -> list[Item]:
    """One Item per part. Values in `how` are either a single value or a tuple, one per part."""
    out = []
    for i, slot in enumerate(parts):
        kw = {k: (v[i] if isinstance(v, tuple) else v) for k, v in how.items()}
        out.append(Item(f"{set_id}_{slot}", slot, set=set_id, **kw))
    return out


FULL = ("head", "torso", "arms", "legs")

# How each part is obtained (placeholders: tune the numbers here, nothing else depends on them).
#  starter - the four starter pieces open with a record of 500
#  steel / captain / acrobat - found on platforms during runs (random)
#  night  - opened by records, one part at a time
#  ninja  - opened by duel win streaks
#  brute  - opened by high records
ITEMS: dict[str, Item] = {
    i.id: i
    for i in (
        *_set("starter", ("head", "torso", "legs", "feet"), record=500),
        *_set("steel", FULL, drop=True),
        *_set("night", FULL, record=(800, 1200, 1700, 2200)),
        *_set("captain", FULL, drop=True),
        *_set("ninja", FULL, duel_streak=(2, 4, 7, 10)),
        *_set("acrobat", FULL, drop=True),
        *_set("brute", FULL, record=(2600, 3000, 3500, 4000)),
    )
}

# Run drops: chance that a run has a drop at all, and the least score a run needs to claim it.
DROP_CHANCE = 0.35
DROP_MIN_SCORE = 100


def catalog_public() -> list[dict]:
    """What the client needs to draw the shop and the requirements."""
    return [
        {
            "id": i.id,
            "slot": i.slot,
            "set": i.set,
            "record": i.record,
            "duel_streak": i.duel_streak,
            "price": i.price,
            "drop": i.drop,
        }
        for i in ITEMS.values()
    ]


def unlocked_by_record(best_score: int, owned: set[str]) -> list[str]:
    """Items that the player's best single run opens and that are not owned yet."""
    return [i.id for i in ITEMS.values() if i.record is not None and best_score >= i.record and i.id not in owned]


def unlocked_by_streak(best_streak: int, owned: set[str]) -> list[str]:
    """Items that a best duel win streak opens and that are not owned yet."""
    return [
        i.id for i in ITEMS.values() if i.duel_streak is not None and best_streak >= i.duel_streak and i.id not in owned
    ]


def droppable(owned: set[str]) -> list[str]:
    """Items that can still drop for a player (not owned yet)."""
    return [i.id for i in ITEMS.values() if i.drop and i.id not in owned]


def clean_loadout(loadout: dict, owned: set[str]) -> dict[str, str]:
    """Keeps only valid entries: a known slot, an owned item that belongs to that slot."""
    out: dict[str, str] = {}
    for slot, item_id in (loadout or {}).items():
        item = ITEMS.get(item_id) if isinstance(item_id, str) else None
        if slot in SLOTS and item is not None and item.slot == slot and item_id in owned:
            out[slot] = item_id
    return out


def validate_loadout(loadout: dict, owned: set[str]) -> str | None:
    """Returns an error code for a loadout request, or None when it is fine."""
    if not isinstance(loadout, dict) or len(loadout) > len(SLOTS):
        return "loadout_invalid"
    for slot, item_id in loadout.items():
        if slot not in SLOTS:
            return "unknown_slot"
        if item_id is None:
            continue  # taking the slot off
        item = ITEMS.get(item_id) if isinstance(item_id, str) else None
        if item is None:
            return "unknown_item"
        if item.slot != slot:
            return "wrong_slot"
        if item_id not in owned:
            return "not_owned"
    return None
