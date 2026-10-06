import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ.update(
    {
        "APP_ENV": "test",
        "VK_APP_ID": "7000000",
        "VK_SECRET_KEY": "test-secret-key",
        "RUN_SIGNING_SECRET": "run-signing-secret-for-tests",
        "ALLOWED_ORIGINS": "https://example.github.io",
        "DATABASE_URL": f"sqlite+aiosqlite:///{_tmp}/test.db",
        "TERMS_VERSION": "1",
    }
)

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.core import limiter  # noqa: E402
from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services import game  # noqa: E402
from app.vk_sign import compute_sign  # noqa: E402

APP_ID = 7000000
SECRET = "test-secret-key"


def launch_params(user_id: int, app_id: int = APP_ID, secret: str = SECRET, platform: str = "mobile_android") -> str:
    vk = {
        "vk_user_id": str(user_id),
        "vk_app_id": str(app_id),
        "vk_platform": platform,
        "vk_language": "ru",
        "vk_access_token_settings": "",
        "vk_is_app_user": "1",
        "vk_ts": "1790000000",
    }
    sign = compute_sign(vk, secret)
    return "&".join(f"{k}={v}" for k, v in vk.items()) + f"&sign={sign}"


def headers(user_id: int, **kw) -> dict:
    return {"X-VK-Launch-Params": launch_params(user_id, **kw)}


@pytest.fixture(autouse=True)
async def fresh_db():
    await engine.dispose()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    limiter.reset()
    game.clear_leaderboard_cache()
    yield
    # Each test has its own event loop: drop pooled connections bound to this one.
    await engine.dispose()


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def ready_player(client, user_id: int) -> None:
    r = await client.post("/api/session/bootstrap", headers=headers(user_id))
    assert r.status_code == 200, r.text
    r = await client.post("/api/consent", json={"version": 1}, headers=headers(user_id))
    assert r.status_code == 200, r.text
