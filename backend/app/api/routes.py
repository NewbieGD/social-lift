"""HTTP API under /api (design doc, section 8)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .. import game_config as gc
from ..config import settings
from ..core import aware, utcnow
from ..db import get_session
from ..deps import ApiError, Caller, current_user, enforce_limit
from ..schemas import BuyIn, ConsentIn, DecorIn, EventIn, LoadoutIn, PrivacyIn, RunFinishIn, SettingsIn
from ..services import crown, game, payments, public, shop
from ..services.profiles import refresh_profiles

router = APIRouter(prefix="/api")


@router.get("/health")
async def health() -> dict:
    return {"ok": True}


@router.post("/session/bootstrap")
async def bootstrap(
    background: BackgroundTasks,
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:boot", gc.LIMIT_DEFAULT)
    user = await game.get_or_create_user(session, caller)
    synced = aware(user.profile_synced_at)
    if synced is None or (utcnow() - synced).total_seconds() > gc.PROFILE_TTL_SEC:
        background.add_task(refresh_profiles, [user.id])
    # Players who already passed a record threshold get their cosmetics on the next start.
    if await shop.sync_unlocks(session, user):
        await session.commit()
    crown_info = await crown.info(session, user)
    stats = await game.player_stats(session, user)
    stats["crown"] = crown_info["crown"]
    return {
        "shop": await shop.state(session, user),
        "privacy": {"hide_vk_link": bool(user.hide_vk_link)},
        "crown": crown_info,
        "profile": game.profile_dict(user),
        "flags": {
            "consent_ok": game.consent_ok(user),
            "tutorial_done": user.tutorial_done,
        },
        "terms_version": settings.terms_version,
        "settings": user.settings or {},
        "settings_updated_at": user.settings_updated_at,
        "stats": stats,
        "server_time": int(utcnow().timestamp() * 1000),
        "ads": gc.ADS,
    }


@router.post("/consent")
async def consent(
    body: ConsentIn,
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:misc", gc.LIMIT_DEFAULT)
    if body.version != settings.terms_version:
        raise ApiError(409, "terms_outdated", "Terms version changed")
    user = await game.require_user(session, caller)
    user.consent_version = body.version
    user.consent_at = utcnow()
    await session.commit()
    return {"consent_ok": True}


@router.put("/settings")
async def put_settings(
    body: SettingsIn,
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:misc", gc.LIMIT_DEFAULT)
    user = await game.require_user(session, caller)
    # Last writer by client timestamp wins (sync between devices).
    if body.updated_at >= (user.settings_updated_at or 0):
        user.settings = body.settings
        user.settings_updated_at = body.updated_at
        await session.commit()
    return {"settings": user.settings or {}, "settings_updated_at": user.settings_updated_at}


@router.post("/runs/start")
async def runs_start(
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:start", gc.LIMIT_RUNS)
    user = await game.require_user(session, caller)
    return await game.start_run(session, user)


@router.post("/runs/finish")
async def runs_finish(
    body: RunFinishIn,
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:finish", gc.LIMIT_RUNS)
    return await game.finish_run(session, caller, body)


@router.get("/crown")
async def crown_state(
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Crown holder of the week and the player's own pending crown notices."""
    enforce_limit(f"u:{caller.user_id}:crown", gc.LIMIT_DEFAULT)
    user = await game.require_user(session, caller)
    return await crown.info(session, user)


@router.get("/shop")
async def shop_state(
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:shop", gc.LIMIT_DEFAULT)
    user = await game.require_user(session, caller)
    return await shop.state(session, user)


@router.put("/loadout")
async def put_loadout(
    body: LoadoutIn,
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:shop", gc.LIMIT_DEFAULT)
    user = await game.require_user(session, caller, lock=True)
    return {"loadout": await shop.set_loadout(session, user, body.loadout)}


@router.put("/privacy")
async def put_privacy(
    body: PrivacyIn,
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:privacy", gc.LIMIT_DEFAULT)
    user = await game.require_user(session, caller, lock=True)
    user.hide_vk_link = body.hide_vk_link
    await session.commit()
    return {"hide_vk_link": user.hide_vk_link}


@router.post("/vk/payments")
async def vk_payments(request: Request, session: AsyncSession = Depends(get_session)) -> JSONResponse:
    """Notifications of the VK Payments system (purchases for votes). Signed by VK, no launch params."""
    body = await request.body()
    if len(body) > 8192:
        return JSONResponse(payments._err(payments.BAD_REQUEST, "Too large"))
    return JSONResponse(await payments.handle(session, payments.parse_body(body)))


@router.get("/players/{user_id}")
async def get_player(
    user_id: int,
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:players", gc.LIMIT_DEFAULT)
    await game.require_user(session, caller)
    return await public.public_profile(session, user_id)


@router.put("/decor")
async def put_decor(
    body: DecorIn,
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:shop", gc.LIMIT_DEFAULT)
    user = await game.require_user(session, caller, lock=True)
    return {"decor": await shop.set_decor(session, user, body.decor)}


@router.post("/shop/buy")
async def shop_buy(
    body: BuyIn,
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:shop", gc.LIMIT_DEFAULT)
    user = await game.require_user(session, caller, lock=True)
    return await shop.buy(session, user, body.item_id)


@router.post("/tutorial/complete")
async def tutorial_complete(
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:misc", gc.LIMIT_DEFAULT)
    user = await game.require_user(session, caller)
    user.tutorial_done = True
    await session.commit()
    return {"tutorial_done": True}


@router.get("/leaderboard")
async def get_leaderboard(
    background: BackgroundTasks,
    scope: Literal["week", "all", "duels"] = Query("week"),
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:lb", gc.LIMIT_LEADERBOARD)
    user = await game.require_user(session, caller)
    response, stale = await game.leaderboard(session, user, scope)
    if stale:
        background.add_task(refresh_profiles, stale)
    return response


@router.post("/events")
async def post_event(
    body: EventIn,
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:ev", gc.LIMIT_DEFAULT)
    await game.log_event(session, body.type, caller.platform, body.value)
    return {"ok": True}


@router.delete("/me")
async def delete_me(
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:misc", gc.LIMIT_DEFAULT)
    await game.delete_player(session, caller)
    return {"deleted": True}
