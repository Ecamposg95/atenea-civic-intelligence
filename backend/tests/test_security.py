"""Tests for SPA-4 compliance/hardening configuration settings."""

from app.core.config import settings


def test_retention_settings_have_safe_defaults():
    assert settings.RETENTION_ENABLED is False
    assert settings.RETENTION_DAYS_AFTER_ELECTION >= 0
    assert settings.RETENTION_PURGE_SOFT_DELETED_DAYS >= 0


def test_login_rate_limit_configured():
    assert isinstance(settings.LOGIN_RATE_LIMIT, str) and "/" in settings.LOGIN_RATE_LIMIT


def test_security_headers_enabled_by_default():
    assert settings.SECURITY_HEADERS_ENABLED is True
