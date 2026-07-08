"""Security HTTP response-headers middleware.

Adds a standard set of browser-security headers to every response:

  * ``X-Content-Type-Options: nosniff``
  * ``X-Frame-Options: DENY``
  * ``Referrer-Policy: no-referrer``
  * ``Content-Security-Policy`` — sane defaults compatible with the Vite SPA
    and MapLibre (blob: workers, data: fonts/images).
  * ``Strict-Transport-Security`` — production only (gated on ``is_production``).

The entire middleware is gated by ``settings.SECURITY_HEADERS_ENABLED``
(default ``True``).  Set it to ``False`` in unit tests that need a clean
header slate, or to verify the gate itself.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings

# Content-Security-Policy compatible with:
#   - Vite SPA (inline scripts/styles during dev; hash-based in prod is ideal
#     but 'unsafe-inline' keeps this configuration zero-friction)
#   - MapLibre GL JS (blob: web-workers, data: / https: tile images)
#   - PWA service worker at same-origin /sw.js (worker-src 'self')
#   - Google Fonts (Sora/Manrope/JetBrains) — stylesheet from fonts.googleapis.com,
#     font files from fonts.gstatic.com (see frontend/index.html)
_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' blob:; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "img-src 'self' data: blob: https:; "
    "connect-src 'self' https:; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "worker-src 'self' blob:;"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add standard browser-security headers to every HTTP response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        if not settings.SECURITY_HEADERS_ENABLED:
            return response

        # Use setdefault so downstream middleware / route handlers can override
        # specific headers when legitimately needed.
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Content-Security-Policy", _CSP)

        # HSTS is only meaningful over HTTPS; skip in dev/test environments.
        if settings.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )

        return response
