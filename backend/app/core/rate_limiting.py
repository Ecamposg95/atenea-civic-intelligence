"""Rate-limiting primitives (shared between main.py and routers).

The `limiter` object is created once here and imported by:
  - ``app/main.py``  — sets ``app.state.limiter`` and registers the 429 handler
  - ``app/routers/auth.py`` — applies ``@limiter.limit(...)`` to the login route

Test-safety
-----------
Rate limiting is controlled by the ``RATE_LIMIT_ENABLED`` environment variable
(read at *request* time by the key function, not at import time).  Tests set
``RATE_LIMIT_ENABLED=false`` in ``conftest.py`` before any app imports; this
makes the key function return a unique UUID per request so no two requests ever
share a bucket and the limit is never hit.

The focused 429 test overrides ``RATE_LIMIT_ENABLED=true`` via
``monkeypatch.setenv``, then calls ``limiter.reset()`` to wipe all counters,
and hammers the login endpoint until it gets a 429.
"""

import os
import uuid

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _rate_limit_key(request: Request) -> str:
    """Return the rate-limit bucket key for this request.

    When ``RATE_LIMIT_ENABLED`` is falsy (the default in the test environment),
    a unique UUID is returned so every request lands in its own bucket and the
    configured limit is never triggered.  In production the real client IP is
    used so that the per-IP limit is enforced correctly.
    """
    if os.getenv("RATE_LIMIT_ENABLED", "true").lower() in ("false", "0", "no"):
        return f"no-limit-{uuid.uuid4()}"
    return client_ip(request)


def client_ip(request: Request) -> str:
    """Best-effort real client IP behind Railway's edge proxy.

    Uvicorn runs without trusted proxy headers, so ``request.client.host`` is
    the proxy's address — every user would share ONE login bucket. Railway's
    edge *appends* the connecting client's IP to ``X-Forwarded-For``, so the
    right-most entry is the one the edge saw (left-most entries are
    client-supplied and spoofable, so they are ignored). Falls back to the
    socket peer when the header is absent (local dev, tests).
    """
    xff = request.headers.get("x-forwarded-for", "")
    hops = [h.strip() for h in xff.split(",") if h.strip()]
    if hops:
        return hops[-1]
    return get_remote_address(request)


#: Singleton limiter instance shared across the application.
limiter = Limiter(key_func=_rate_limit_key)
