"""Cosmetic catalog and its rules. Pure functions: no database, easy to test.

Cosmetics never change the score. A player owns an item once (kept for good) and wears at most
one item per slot. Ways to get an item (`unlock`):

  {"record": N}   - the best score of a single run reached N (granted automatically)
  {"drop": True}  - found in a run: the server rolls a drop for the run at its start and grants it
                    when the finished run reports that it was picked up
  {"duel_streak": N} - N duel wins in a row against different players (best streak, granted automatically)
  price           - bought for coins (None = not for sale yet)
"""

from __future__ import annotations

from dataclasses import dataclass

from . import tunables

SLOTS = ("head", "torso", "arms", "legs", "feet", "torch")


# What an item is. Styles are worn on the hero (one per body slot); the rest decorate the main
# screen: backgrounds, objects standing near the hero, frames and effects.
KINDS = ("style", "bg", "prop", "frame", "fx", "pet")


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
    # Premium: sold for VK votes as part of this product (see PRODUCTS); empty = not premium.
    product: str = ""
    # Government: lent for the term to the mayor ("mayor") or to the assistants ("advisor"); never owned.
    gov: str = ""


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
        # Reward for 10 duel wins in a row against different players: a chrome combat set (5 parts).
        *_set("legion", ("head", "torso", "arms", "legs", "torch"), duel_streak=10),
        # Flashlights: each one replaces the flashlight in the hand. Some are bought, some are found in runs.
        *_set("phone", ("torch",), price=300),
        *_set("wood", ("torch",), drop=True),
        *_set("saber", ("torch",), price=900),
        *_set("fireball", ("torch",), drop=True),
        *_set("jar", ("torch",), price=600),
    )
}

# Main-screen decorations (and pets). For these items `slot` is the kind. The PRICES ARE PLACEHOLDERS (coins; 10 points of a run = 1 coin):
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

# Premium: sold for VK votes. The price lives here, on the server: the client only names the product.
# A product gives all of its items at once. The set has 5 parts (the flashlight is a slot of its own).
PREMIUM_SET = ("head", "torso", "arms", "legs", "torch")
ITEMS.update({i.id: i for i in _set("seraph", PREMIUM_SET, product="seraph_set")})
# The mayor's set (5 parts) and the throne background, and the assistants' set (5 parts). They are not
# in owned_cosmetics: the player has them only while he holds the post (see services/gov.py).
ITEMS.update({i.id: i for i in _set("mayor", PREMIUM_SET, gov="mayor")})
ITEMS["bg_throne"] = Item("bg_throne", "bg", kind="bg", gov="mayor")
ITEMS.update({i.id: i for i in _set("advisor", PREMIUM_SET, gov="advisor")})
ITEMS["pet_spark"] = Item("pet_spark", "pet", kind="pet", product="pet_spark")
# A winged trophy that floats beside the player: the reward for 10 duel wins in a row.
ITEMS["pet_trophy"] = Item("pet_trophy", "pet", kind="pet", duel_streak=10)


@dataclass(frozen=True)
class Product:
    id: str
    # Shown in the VK purchase window (48 characters at most).
    title: str
    votes: int
    items: tuple[str, ...]


PRODUCTS: dict[str, Product] = {
    "seraph_set": Product("seraph_set", "Набор «Серафим»: 5 вещей", 10, tuple(f"seraph_{s}" for s in PREMIUM_SET)),
    "pet_spark": Product("pet_spark", "Питомец «Золотая искра»", 10, ("pet_spark",)),
}


def products_public() -> list[dict]:
    return [{"id": p.id, "title": p.title, "votes": p.votes, "items": list(p.items)} for p in PRODUCTS.values()]


# Run drops: chance that a run has a drop at all, and the least score a run needs to claim it.
# The drop chance and the score needed live in tunables.py (drop_chance, drop_min_score).


def catalog_public() -> list[dict]:
    """What the client needs to draw the shop and the requirements."""
    return [
        {
            "id": i.id,
            "slot": i.slot,
            "set": i.set,
            "record": record_of(i),
            "duel_streak": streak_of(i),
            "price": price_of(i),
            "drop": i.drop,
            "kind": i.kind,
            "product": i.product,
            "gov": i.gov,
        }
        for i in ITEMS.values()
    ]


def unlocked_by_record(best_score: int, owned: set[str]) -> list[str]:
    """Items that the player's best single run opens and that are not owned yet."""
    return [i.id for i in ITEMS.values() if record_of(i) is not None and best_score >= record_of(i) and i.id not in owned]


