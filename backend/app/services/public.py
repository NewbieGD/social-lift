"""What other players may see about a player: the in-game profile."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from .. import cosmetics
from ..deps import ApiError
from ..models import User
from . import crown, game, shop


async def public_profile(session: AsyncSession, target_id: int) -> dict:
    """The game profile of a player: how they look, their records and their collection.

    No private data: only what the leaderboards already show plus the cosmetics they wear.
    """
    user = await session.get(User, target_id)
    if user is None or user.profile_deactivated:
        raise ApiError(404, "no_player", "Player not found")
    stats = await game.player_stats(session, user)
    owned = await shop.owned_ids(session, user.id)
    holder_id = await crown.refresh(session)
    styles_total = sum(1 for i in cosmetics.ITEMS.values() if i.kind == "style")
    return {
        "id": user.id,
        "name": user.display_name,
        "photo": user.photo_url,
        "link": not user.hide_vk_link,
        "crown": holder_id == user.id,
        "stats": {
            "best_all": stats["best_all"],
            "best_tier": stats["best_tier"],
            "last_tier": stats["last_tier"],
            "rank_all": stats["rank_all"],
            "rank_week": stats["rank_week"],
            "duel_wins": stats["duel_wins"],
            "total_runs": stats["total_runs"],
            "best_combo": stats["best_combo"],
        },
        "items_mask": user.items_mask or 0,
        "loadout": cosmetics.clean_loadout(user.loadout or {}, owned),
        "decor": cosmetics.clean_decor(user.decor or {}, owned),
        "styles_owned": sum(1 for i in owned if cosmetics.ITEMS[i].kind == "style"),
        "styles_total": styles_total,
        "collection_owned": len(owned),
        "collection_total": len(cosmetics.ITEMS),
    }
