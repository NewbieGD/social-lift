"""HTTP API under /api (design doc, section 8)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from .. import game_config as gc
from ..config import settings
from ..core import aware, utcnow
from ..db import get_session
from ..deps import ApiError, Caller, current_user, enforce_limit
from ..schemas import ConsentIn, EventIn, RunFinishIn, SettingsIn
from ..services import game
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
    return {
        "profile": game.profile_dict(user),
        "flags": {
            "consent_ok": game.consent_ok(user),
            "tutorial_done": user.tutorial_done,
        },
        "terms_version": settings.terms_version,
        "settings": user.settings or {},
        "settings_updated_at": user.settings_updated_at,
        "stats": await game.player_stats(session, user),
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



@router.get("/runs/history")
async def runs_history(
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:misc", gc.LIMIT_DEFAULT)
    user = await game.require_user(session, caller)
    rows = await game.run_history(session, user)
    return {"runs": rows}


@router.delete("/me")
async def delete_me(
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    enforce_limit(f"u:{caller.user_id}:misc", gc.LIMIT_DEFAULT)
    await game.delete_player(session, caller)
    return {"deleted": True}
