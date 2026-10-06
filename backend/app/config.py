"""Runtime settings, read from environment variables only (no secrets in code)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _list(name: str) -> list[str]:
    raw = os.environ.get(name, "")
    return [x.strip().rstrip("/") for x in raw.split(",") if x.strip()]


def _db_url(raw: str) -> str:
    # Accept plain postgres URLs and switch them to the async driver.
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://"):]
    if raw.startswith("postgresql://"):
        raw = "postgresql+asyncpg://" + raw[len("postgresql://"):]
    return raw


@dataclass(frozen=True)
class Settings:
    app_env: str = field(default_factory=lambda: os.environ.get("APP_ENV", "production"))
    vk_app_id: int = field(default_factory=lambda: int(os.environ.get("VK_APP_ID", "0") or 0))
    vk_secret_key: str = field(default_factory=lambda: os.environ.get("VK_SECRET_KEY", ""))
    vk_service_token: str = field(default_factory=lambda: os.environ.get("VK_SERVICE_TOKEN", ""))
    vk_api_base: str = field(default_factory=lambda: os.environ.get("VK_API_BASE", "https://api.vk.com/method"))
    database_url: str = field(
        default_factory=lambda: _db_url(os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./dev.db"))
    )
    run_signing_secret: str = field(default_factory=lambda: os.environ.get("RUN_SIGNING_SECRET", ""))
    allowed_origins: list[str] = field(default_factory=lambda: _list("ALLOWED_ORIGINS"))
    terms_version: int = field(default_factory=lambda: int(os.environ.get("TERMS_VERSION", "1") or 1))
    # Unsigned requests with X-Dev-User are accepted only in development.
    dev_auth_bypass: bool = field(default_factory=lambda: _bool("DEV_AUTH_BYPASS"))

    @property
    def is_dev(self) -> bool:
        return self.app_env == "development"

    def validate(self) -> None:
        """Refuse to start with an unsafe production configuration."""
        if self.is_dev:
            return
        problems = []
        if self.dev_auth_bypass:
            problems.append("DEV_AUTH_BYPASS must be off outside development")
        if not self.vk_app_id:
            problems.append("VK_APP_ID is required")
        if not self.vk_secret_key:
            problems.append("VK_SECRET_KEY is required")
        if len(self.run_signing_secret) < 16:
            problems.append("RUN_SIGNING_SECRET must be at least 16 characters")
        if not self.allowed_origins:
            problems.append("ALLOWED_ORIGINS is required")
        if problems:
            raise RuntimeError("Unsafe configuration: " + "; ".join(problems))


settings = Settings()
