"""Cosmetic catalog and its rules. Pure functions: no database, easy to test.

Cosmetics never change the score. A player owns an item once (kept for good) and wears at most
one item per slot. Ways to get an item (`unlock`):

  {"record": N}   - the best score of a single run reached N (granted automatically)
  {"drop": True}  - found in a run (granted when the run reports it; wired in a later stage)
  {"duel_streak": N} - N duel wins in a row (a later stage)
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
    # Price in coins; None = not for sale (yet).
    price: int | None = None
    drop: bool = False


# Stage 1 holds the four starter items; sets, backgrounds, objects and pets are added with
# their own stages. The art for these items is drawn by the client.
ITEMS: dict[str, Item] = {
    i.id: i
    for i in (
        Item("starter_head", "head", set="starter", record=500),
        Item("starter_torso", "torso", set="starter", record=500),
        Item("starter_legs", "legs", set="starter", record=500),
        Item("starter_feet", "feet", set="starter", record=500),
    )
}


def catalog_public() -> list[dict]:
    """What the client needs to draw the shop and the requirements."""
    return [
        {"id": i.id, "slot": i.slot, "set": i.set, "record": i.record, "price": i.price, "drop": i.drop}
        for i in ITEMS.values()
    ]


def unlocked_by_record(best_score: int, owned: set[str]) -> list[str]:
    """Items that the player's best single run opens and that are not owned yet."""
    return [i.id for i in ITEMS.values() if i.record is not None and best_score >= i.record and i.id not in owned]


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
