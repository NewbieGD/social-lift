"""VK notifications (notifications.sendMessage) with the service token.

Used for duel challenges: the challenged player gets a VK notification even if the game is in
the background. VK delivers it only to players who allowed notifications for the game
(the client asks once with VKWebAppAllowNotifications). Failures never affect the game.
"""

from __future__ import annotations

import logging
import random
import time

import httpx

from ..config import settings

log = logging.getLogger("notify")

# At most one notification per player per minute, so nobody can be spammed with challenges.
COOLDOWN_SEC = 60
_last_sent: dict[int, float] = {}


def _may_send(user_id: int) -> bool:
    now = time.monotonic()
    if len(_last_sent) > 5000:
        for uid, t in list(_last_sent.items()):
            if now - t > COOLDOWN_SEC:
                _last_sent.pop(uid, None)
    if now - _last_sent.get(user_id, -1e9) < COOLDOWN_SEC:
        return False
    _last_sent[user_id] = now
    return True


async def send_notification(user_id: int, message: str) -> bool:
    """Returns True if VK accepted the notification. Never raises."""
    if not settings.vk_service_token or not _may_send(user_id):
        return False
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            res = await client.post(
                f"{settings.vk_api_base}/notifications.sendMessage",
                data={
                    "user_ids": str(user_id),
                    "message": message[:254],
                    "random_id": random.randint(1, 2**31 - 1),
                    "access_token": settings.vk_service_token,
                    "v": "5.199",
                },
            )
        payload = res.json()
    except Exception as exc:  # noqa: BLE001 - notifications are best effort
        log.warning("notification failed: %s", type(exc).__name__)
        return False
    if "error" in payload:
        log.warning("notifications.sendMessage error %s", payload["error"].get("error_code"))
        return False
    rows = payload.get("response") or []
    return bool(rows and rows[0].get("status"))


def duel_challenge_text(from_name: str | None) -> str:
    who = (from_name or "Игрок").strip()[:60]
    return f"{who} вызывает вас на дуэль в «Социальном лифте»! Зайдите в игру и примите вызов."


def crown_lost_text(new_holder: str | None) -> str:
    who = (new_holder or "Игрок").strip()[:60]
    return f"{who} теперь с короной — лидер недельного рейтинга в «Социальном лифте»! Заходите и верните корону себе."


def crown_expired_text() -> str:
    return "Неделя закончилась, корона лидера снята. Играйте — новая корона ждёт самого быстрого в «Социальном лифте»!"


def crown_won_text() -> str:
    return "Вы лидер недельного рейтинга — корона ваша! Удержите первое место в «Социальном лифте»."
