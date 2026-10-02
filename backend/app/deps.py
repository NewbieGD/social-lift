"""Request dependencies: VK authentication and per-user rate limits."""

from __future__ import annotations

import math
from dataclasses import dataclass

from fastapi import Request

from .config import settings
from .core import limiter
from .vk_sign import verify_launch_params


class ApiError(Exception):
    """Rendered as {"error": {"code", "message"}} with the given status."""

    def __init__(self, status: int, code: str, message: str = "", headers: dict | None = None) -> None:
        self.status = status
        self.code = code
        self.message = message or code
        self.headers = headers or {}


@dataclass(frozen=True)
class Caller:
    user_id: int
    platform: str


def current_user(request: Request) -> Caller:
    raw = request.headers.get("x-vk-launch-params", "")
    params = verify_launch_params(raw, settings.vk_secret_key, settings.vk_app_id) if raw else None
    if params:
        return Caller(user_id=params.user_id, platform=params.platform)
    if settings.is_dev and settings.dev_auth_bypass:
        dev = request.headers.get("x-dev-user", "")
        if dev.isdigit() and int(dev) > 0:
            return Caller(user_id=int(dev), platform="dev")
    raise ApiError(401, "unauthorized", "Invalid or missing launch parameters")


def enforce_limit(key: str, limit: tuple[int, int]) -> None:
    retry = limiter.hit(key, limit[0], limit[1])
    if retry > 0:
        raise ApiError(
            429,
            "rate_limited",
            "Too many requests",
            headers={"Retry-After": str(math.ceil(retry))},
        )
