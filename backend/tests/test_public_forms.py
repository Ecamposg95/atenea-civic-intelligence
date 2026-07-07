"""API tests for /api/public/forms — the flagged, unauthenticated intake
channel (app/routers/public_forms.py).

With PUBLIC_FORMS_ENABLED False (the default), every route 404s regardless of
whether a matching form exists. With it monkeypatched True, GET returns the
form's schema (no PII) and POST creates a FormResponse(channel=PUBLICO,
moderacion=SIN_VERIFICAR) + a Caso, mirroring test_casos_api.py's
test_response_opens_caso for the authenticated flow.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.core.config import settings as app_settings
from app.models.atencion import Caso, CasoEvento, FormDefinition, FormResponse
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers


def _hdr(client, email, cid=ALPHA_CAMPAIGN_ID):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = cid
    return h


def _purge():
    db = TestingSessionLocal()
    try:
        db.query(CasoEvento).delete()
        db.query(Caso).delete()
        db.query(FormResponse).delete()
        db.query(FormDefinition).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clean_atencion():
    _purge()
    yield
    _purge()


def _enabled():
    return patch.object(app_settings, "PUBLIC_FORMS_ENABLED", True)


def _form_payload(slug, canal="PUBLICO"):
    return {
        "nombre": "Reporte público", "tipo": "QUEJA", "slug": slug, "canal": canal,
        "schema": {"secciones": [{"titulo": "D", "campos": [
            {"key": "nombre", "tipo": "text", "label": "N", "requerido": True},
            {"key": "descripcion", "tipo": "textarea", "label": "Desc"},
            {"key": "seccion", "tipo": "seccion", "label": "Secc"}]}]},
    }


def test_get_public_form_404_when_flag_disabled(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/forms", headers=h, json=_form_payload("pub-flag-off"))
    assert r.status_code == 201, r.text

    got = client.get("/api/public/forms/pub-flag-off")
    assert got.status_code == 404


def test_post_public_response_404_when_flag_disabled(client):
    h = _hdr(client, "coord@alpha.gov")
    client.post("/api/forms", headers=h, json=_form_payload("pub-flag-off-post"))

    r = client.post("/api/public/forms/pub-flag-off-post/responses",
                     json={"answers": {"nombre": "Ana", "descripcion": "bache", "seccion": "4127"}})
    assert r.status_code == 404


def test_get_public_form_schema_no_pii(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/forms", headers=h, json=_form_payload("pub-get"))
    assert r.status_code == 201, r.text

    with _enabled():
        got = client.get("/api/public/forms/pub-get")
    assert got.status_code == 200, got.text
    body = got.json()
    assert body["slug"] == "pub-get"
    assert "schema" in body
    assert "answers" not in body
    assert "organization_id" not in body
    assert "campaign_id" not in body


def test_get_public_form_404_for_internal_only_canal(client):
    """A form whose canal is INTERNO (not PUBLICO/AMBOS) must not resolve on
    the public router even with the flag enabled — it wasn't meant to be
    reachable anonymously."""
    h = _hdr(client, "coord@alpha.gov")
    client.post("/api/forms", headers=h, json=_form_payload("pub-internal-only", canal="INTERNO"))

    with _enabled():
        r = client.get("/api/public/forms/pub-internal-only")
    assert r.status_code == 404


def test_get_public_form_404_when_missing(client):
    with _enabled():
        r = client.get("/api/public/forms/does-not-exist")
    assert r.status_code == 404


def test_get_public_form_404_when_inactive(client):
    """An is_active=False public form must not resolve on the public channel."""
    h = _hdr(client, "coord@alpha.gov")
    f = client.post("/api/forms", headers=h, json=_form_payload("pub-inactive")).json()

    db = TestingSessionLocal()
    try:
        form = db.get(FormDefinition, f["id"])
        form.is_active = False
        db.commit()
    finally:
        db.close()

    with _enabled():
        r = client.get("/api/public/forms/pub-inactive")
    assert r.status_code == 404


def test_get_public_form_404_when_soft_deleted(client):
    """A soft-deleted (deleted_at set) public form must not resolve."""
    from datetime import datetime, timezone

    h = _hdr(client, "coord@alpha.gov")
    f = client.post("/api/forms", headers=h, json=_form_payload("pub-deleted")).json()

    db = TestingSessionLocal()
    try:
        form = db.get(FormDefinition, f["id"])
        form.deleted_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()

    with _enabled():
        r = client.get("/api/public/forms/pub-deleted")
    assert r.status_code == 404


def test_post_public_response_creates_response_and_caso(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/forms", headers=h, json=_form_payload("pub-post"))
    assert r.status_code == 201, r.text

    with _enabled():
        resp = client.post("/api/public/forms/pub-post/responses", json={
            "answers": {"nombre": "Ana Ciudadana", "descripcion": "bache enorme", "seccion": "4127"},
            "contacto": "5551234567",
        })
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["moderacion"] == "SIN_VERIFICAR"
    assert body["caso_id"]
    # no PII echoed back
    assert "answers" not in body
    assert "contacto" not in body

    db = TestingSessionLocal()
    try:
        fr = db.get(FormResponse, body["id"])
        assert fr is not None
        assert fr.channel == "PUBLICO"
        assert fr.moderacion == "SIN_VERIFICAR"
        assert fr.captured_by is None
        assert fr.contacto_masked == "****-4567"

        caso = db.get(Caso, fr.caso_id)
        assert caso is not None
        assert caso.channel == "PUBLICO"
        assert caso.moderacion == "SIN_VERIFICAR"
        assert caso.ciudadano_nombre == "Ana Ciudadana"
        assert caso.seccion == "4127"
    finally:
        db.close()


def test_post_public_response_404_when_form_missing(client):
    with _enabled():
        r = client.post("/api/public/forms/does-not-exist/responses",
                         json={"answers": {}})
    assert r.status_code == 404


def test_post_public_response_rejects_missing_required_answer(client):
    h = _hdr(client, "coord@alpha.gov")
    client.post("/api/forms", headers=h, json=_form_payload("pub-invalid"))

    with _enabled():
        r = client.post("/api/public/forms/pub-invalid/responses",
                         json={"answers": {"descripcion": "sin nombre"}})
    assert r.status_code == 422, r.text
