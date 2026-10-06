"""Application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import game_config as gc
from .api.routes import router
from .duel_ws import router as duel_router
from .config import settings
from .core import limiter
from .db import Base, engine
from .deps import ApiError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")

MAX_BODY_BYTES = 600_000


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.validate()
    if settings.is_dev:
        # Local convenience; production uses Alembic migrations.
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    log.info("started env=%s app_id=%s", settings.app_env, settings.vk_app_id)
    yield
    await engine.dispose()


app = FastAPI(
    title="Social Lift API",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.is_dev else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if settings.is_dev else None,
)
app.include_router(router)
app.include_router(duel_router)


def error(status: int, code: str, message: str, headers: dict | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status, headers=headers)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    real = request.headers.get("x-real-ip", "")
    if real:
        return real.strip()[:64]
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def guard(request: Request, call_next):
    # Body size limit (rule 1.2.6).
    length = request.headers.get("content-length")
    if length and (not length.isdigit() or int(length) > MAX_BODY_BYTES):
        return error(413, "payload_too_large", "Request body is too large")
    # Per-IP limit for every API call except health checks.
    if request.url.path.startswith("/api/") and request.url.path != "/api/health" and request.method != "OPTIONS":
        retry = limiter.hit(f"ip:{client_ip(request)}", *gc.LIMIT_IP)
        if retry > 0:
            return error(429, "rate_limited", "Too many requests", {"Retry-After": str(int(retry) + 1)})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "no-store"
    return response


# Added last, so it is the outermost layer and every response gets CORS headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins or (["*"] if settings.is_dev else []),
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-VK-Launch-Params", "X-Dev-User"],
    max_age=600,
)


@app.exception_handler(ApiError)
async def api_error(_: Request, exc: ApiError) -> JSONResponse:
    return error(exc.status, exc.code, exc.message, exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    return error(422, "invalid_request", "Request validation failed")


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    codes = {404: "not_found", 405: "method_not_allowed"}
    return error(exc.status_code, codes.get(exc.status_code, "http_error"), "Request failed")


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled error: %s", type(exc).__name__)
    return error(500, "server_error", "Internal error")


@app.get("/")
async def root() -> dict:
    return {"ok": True}
