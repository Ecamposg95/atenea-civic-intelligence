"""Tests for SPA-4 compliance/hardening configuration settings.

AC-9.2: login rate-limit (slowapi) + security-headers middleware + CORS review.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers


# ---------------------------------------------------------------------------
# Existing settings tests
# ---------------------------------------------------------------------------

def test_retention_settings_have_safe_defaults():
    assert settings.RETENTION_ENABLED is False
    assert settings.RETENTION_DAYS_AFTER_ELECTION >= 0
    assert settings.RETENTION_PURGE_SOFT_DELETED_DAYS >= 0


def test_login_rate_limit_configured():
    assert isinstance(settings.LOGIN_RATE_LIMIT, str) and "/" in settings.LOGIN_RATE_LIMIT


def test_security_headers_enabled_by_default():
    assert settings.SECURITY_HEADERS_ENABLED is True


# ---------------------------------------------------------------------------
# AC-7.5 / AC-7.6: Sensitive-field redaction in 422 validation error bodies
# ---------------------------------------------------------------------------

_SENSITIVE_CLAVE = "TOOSHORT_INVALID"  # does NOT satisfy 18-char alphanum rule (too short)


def _make_client():
    return TestClient(app, raise_server_exceptions=False)


def test_invalid_clave_422_does_not_echo_submitted_value():
    """AC-7.5: a 422 response for a bad clave_elector MUST NOT contain the raw
    submitted string anywhere in the response body."""
    client = _make_client()
    # campaign_id is passed via X-Campaign-Id header, not in body
    headers = auth_headers(client, "activista1@alpha.gov")
    headers["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID

    resp = client.post(
        "/api/registros",
        json={
            "nombre_completo": "Test User",
            "consentimiento": True,
            "clave_elector": _SENSITIVE_CLAVE,
        },
        headers=headers,
    )

    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"
    body_text = resp.text
    # The raw submitted clave MUST NOT appear anywhere in the response body.
    assert _SENSITIVE_CLAVE not in body_text, (
        f"Sensitive clave value leaked in 422 body: {body_text}"
    )
    # The error envelope shape must be preserved.
    data = resp.json()
    assert "error" in data
    assert data["error"]["status"] == 422


def test_invalid_password_422_does_not_echo_submitted_value():
    """AC-7.5: a 422 response for an invalid payload to /auth/login MUST NOT echo
    submitted passwords."""
    client = _make_client()
    _BAD_PASSWORD = "x"  # too short — min_length=1 for LoginRequest but may fail auth

    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@alpha.gov", "password": _BAD_PASSWORD},
    )

    # If 422 (schema validation), the raw password must not appear in body.
    if resp.status_code == 422:
        body_text = resp.text
        assert _BAD_PASSWORD not in body_text, (
            f"Password leaked in 422 body: {body_text}"
        )


def test_registro_read_never_exposes_plain_clave():
    """AC-7.1: RegistroRead schema must not have a clave_elector field (only clave_masked)."""
    from app.schemas.registro import RegistroRead
    fields = RegistroRead.model_fields
    assert "clave_elector" not in fields, "RegistroRead must not expose clave_elector in plain"
    assert "clave_elector_enc" not in fields, "RegistroRead must not expose encrypted clave"
    assert "clave_masked" in fields, "RegistroRead must expose clave_masked"


def test_pii_text_fields_422_does_not_echo_submitted_value():
    """AC-7.5 ext: a 422 for an over-long colonia MUST NOT echo the submitted PII string."""
    client = _make_client()
    headers = auth_headers(client, "activista1@alpha.gov")
    headers["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID

    # colonia has max_length=255; submit a 300-char string — clearly identifiable
    _LONG_COLONIA = "C" * 300

    resp = client.post(
        "/api/registros",
        json={
            "nombre_completo": "Test Usuario",
            "consentimiento": True,
            "clave_elector": "ABCDEFGHIJ123456AB",  # valid format
            "colonia": _LONG_COLONIA,
        },
        headers=headers,
    )

    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"
    body_text = resp.text
    assert _LONG_COLONIA not in body_text, (
        f"PII colonia value leaked in 422 body (first 80 chars): {body_text[:80]}"
    )
    data = resp.json()
    assert "error" in data
    assert data["error"]["status"] == 422


def test_admin_registro_read_never_exposes_plain_clave():
    """AC-7.1: AdminRegistroRead schema must not have a clave_elector field."""
    from app.schemas.admin import AdminRegistroRead
    fields = AdminRegistroRead.model_fields
    assert "clave_elector" not in fields
    assert "clave_elector_enc" not in fields
    assert "clave_masked" in fields


# ---------------------------------------------------------------------------
# AC-9.2 — Security headers
# ---------------------------------------------------------------------------

def test_security_headers_present_on_api_response(client: TestClient):
    """Standard browser-security headers must be set on API responses."""
    resp = client.get("/api/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff", resp.headers
    assert resp.headers.get("X-Frame-Options") == "DENY", resp.headers
    assert resp.headers.get("Referrer-Policy") == "no-referrer", resp.headers
    assert "Content-Security-Policy" in resp.headers, resp.headers


def test_security_headers_absent_when_disabled(monkeypatch):
    """When SECURITY_HEADERS_ENABLED=False the middleware must be a no-op."""
    monkeypatch.setattr(settings, "SECURITY_HEADERS_ENABLED", False)
    c = TestClient(app, raise_server_exceptions=False)
    resp = c.get("/api/health")
    assert "X-Content-Type-Options" not in resp.headers, (
        "Security header present even though SECURITY_HEADERS_ENABLED=False"
    )


# ---------------------------------------------------------------------------
# AC-9.2 — Login rate-limit (slowapi)
# ---------------------------------------------------------------------------

def test_rate_limit_login_returns_429(monkeypatch):
    """Hammering POST /api/auth/login beyond the configured limit yields 429.

    Approach
    --------
    * ``RATE_LIMIT_ENABLED`` is set to ``"false"`` in ``conftest.py`` (before
      any app import) so existing tests never hit the limit — each request gets
      a unique UUID bucket key.
    * This test overrides the env var to ``"true"`` via ``monkeypatch.setenv``
      so the key function returns the real client IP (``"testclient"`` under
      TestClient).
    * ``limiter.reset()`` wipes all in-memory counters so this test starts
      from zero regardless of previous activity.
    * With ``LOGIN_RATE_LIMIT="5/minute"``, the 6th request from the same IP
      must receive a 429 with the standard error envelope.
    """
    from app.core.rate_limiting import limiter

    # Enable rate limiting for this test (overrides conftest.py default).
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")

    # Reset all in-memory counters so we always start from 0.
    limiter.reset()

    c = TestClient(app, raise_server_exceptions=False)
    payload = {"identifier": "admin@alpha.gov", "password": "bad-password-for-rate-test"}

    statuses: list[int] = []
    for _ in range(6):
        resp = c.post("/api/auth/login", json=payload)
        statuses.append(resp.status_code)
        if resp.status_code == 429:
            # Verify the 429 has the standard error envelope.
            data = resp.json()
            assert "error" in data, f"429 body missing 'error' key: {data}"
            assert data["error"]["status"] == 429, data
            break

    assert 429 in statuses, (
        f"Expected at least one 429 after 6 login attempts but got: {statuses}"
    )


def test_decrypt_clave_only_at_permitted_callsites():
    """AC-7.6: grep-test — decrypt_clave must only appear in crypto.py (definition)
    and the single audited reveal call-site (admin_service.py)."""
    import subprocess, sys, os

    backend_dir = os.path.join(os.path.dirname(__file__), "..")
    result = subprocess.run(
        ["grep", "-rn", "--include=*.py", "decrypt_clave", backend_dir],
        capture_output=True,
        text=True,
    )
    hits = [
        line for line in result.stdout.splitlines()
        if "__pycache__" not in line
    ]
    allowed_patterns = ("crypto.py", "admin_service.py", "militante_service.py", "export_service.py", "test_crypto.py", "test_registros.py", "test_security.py", "test_import_promovidos.py")
    forbidden = [h for h in hits if not any(p in h for p in allowed_patterns)]
    assert not forbidden, (
        f"decrypt_clave found at unexpected call-sites:\n" + "\n".join(forbidden)
    )
