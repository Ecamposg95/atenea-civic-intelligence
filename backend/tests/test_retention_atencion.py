"""Tests for retention_service.purge_expired purging Caso + FormResponse bucket
evidence.

Task 6: hard-deleting casos/form_responses (soft-delete-age pass) must also
delete their bucket evidence objects — CasoEvento.evidencia_key for casos,
FormResponse.evidencia_keys for form responses. Mirrors the Militante purge
discipline in test_retention_militantes.py, applied to atención ciudadana.

TDD: written before the retention_service.py extension.
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app.core.config import settings as app_settings
from app.models.atencion import Caso, CasoEvento, FormDefinition, FormResponse
from app.models.electoral_area import AreaLevel, ElectoralArea
from app.services import caso_service, retention_service
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal

_NOW = datetime(2026, 6, 28, 12, 0, 0, tzinfo=timezone.utc)
_LONG_AGO = datetime(2000, 1, 1, tzinfo=timezone.utc)


def _retention_patches():
    return (
        patch.object(app_settings, "RETENTION_ENABLED", True),
        patch.object(app_settings, "RETENTION_PURGE_SOFT_DELETED_DAYS", 30),
        patch.object(app_settings, "RETENTION_DAYS_AFTER_ELECTION", 180),
    )


def _purge_atencion():
    db = TestingSessionLocal()
    try:
        db.query(CasoEvento).delete()
        db.query(Caso).delete()
        db.query(FormResponse).delete()
        db.query(FormDefinition).delete()
        # conftest's coordinador_ctx fixture lazily creates a loose SECCION
        # ElectoralArea(code="4127") (no municipio_id) the first time it's
        # needed. Left in place, it would make test_seccion_electoral.py's
        # idempotent seed skip (re)linking "4127" under its municipio, so
        # this module removes that specific artifact after each test —
        # any *properly* seeded 4127 (municipio_id set) is left untouched.
        db.query(ElectoralArea).filter(
            ElectoralArea.code == "4127",
            ElectoralArea.level == AreaLevel.SECCION,
            ElectoralArea.municipio_id.is_(None),
        ).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clean_atencion():
    # The shared db_session fixture (conftest) purges Militante rows but not
    # atención ciudadana rows, so this module cleans up itself — same idiom
    # as test_casos.py's _clean_casos.
    _purge_atencion()
    yield
    _purge_atencion()


def _base_caso_data(**over):
    data = {"tipo": "PETICION", "titulo": "Bache", "descripcion": "esquina",
            "seccion": "4127", "colonia": "Centro"}
    data.update(over)
    return data


# ── Caso ────────────────────────────────────────────────────────────────────
def test_purge_deletes_caso_evidence(coordinador_ctx, db_session, monkeypatch):
    """Hard-purging a soft-deleted caso deletes its CasoEvento evidencia_key
    bucket objects first."""
    import app.core.storage as storage

    deleted: list[str] = []
    monkeypatch.setattr(storage, "storage_enabled", lambda: True)
    monkeypatch.setattr(storage, "put_object", lambda *a, **k: None)
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted.append(key))

    caso = caso_service.crear_directo(db_session, coordinador_ctx, _base_caso_data())
    caso_service.add_evento(db_session, coordinador_ctx, caso.id, "EVIDENCIA",
                             evidencia=b"\xff\xd8jpegbytes", content_type="image/jpeg")

    caso.deleted_at = _LONG_AGO
    db_session.commit()

    p1, p2, p3 = _retention_patches()
    with p1, p2, p3:
        result = retention_service.purge_expired(db_session, now=_NOW)

    assert result.casos_soft_deleted_purged == 1
    assert any(k.endswith("ev-1.jpg") for k in deleted), deleted

    db_session.expire_all()
    assert db_session.get(Caso, caso.id) is None


def test_purge_skips_storage_calls_when_storage_disabled_casos(coordinador_ctx, db_session, monkeypatch):
    """When storage_enabled() is False, the caso is still hard-purged but no
    storage.delete_object calls are made."""
    import app.core.storage as storage

    calls: list[str] = []
    monkeypatch.setattr(storage, "storage_enabled", lambda: False)
    monkeypatch.setattr(storage, "put_object", lambda *a, **k: None)
    monkeypatch.setattr(storage, "delete_object", lambda key: calls.append(key))

    caso = caso_service.crear_directo(db_session, coordinador_ctx, _base_caso_data())
    caso_service.add_evento(db_session, coordinador_ctx, caso.id, "EVIDENCIA",
                             evidencia=b"\xff\xd8jpegbytes", content_type="image/jpeg")

    caso.deleted_at = _LONG_AGO
    db_session.commit()

    p1, p2, p3 = _retention_patches()
    with p1, p2, p3:
        result = retention_service.purge_expired(db_session, now=_NOW)

    assert result.casos_soft_deleted_purged == 1
    assert calls == []
    db_session.expire_all()
    assert db_session.get(Caso, caso.id) is None


def test_purge_continues_when_delete_object_raises_caso(coordinador_ctx, db_session, monkeypatch):
    """A failing storage.delete_object must not abort the purge of the caso row."""
    import app.core.storage as storage

    def _boom(key):
        raise RuntimeError("simulated network blip")

    monkeypatch.setattr(storage, "storage_enabled", lambda: True)
    monkeypatch.setattr(storage, "put_object", lambda *a, **k: None)
    monkeypatch.setattr(storage, "delete_object", _boom)

    caso = caso_service.crear_directo(db_session, coordinador_ctx, _base_caso_data())
    caso_service.add_evento(db_session, coordinador_ctx, caso.id, "EVIDENCIA",
                             evidencia=b"\xff\xd8jpegbytes", content_type="image/jpeg")

    caso.deleted_at = _LONG_AGO
    db_session.commit()

    p1, p2, p3 = _retention_patches()
    with p1, p2, p3:
        result = retention_service.purge_expired(db_session, now=_NOW)

    assert result.casos_soft_deleted_purged == 1
    db_session.expire_all()
    assert db_session.get(Caso, caso.id) is None


def test_purge_does_not_touch_active_caso(coordinador_ctx, db_session, monkeypatch):
    """A caso without deleted_at set must survive the soft-delete pass."""
    import app.core.storage as storage

    deleted: list[str] = []
    monkeypatch.setattr(storage, "storage_enabled", lambda: True)
    monkeypatch.setattr(storage, "put_object", lambda *a, **k: None)
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted.append(key))

    caso = caso_service.crear_directo(db_session, coordinador_ctx, _base_caso_data())
    caso_service.add_evento(db_session, coordinador_ctx, caso.id, "EVIDENCIA",
                             evidencia=b"\xff\xd8jpegbytes", content_type="image/jpeg")

    p1, p2, p3 = _retention_patches()
    with p1, p2, p3:
        result = retention_service.purge_expired(db_session, now=_NOW)

    assert result.casos_soft_deleted_purged == 0
    assert deleted == []
    db_session.expire_all()
    assert db_session.get(Caso, caso.id) is not None


# ── FormResponse ──────────────────────────────────────────────────────────────
def test_purge_deletes_form_response_evidence(coordinador_ctx, db_session, monkeypatch):
    """Hard-purging a soft-deleted form_response deletes its evidencia_keys
    bucket objects first."""
    import app.core.storage as storage

    deleted: list[str] = []
    monkeypatch.setattr(storage, "storage_enabled", lambda: True)
    monkeypatch.setattr(storage, "put_object", lambda *a, **k: None)
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted.append(key))

    form = FormDefinition(
        organization_id=coordinador_ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
        nombre="Reporte", tipo="QUEJA", slug="reporte-retention", canal="PUBLICO",
        schema={"secciones": []})
    db_session.add(form)
    db_session.flush()
    resp = FormResponse(
        organization_id=coordinador_ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
        form_definition_id=form.id, answers={}, channel="PUBLICO",
        moderacion="SIN_VERIFICAR", evidencia_keys=["evid/a.jpg", "evid/b.jpg"],
        deleted_at=_LONG_AGO)
    db_session.add(resp)
    db_session.commit()

    p1, p2, p3 = _retention_patches()
    with p1, p2, p3:
        result = retention_service.purge_expired(db_session, now=_NOW)

    assert result.form_responses_soft_deleted_purged == 1
    assert set(deleted) == {"evid/a.jpg", "evid/b.jpg"}

    db_session.expire_all()
    assert db_session.get(FormResponse, resp.id) is None


def test_purge_does_not_touch_active_form_response(coordinador_ctx, db_session, monkeypatch):
    """A form_response without deleted_at set must survive the soft-delete pass."""
    import app.core.storage as storage

    deleted: list[str] = []
    monkeypatch.setattr(storage, "storage_enabled", lambda: True)
    monkeypatch.setattr(storage, "put_object", lambda *a, **k: None)
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted.append(key))

    form = FormDefinition(
        organization_id=coordinador_ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
        nombre="Reporte", tipo="QUEJA", slug="reporte-retention-active", canal="PUBLICO",
        schema={"secciones": []})
    db_session.add(form)
    db_session.flush()
    resp = FormResponse(
        organization_id=coordinador_ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
        form_definition_id=form.id, answers={}, channel="PUBLICO",
        moderacion="SIN_VERIFICAR", evidencia_keys=["evid/c.jpg"])
    db_session.add(resp)
    db_session.commit()

    p1, p2, p3 = _retention_patches()
    with p1, p2, p3:
        result = retention_service.purge_expired(db_session, now=_NOW)

    assert result.form_responses_soft_deleted_purged == 0
    assert deleted == []
    db_session.expire_all()
    assert db_session.get(FormResponse, resp.id) is not None