def gov_items(role: str | None) -> set[str]:
    """The ids lent to the holder of a post: the mayor gets the mayor's things, an assistant the advisor's."""
    want = {"mayor": "mayor", "assistant": "advisor"}.get(role or "")
    return {i.id for i in ITEMS.values() if want and i.gov == want}


def price_of(i: Item) -> int | None:
    """The price in coins, with the owner's override (see tunables.py)."""
    return None if i.price is None else tunables.item_override("price", i.id, i.price)


def record_of(i: Item) -> int | None:
    return None if i.record is None else tunables.item_override("record", i.id, i.record)


def streak_of(i: Item) -> int | None:
    return None if i.duel_streak is None else tunables.item_override("streak", i.id, i.duel_streak)


def unlocked_by_streak(best_streak: int, owned: set[str]) -> list[str]:
    """Items that a best duel win streak opens and that are not owned yet."""
    return [
        i.id for i in ITEMS.values() if streak_of(i) is not None and best_streak >= streak_of(i) and i.id not in owned
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


# Objects on the main screen can be placed anywhere (up to this many) and turned.
PROP_MAX = 8
PROP_ROTATIONS = (0, 90, 270)
# Old clients and old data kept objects in three fixed places: they move to these positions.
_LEGACY_SPOTS = {"left": (0.12, 0.88, 0), "right": (0.9, 0.9, 0), "wall": (0.14, 0.45, 0)}


def _legacy_props(props: dict) -> list[dict]:
    out = []
    for spot, item_id in props.items():
        if spot in _LEGACY_SPOTS and isinstance(item_id, str):
            x, y, r = _LEGACY_SPOTS[spot]
            out.append({"id": item_id, "x": x, "y": y, "r": r})
    return out


def _clean_placements(raw, owned: set[str]) -> list[dict]:
    """Valid placements only: an owned object, once, with a position on the screen and a turn."""
    if isinstance(raw, dict):
        raw = _legacy_props(raw)
    out: list[dict] = []
    seen: set[str] = set()
    for p in raw if isinstance(raw, list) else []:
        if not isinstance(p, dict):
            continue
        item = ITEMS.get(p.get("id")) if isinstance(p.get("id"), str) else None
        x, y, r = p.get("x"), p.get("y"), p.get("r", 0)
        if (
            item is None
            or item.kind != "prop"
            or item.id not in owned
            or item.id in seen
            or isinstance(x, bool)
            or isinstance(y, bool)
            or not isinstance(x, (int, float))
            or not isinstance(y, (int, float))
            or not (0 <= x <= 1 and 0 <= y <= 1)
            or r not in PROP_ROTATIONS
        ):
            continue
        seen.add(item.id)
        out.append({"id": item.id, "x": round(float(x), 3), "y": round(float(y), 3), "r": int(r)})
        if len(out) >= PROP_MAX:
            break
    return out


def clean_decor(decor: dict, owned: set[str]) -> dict:
    """Keeps only valid decor: owned items of the right kind, valid object placements."""
    out: dict = {}
    for key in ("bg", "frame", "fx", "pet"):
        item = ITEMS.get(decor.get(key)) if isinstance(decor.get(key), str) else None
        if item is not None and item.kind == key and item.id in owned:
            out[key] = item.id
    props = _clean_placements(decor.get("props"), owned)
    if props:
        out["props"] = props
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
            raw = _legacy_props(value) if isinstance(value, dict) else value
            if not isinstance(raw, list) or len(raw) > PROP_MAX:
                return "decor_invalid"
            ids: set[str] = set()
            for p in raw:
                if not isinstance(p, dict):
                    return "decor_invalid"
                item = ITEMS.get(p.get("id")) if isinstance(p.get("id"), str) else None
                if item is None:
                    return "unknown_item"
                if item.kind != "prop":
                    return "wrong_kind"
                if item.id not in owned:
                    return "not_owned"
                if item.id in ids:
                    return "duplicate_item"
                ids.add(item.id)
                x, y = p.get("x"), p.get("y")
                if (
                    isinstance(x, bool)
                    or isinstance(y, bool)
                    or not isinstance(x, (int, float))
                    or not isinstance(y, (int, float))
                    or not (0 <= x <= 1 and 0 <= y <= 1)
                    or p.get("r", 0) not in PROP_ROTATIONS
                ):
                    return "bad_position"
        else:
            return "decor_invalid"
    return None
