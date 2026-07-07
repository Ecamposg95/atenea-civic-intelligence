"""Ágora Civic Intelligence — FastAPI application entrypoint.

API-first: every capability is exposed under ``/api``. In production this same
service also serves the built React SPA (single Railway service), with a
catch-all route so client-side routing survives deep links and refreshes.
"""

import os
from contextlib import asynccontextmanager

from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.core.rate_limiting import limiter
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routers import (
    admin,
    analytics,
    arco,
    audit,
    auth,
    campaigns,
    casos,
    catalogs,
    exports,
    forms,
    health,
    ingest,
    intel,
    maps,
    militantes,
    organizations,
    privacy,
    promovidos,
    public_forms,
    registros,
    reports,
    responses,
    sources,
    territory,
    users,
)

configure_logging()
logger = get_logger("agora")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run the idempotent DB bootstrap at startup (runtime has private networking).

    Disable with RUN_DB_BOOTSTRAP=0 (e.g. when migrations own the schema).
    """
    from app.core.crypto import ensure_crypto_ready
    ensure_crypto_ready()
    from app.core.storage import ensure_storage_ready, storage_enabled
    if storage_enabled():
        ensure_storage_ready()
    if os.getenv("RUN_DB_BOOTSTRAP", "1") == "1":
        from app.bootstrap import run_bootstrap

        try:
            run_bootstrap()
        except Exception:
            logger.exception("Database bootstrap failed during startup")
            raise
    if os.getenv("SEED_DEMO_TERRITORY", "").lower() == "true":
        from app.database import SessionLocal
        from app.seeds.demo_territory import seed_demo_territory

        with SessionLocal() as db:
            seed_demo_territory(db)
    yield


async def _rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return the standard error envelope for 429 responses."""
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "error": {
                "message": f"Too many requests: {exc.detail}",
                "status": status.HTTP_429_TOO_MANY_REQUESTS,
            }
        },
    )


def create_app() -> FastAPI:
    """Application factory."""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description="API-first GovTech platform for civic, electoral and territorial intelligence.",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # --- Rate limiting (slowapi) --------------------------------------------
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # --- CORS ---------------------------------------------------------------
    _configure_cors(app)

    # --- Security headers ---------------------------------------------------
    # Starlette builds the middleware stack in reverse-add order, so
    # SecurityHeadersMiddleware is INNER to CORSMiddleware.  On the response
    # path it runs BEFORE CORS, appending security headers to every response
    # (including CORS preflight 200/204s) while leaving CORS headers untouched.
    app.add_middleware(SecurityHeadersMiddleware)

    _configure_error_handlers(app)
    _register_routers(app)
    _mount_spa(app)  # must come AFTER routers (registers a catch-all)
    return app


def _configure_cors(app: FastAPI) -> None:
    """Production-safe CORS: explicit origins only (no wildcard + credentials)."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS or [],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


_SENSITIVE_FIELDS = frozenset({"clave_elector", "clave_elector_enc", "password", "current_password", "new_password", "telefono", "nombre_completo", "direccion", "colonia"})
_REDACTED = "***"


def _redact_validation_errors(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Strip submitted PII values from Pydantic validation error dicts.

    Pydantic v2 includes an ``input`` key with the submitted value and may also
    include the offending value inside ``url`` or ``ctx``.  For any error whose
    location (``loc``) contains a sensitive field name we replace ``input`` with
    the redaction sentinel.  The ``loc``, ``msg``, and ``type`` keys are kept
    intact so callers can still act on the error.

    AC-7.5: clave_elector, password, telefono must never appear in 422 bodies.
    """
    redacted = []
    for err in errors:
        loc: tuple = err.get("loc", ())
        # Check whether any element of the location tuple is a sensitive field.
        if any(str(part) in _SENSITIVE_FIELDS for part in loc):
            err = {k: (v if k not in ("input", "ctx", "url") else _REDACTED) for k, v in err.items()}
        redacted.append(err)
    return redacted


def _configure_error_handlers(app: FastAPI) -> None:
    """Uniform JSON error envelope (Golden Rule #8)."""

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"message": exc.detail, "status": exc.status_code}},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "message": "Validation error",
                    "status": status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "details": _redact_validation_errors(exc.errors()),
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "message": "Internal server error",
                    "status": status.HTTP_500_INTERNAL_SERVER_ERROR,
                }
            },
        )


def _register_routers(app: FastAPI) -> None:
    """Mount all API routers under the configured prefix."""
    prefix = settings.API_PREFIX
    for module in (health, auth, users, organizations, campaigns, maps, analytics, sources, audit, intel, catalogs, territory, ingest, exports, registros, militantes, promovidos, privacy, admin, arco, reports, forms, responses, casos, public_forms):
        app.include_router(module.router, prefix=prefix)


def _resolve_frontend_dist() -> str | None:
    """Locate the built SPA directory across local and Railway run layouts."""
    here = os.path.dirname(os.path.abspath(__file__))  # backend/app
    backend_dir = os.path.dirname(here)  # backend
    candidates = [
        settings.FRONTEND_DIST,
        os.path.join(os.getcwd(), "frontend", "dist"),
        os.path.join(backend_dir, "..", "frontend", "dist"),
    ]
    for candidate in candidates:
        if candidate and os.path.isdir(candidate):
            return os.path.abspath(candidate)
    return None


def _mount_spa(app: FastAPI) -> None:
    """Serve the built React SPA; catch-all returns index.html for client routes."""
    dist = _resolve_frontend_dist()
    if not dist:
        logger.warning(
            "Frontend build not found (FRONTEND_DIST=%s); SPA not mounted. "
            "Run `npm run build` in frontend/.",
            settings.FRONTEND_DIST,
        )
        return

    index_file = os.path.join(dist, "index.html")
    assets_dir = os.path.join(dist, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_catch_all(full_path: str):
        # API paths must 404 as API, never fall through to the SPA.
        if full_path.startswith("api"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
        # Serve real static files (favicon, etc.) when present.
        candidate = os.path.join(dist, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(index_file)

    logger.info("SPA mounted from %s", dist)


app = create_app()
