"""The government API: the state of the election, candidacy, voting, the mayor's management, the bell."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from . import duel_ws
from . import game_config as gc
from .db import get_session
from .deps import Caller, current_user, enforce_limit
from .services import game, gov

router = APIRouter(prefix="/api")


class VoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_id: int


class AssistantIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int


class RespondIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    accept: bool


class SettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bonus: bool | None = None
    play_color: str | None = None


async def _user(caller: Caller, session: AsyncSession, key: str):
    enforce_limit(f"u:{caller.user_id}:{key}", gc.LIMIT_DEFAULT)
    return await game.require_user(session, caller)


@router.get("/gov/state")
async def gov_state(caller: Caller = Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict:
    return await gov.state(session, await _user(caller, session, "gov"))


@router.post("/gov/apply")
async def gov_apply(caller: Caller = Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict:
    user = await _user(caller, session, "gov")
    await gov.apply(session, user)
    return await gov.state(session, user)


@router.post("/gov/vote")
async def gov_vote(body: VoteIn, caller: Caller = Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict:
    user = await _user(caller, session, "gov")
    await gov.vote(session, user, body.candidate_id)
    return await gov.state(session, user)


@router.get("/gov/find")
async def gov_find(
    which: str = Query("top", pattern="^(top|chat|rivals)$"),
    q: str = Query("", max_length=30),
    caller: Caller = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await _user(caller, session, "govfind")
    chat_ids = {c.user_id for c in duel_ws.chat_members()}
    return {"players": await gov.find_players(session, user, which, q.strip(), chat_ids)}


@router.post("/gov/assistants")
async def gov_invite(body: AssistantIn, caller: Caller = Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict:
    user = await _user(caller, session, "gov")
    who = await gov.invite_assistant(session, user, body.user_id)
    await duel_ws.chat_notice("assistant_invited", who)
    return await gov.state(session, user)


@router.delete("/gov/assistants/{user_id}")
async def gov_remove(user_id: int, caller: Caller = Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict:
    user = await _user(caller, session, "gov")
    await gov.remove_assistant(session, user, user_id)
    return await gov.state(session, user)


@router.post("/gov/respond")
async def gov_respond(body: RespondIn, caller: Caller = Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict:
    user = await _user(caller, session, "gov")
    who = await gov.respond(session, user, body.accept)
    if body.accept:
        await duel_ws.chat_notice("assistant_set", who)
    return await gov.state(session, user)


@router.put("/gov/settings")
async def gov_settings(body: SettingsIn, caller: Caller = Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict:
    user = await _user(caller, session, "gov")
    await gov.set_settings(session, user, body.bonus, body.play_color)
    return await gov.state(session, user)


@router.post("/gov/ping")
async def gov_ping(caller: Caller = Depends(current_user)) -> dict:
    """The mayor's client says every minute that he is in the game (the coin bonus works only then)."""
    enforce_limit(f"u:{caller.user_id}:ping", gc.LIMIT_DEFAULT)
    gov.touch(caller.user_id)
    return {"bonus_active": gov.bonus_active()}


@router.get("/notifications")
async def notifications(caller: Caller = Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict:
    return await gov.notifications(session, await _user(caller, session, "notif"))


@router.post("/notifications/read")
async def notifications_read(caller: Caller = Depends(current_user), session: AsyncSession = Depends(get_session)) -> dict:
    user = await _user(caller, session, "notif")
    await gov.mark_read(session, user)
    return {"unread": 0}
