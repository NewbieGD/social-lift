"""Coins and cosmetics. The server is the only place where coins and ownership change."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import cosmetics
from ..core import utcnow
from ..deps import ApiError
from ..models import CoinTx, OwnedCosmetic, User


async def owned_ids(session: AsyncSession, user_id: int) -> set[str]:
    rows = await session.execute(select(OwnedCosmetic.item_id).where(OwnedCosmetic.user_id == user_id))
    return {r for (r,) in rows.all()}


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
    """Opens everything the player's best single run deserves. Safe to call any number of times."""
    have = await owned_ids(session, user.id)
    return await grant(session, user, cosmetics.unlocked_by_record(user.best_all or 0, have), "record")


async def credit_run(session: AsyncSession, user: User, run_id: str, amount: int) -> int:
    """1 point of a counted run = 1 coin. The journal row is unique per run, so it pays once."""
    if amount <= 0:
        return 0
    user.coins = (user.coins or 0) + amount
    session.add(
        CoinTx(user_id=user.id, delta=amount, reason="run", ref=run_id, balance_after=user.coins, created_at=utcnow())
    )
    return amount


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
        "catalog": cosmetics.catalog_public(),
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


async def buy(session: AsyncSession, user: User, item_id: str) -> dict:
    """Buys an item for coins. The user row must be locked by the caller."""
    item = cosmetics.ITEMS.get(item_id)
    if item is None:
        raise ApiError(404, "unknown_item", "No such item")
    if item.price is None:
        raise ApiError(400, "not_for_sale", "This item is not for sale")
    if item_id in await owned_ids(session, user.id):
        raise ApiError(409, "already_owned", "You already have this item")
    if (user.coins or 0) < item.price:
        raise ApiError(402, "not_enough_coins", "Not enough coins")
    user.coins -= item.price
    session.add(
        CoinTx(user_id=user.id, delta=-item.price, reason="buy", ref=item_id, balance_after=user.coins, created_at=utcnow())
    )
    session.add(OwnedCosmetic(user_id=user.id, item_id=item_id, source="buy", acquired_at=utcnow()))
    await session.commit()
    return await state(session, user)
