"""Refreshes names and avatars via users.get with the service token (no extra user permissions)."""

from __future__ import annotations

import logging
import time

import httpx
from sqlalchemy import select

from ..config import settings
from ..core import utcnow
from ..db import SessionLocal
from ..models import User

log = logging.getLogger("profiles")

_in_flight: set[int] = set()
_last_call = 0.0
MIN_INTERVAL_SEC = 1.0
BATCH = 100


def format_name(first: str, last: str) -> str | None:
    """"Name L." as shown in the leaderboard; None lets the client use its own fallback text."""
    first = (first or "").strip()
    last = (last or "").strip()
    name = f"{first} {last[0]}." if last else first
    return name[:64] or None


async def refresh_profiles(user_ids: list[int]) -> None:
    """Background task. Failures are logged and ignored: the client shows a default avatar."""
    global _last_call
    if not settings.vk_service_token:
        return
    ids = [i for i in dict.fromkeys(user_ids) if i not in _in_flight][:BATCH]
    if not ids or time.monotonic() - _last_call < MIN_INTERVAL_SEC:
        return
    _last_call = time.monotonic()
    _in_flight.update(ids)
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                f"{settings.vk_api_base}/users.get",
                data={
                    "user_ids": ",".join(map(str, ids)),
                    "fields": "photo_100",
                    "access_token": settings.vk_service_token,
                    "v": "5.199",
                    "lang": "ru",
                },
            )
        payload = resp.json()
        items = payload.get("response")
        if not isinstance(items, list):
            log.warning("users.get failed: %s", payload.get("error", {}).get("error_code"))
            return
        by_id = {int(x.get("id", 0)): x for x in items if isinstance(x, dict)}
        now = utcnow()
        async with SessionLocal() as session:
            result = await session.execute(select(User).where(User.id.in_(ids)))
            for user in result.scalars():
                info = by_id.get(user.id)
                user.profile_synced_at = now
                if not info:
                    continue
                deactivated = bool(info.get("deactivated"))
                user.profile_deactivated = deactivated
                user.display_name = None if deactivated else format_name(
                    str(info.get("first_name", "")), str(info.get("last_name", ""))
                )
                photo = info.get("photo_100")
                user.photo_url = photo if isinstance(photo, str) and photo.startswith("https://") else None
            await session.commit()
    except Exception as exc:  # noqa: BLE001 - background job must never crash the app
        log.warning("profile refresh error: %s", type(exc).__name__)
    finally:
        _in_flight.difference_update(ids)
