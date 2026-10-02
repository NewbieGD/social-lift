"""Launch parameter signature check, per https://dev.vk.ru/ru/games/development/parameters-sign."""

from __future__ import annotations

import base64
import hashlib
import hmac
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode

MAX_RAW_LENGTH = 4096


@dataclass(frozen=True)
class LaunchParams:
    user_id: int
    app_id: int
    platform: str
    language: str
    raw: dict[str, str]


def compute_sign(vk_params: dict[str, str], secret: str) -> str:
    query = urlencode(sorted(vk_params.items()), doseq=True)
    digest = hmac.new(secret.encode(), query.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def verify_launch_params(raw: str, secret: str, expected_app_id: int) -> LaunchParams | None:
    """Returns parsed params if the signature is valid and the app id matches, else None."""
    if not raw or not secret or len(raw) > MAX_RAW_LENGTH:
        return None
    raw = raw.lstrip("?")
    try:
        pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=False)
    except ValueError:
        return None
    params = dict(pairs)
    sign = params.get("sign")
    if not sign:
        return None
    vk_params = {k: v for k, v in params.items() if k.startswith("vk_")}
    if not vk_params:
        return None
    expected = compute_sign(vk_params, secret)
    if not hmac.compare_digest(expected, sign):
        return None
    try:
        user_id = int(vk_params.get("vk_user_id", "0"))
        app_id = int(vk_params.get("vk_app_id", "0"))
    except ValueError:
        return None
    if user_id <= 0 or app_id != expected_app_id:
        return None
    return LaunchParams(
        user_id=user_id,
        app_id=app_id,
        platform=vk_params.get("vk_platform", "")[:32],
        language=vk_params.get("vk_language", "")[:8],
        raw=vk_params,
    )
