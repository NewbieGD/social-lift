"""Coins and cosmetics. The server is the only place where coins and ownership change."""

from __future__ import annotations

import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import cosmetics, tunables
from . import gov
from ..core import utcnow
from ..deps import ApiError
from ..models import CoinTx, OwnedCosmetic, User


async def owned_ids(session: AsyncSession, user_id: int) -> set[str]:
    rows = await session.execute(select(OwnedCosmetic.item_id).where(OwnedCosmetic.user_id == user_id))
    owned = {r for (r,) in rows.all()}
    # The mayor and his assistants have their sets only while they hold the post.
    return owned | cosmetics.gov_items(gov.role_of(user_id))


async def grant(session: AsyncSession, user: User, item_ids: list[str], source: str) -> list[str]:
    """Gives items the player does not have yet. Returns the ones that were new."""
    have = await owned_ids(session, user.id)
    now = utcnow()
    new: list[str] = []
    for item_id in item_ids:
        if item_id in cosmetics.ITEMS and item_id not in have:
            session.add(OwnedCosmetic(user_id=user.id, item_id=item_id, source=source, acquired_at=now))
            have.add(item_id)
            new.append(item_id)
    if new:
        await session.flush()
    return new


async def sync_unlocks(session: AsyncSession, user: User) -> list[str]:
    """Opens what the player's best run and best duel streak deserve. Safe to call any number of times."""
    have = await owned_ids(session, user.id)
    new = await grant(session, user, cosmetics.unlocked_by_record(user.best_all or 0, have), "record")
    have |= set(new)
    new += await grant(session, user, cosmetics.unlocked_by_streak(user.best_duel_streak or 0, have), "duel")
    return new


async def roll_drop(session: AsyncSession, user: User) -> str | None:
    """Decides at the start of a run whether a cosmetic can be found in it, and which one.

    The server rolls, so a player cannot claim a part the server did not offer for this run.
    """
    options = cosmetics.droppable(await owned_ids(session, user.id))
    if not options or random.random() >= tunables.get("drop_chance"):
        return None
    return random.choice(options)


async def claim_drop(session: AsyncSession, user: User, drop_item: str | None, found: bool, score: int) -> list[str]:
    """Grants the rolled drop when the finished run reports it was picked up (and scored enough)."""
    if not found or not drop_item or score < tunables.get("drop_min_score"):
        return []
    return await grant(session, user, [drop_item], "drop")


# 10 points of a counted run = 1 coin (rounded down for each run): coins are meant to come slowly.
POINTS_PER_COIN = 10  # the default; the live value is tunables.get("points_per_coin")


async def credit_run(session: AsyncSession, user: User, run_id: str, score: int) -> int:
    """Pays coins for a counted run. The journal row is unique per run, so it pays once."""
    amount = max(0, score) // tunables.get("points_per_coin")
    # While the mayor is in the game and has switched the bonus on, everybody earns a little more.
    if amount > 0 and gov.bonus_active():
        amount += amount * tunables.get("gov_bonus_percent") // 100
    if amount <= 0:
        return 0
    user.coins = (user.coins or 0) + amount
    session.add(
        CoinTx(user_id=user.id, delta=amount, reason="run", ref=run_id, balance_after=user.coins, created_at=utcnow())
    )
    return amount


async def transfer_stake(session: AsyncSession, loser: User, winner: User, duel_id: str, stake: int) -> int:
    """The loser of a duel pays the winner (at most what the loser has). Once per duel (unique journal rows)."""
    amount = min(stake, max(0, loser.coins or 0))
    if amount <= 0:
        return 0
    now = utcnow()
    loser.coins = (loser.coins or 0) - amount
    winner.coins = (winner.coins or 0) + amount
    session.add(CoinTx(user_id=loser.id, delta=-amount, reason="duel", ref=duel_id, balance_after=loser.coins, created_at=now))
    session.add(CoinTx(user_id=winner.id, delta=amount, reason="duel", ref=duel_id, balance_after=winner.coins, created_at=now))
    return amount


async def duel_stakes(session: AsyncSession, duel_id: str) -> dict[int, int]:
    """Who got or paid how many coins in a duel: {user_id: delta}."""
    rows = await session.execute(select(CoinTx.user_id, CoinTx.delta).where(CoinTx.reason == "duel", CoinTx.ref == duel_id))
    return {int(u): int(d) for u, d in rows}


async def run_payout(session: AsyncSession, user_id: int, run_id: str) -> int:
    """What a finished run paid (for an idempotent retry of the finish request)."""
    row = await session.execute(
        select(CoinTx.delta).where(CoinTx.user_id == user_id, CoinTx.reason == "run", CoinTx.ref == run_id)
    )
    return int(row.scalar() or 0)


async def state(session: AsyncSession, user: User) -> dict:
    owned = await owned_ids(session, user.id)
    return {
        "coins": user.coins or 0,
        "owned": sorted(owned),
        "loadout": cosmetics.clean_loadout(user.loadout or {}, owned),
        "decor": cosmetics.clean_decor(user.decor or {}, owned),
        "duel_streak": user.duel_streak or 0,
        "best_duel_streak": user.best_duel_streak or 0,
        "catalog": cosmetics.catalog_public(),
        "products": cosmetics.products_public(),
    }


async def set_loadout(session: AsyncSession, user: User, loadout: dict) -> dict:
    """Wears or takes off items. A slot set to null is emptied; slots not mentioned stay as they are."""
    owned = await owned_ids(session, user.id)
    error = cosmetics.validate_loadout(loadout, owned)
    if error:
        raise ApiError(400, error, "Cannot wear this")
    current = cosmetics.clean_loadout(user.loadout or {}, owned)
    for slot, item_id in loadout.items():
        if item_id is None:
            current.pop(slot, None)
        else:
            current[slot] = item_id
    user.loadout = current
    await session.commit()
    return current


async def set_decor(session: AsyncSession, user: User, change: dict) -> dict:
    """Changes the main-screen decoration. A null clears a place; places not mentioned stay."""
    owned = await owned_ids(session, user.id)
    error = cosmetics.validate_decor(change, owned)
    if error:
        raise ApiError(400, error, "Cannot use this")
    current = cosmetics.clean_decor(user.decor or {}, owned)
    for key in ("bg", "frame", "fx", "pet"):
        if key in change:
            if change[key] is None:
                current.pop(key, None)
            else:
                current[key] = change[key]
    if "props" in change:
        # The whole list of placed objects is replaced.
        props = cosmetics._clean_placements(change["props"], owned)
        if props:
            current["props"] = props
        else:
            current.pop("props", None)
    user.decor = current
    await session.commit()
    return current


async def buy(session: AsyncSession, user: User, item_id: str) -> dict:
    """Buys an item for coins. The user row must be locked by the caller."""
    item = cosmetics.ITEMS.get(item_id)
    if item is None:
        raise ApiError(404, "unknown_item", "No such item")
    price = cosmetics.price_of(item)
    if price is None:
        raise ApiError(400, "not_for_sale", "This item is not for sale")
    if item_id in await owned_ids(session, user.id):
        raise ApiError(409, "already_owned", "You already have this item")
    if (user.coins or 0) < price:
        raise ApiError(402, "not_enough_coins", "Not enough coins")
    user.coins -= price
    session.add(
        CoinTx(user_id=user.id, delta=-price, reason="buy", ref=item_id, balance_after=user.coins, created_at=utcnow())
    )
    session.add(OwnedCosmetic(user_id=user.id, item_id=item_id, source="buy", acquired_at=utcnow()))
    await session.commit()
    return await state(session, user)
