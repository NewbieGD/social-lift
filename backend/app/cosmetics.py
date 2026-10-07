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


# What an item is. Styles are worn on the hero (one per body slot); the rest decorate the main
# screen: backgrounds, objects standing near the hero, frames and effects.
KINDS = ("style", "bg", "prop", "frame", "fx", "pet")
# Places for objects near the hero.
PROP_SPOTS = ("left", "right", "wall")


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
    kind: str = "style"


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

# Main-screen decorations (and pets). For these items `slot` is the kind. The PRICES ARE PLACEHOLDERS (coins):
# change them here. The default background (the brick alley) is free and is not an item.
DECOR: tuple[Item, ...] = (
    Item("bg_dusk", "bg", kind="bg", record=100),
    Item("bg_roof", "bg", kind="bg", price=600),
    Item("bg_metro", "bg", kind="bg", price=800),
    Item("bg_neon", "bg", kind="bg", price=1200),
    Item("bg_winter", "bg", kind="bg", price=1500),
    Item("bg_space", "bg", kind="bg", price=2500),
    Item("prop_football", "prop", kind="prop", record=700),
    Item("prop_basketball", "prop", kind="prop", record=700),
    Item("prop_lamp", "prop", kind="prop", price=200),
    Item("prop_bat", "prop", kind="prop", price=300),
    Item("prop_cup", "prop", kind="prop", price=400),
    Item("prop_sword", "prop", kind="prop", price=800),
    Item("prop_tv", "prop", kind="prop", price=1000),
    Item("frame_gold", "frame", kind="frame", price=500),
    Item("frame_neon", "frame", kind="frame", price=900),
    Item("fx_sparks", "fx", kind="fx", price=400),
    Item("fx_snow", "fx", kind="fx", price=700),
    # Pets are decoration too: they walk on the main screen and run or fly beside the hero in a run.
    Item("pet_cat", "pet", kind="pet", record=1300),
    Item("pet_dog", "pet", kind="pet", record=1300),
    Item("pet_parrot", "pet", kind="pet", record=1300),
)
ITEMS.update({i.id: i for i in DECOR})

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
            "kind": i.kind,
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
    return [i.id for i in ITEMS.values() if i.drop and i.kind == "style" and i.id not in owned]


def clean_loadout(loadout: dict, owned: set[str]) -> dict[str, str]:
    """Keeps only valid entries: a known slot, an owned item that belongs to that slot."""
    out: dict[str, str] = {}
    for slot, item_id in (loadout or {}).items():
        item = ITEMS.get(item_id) if isinstance(item_id, str) else None
        if slot in SLOTS and item is not None and item.kind == "style" and item.slot == slot and item_id in owned:
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
        if item.kind != "style" or item.slot != slot:
            return "wrong_slot"
        if item_id not in owned:
            return "not_owned"
    return None


def clean_decor(decor: dict, owned: set[str]) -> dict:
    """Keeps only valid decor: owned items of the right kind, known spots."""
    out: dict = {}
    for key in ("bg", "frame", "fx", "pet"):
        item = ITEMS.get(decor.get(key)) if isinstance(decor.get(key), str) else None
        if item is not None and item.kind == key and item.id in owned:
            out[key] = item.id
    props = {}
    for spot, item_id in (decor.get("props") or {}).items():
        item = ITEMS.get(item_id) if isinstance(item_id, str) else None
        if spot in PROP_SPOTS and item is not None and item.kind == "prop" and item.id in owned:
            props[spot] = item.id
    if props:
        # One object cannot stand in two places.
        seen: set[str] = set()
        out["props"] = {k: v for k, v in props.items() if not (v in seen or seen.add(v))}
    return out


def validate_decor(change: dict, owned: set[str]) -> str | None:
    """Error code for a decor change request, or None. A null value clears that place."""
    if not isinstance(change, dict):
        return "decor_invalid"
    for key, value in change.items():
        if key in ("bg", "frame", "fx", "pet"):
            if value is None:
                continue
            item = ITEMS.get(value) if isinstance(value, str) else None
            if item is None:
                return "unknown_item"
            if item.kind != key:
                return "wrong_kind"
            if value not in owned:
                return "not_owned"
        elif key == "props":
            if not isinstance(value, dict):
                return "decor_invalid"
            for spot, item_id in value.items():
                if spot not in PROP_SPOTS:
                    return "unknown_spot"
                if item_id is None:
                    continue
                item = ITEMS.get(item_id) if isinstance(item_id, str) else None
                if item is None:
                    return "unknown_item"
                if item.kind != "prop":
                    return "wrong_kind"
                if item_id not in owned:
                    return "not_owned"
        else:
            return "decor_invalid"
    return None
