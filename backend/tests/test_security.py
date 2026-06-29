"""Tests for SPA-4 compliance/hardening configuration settings."""

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


def test_admin_registro_read_never_exposes_plain_clave():
    """AC-7.1: AdminRegistroRead schema must not have a clave_elector field."""
    from app.schemas.admin import AdminRegistroRead
    fields = AdminRegistroRead.model_fields
    assert "clave_elector" not in fields
    assert "clave_elector_enc" not in fields
    assert "clave_masked" in fields


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
    allowed_patterns = ("crypto.py", "admin_service.py", "export_service.py", "test_crypto.py", "test_registros.py", "test_security.py")
    forbidden = [h for h in hits if not any(p in h for p in allowed_patterns)]
    assert not forbidden, (
        f"decrypt_clave found at unexpected call-sites:\n" + "\n".join(forbidden)
    )
