"""Tests for /reports/secciones endpoint — scope, RBAC, no-PII (AC-8.3).

Coverage:
1. Report groups registros by seccion with correct counts.
2. Cross-tenant isolation: data from other campaigns/tenants absent.
3. RBAC: 403 for activista; admin and lider pass.
4. No PII in response (no nombre, apellidos, email, telefono, curp, clave_elector).
5. Superadmin consolidated view (cross-tenant).
"""
import pytest

from app.models.registro import Registro
from tests.conftest import (
    ALPHA_CAMPAIGN_ID,
    BETA_CAMPAIGN_ID,
    TestingSessionLocal,
    auth_headers,
)

# ---------------------------------------------------------------------------
# Helpers (mirror test_admin_registros.py helpers to avoid cross-module import)
# ---------------------------------------------------------------------------

def _camp_ctx(db, email, campaign_id):
    from sqlalchemy import select
    from app.dependencies import CampaignContext
    from app.models.user import User
    from app.models.campaign import Campaign
    user = db.execute(select(User).where(User.email == email)).scalar_one()
    camp = db.execute(select(Campaign).where(Campaign.id == campaign_id)).scalar_one()
    org = camp.organization_id if user.role.value == "superadmin" else user.organization_id
    return CampaignContext(user=user, organization_id=org, role=user.role, campaign_id=campaign_id)


def _consolidated_ctx(db):
    from sqlalchemy import select
    from app.dependencies import CampaignContext
    from app.models.user import User
    su = db.execute(select(User).where(User.email == "super@atlas.gov")).scalar_one()
    return CampaignContext(user=su, organization_id=None, role=su.role, campaign_id="")


def _make(db, ctx, nombre, **kw):
    from app.services import registro_service
    from app.schemas.registro import RegistroCreate
    return registro_service.create_registro(db, ctx, RegistroCreate(nombre_completo=nombre, consentimiento=True, **kw))


# ---------------------------------------------------------------------------
# Service-level tests
# ---------------------------------------------------------------------------

def test_por_seccion_groups_correctly():
    """por_seccion returns correct counts per seccion."""
    from app.services import report_service
    db = TestingSessionLocal()
    try:
        a1 = _camp_ctx(db, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
        admin = _camp_ctx(db, "admin@alpha.gov", ALPHA_CAMPAIGN_ID)
        _make(db, a1, "P1", seccion="0001")
        _make(db, a1, "P2", seccion="0001")
        _make(db, a1, "P3", seccion="0002")
        result = report_service.por_seccion(db, admin)
        assert result["total"] == 3
        items = {i["seccion"]: i["count"] for i in result["items"]}
        assert items["0001"] == 2
        assert items["0002"] == 1
    finally:
        db.query(Registro).delete(); db.commit(); db.close()


def test_por_seccion_cross_tenant_isolation():
    """Admin from alpha only sees their own campaign's registros."""
    from app.services import report_service
    db = TestingSessionLocal()
    try:
        a_alpha = _camp_ctx(db, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
        a_beta = _camp_ctx(db, "activista_beta@beta.gov", BETA_CAMPAIGN_ID)
        admin = _camp_ctx(db, "admin@alpha.gov", ALPHA_CAMPAIGN_ID)
        _make(db, a_alpha, "Alpha P", seccion="0001")
        _make(db, a_beta, "Beta P", seccion="9001")
        result = report_service.por_seccion(db, admin)
        assert result["total"] == 1
        secciones = [i["seccion"] for i in result["items"]]
        assert "9001" not in secciones
        assert "0001" in secciones
    finally:
        db.query(Registro).delete(); db.commit(); db.close()


def test_por_seccion_lider_scope():
    """Lider only sees registros from their activistas."""
    from app.services import report_service
    db = TestingSessionLocal()
    try:
        a1 = _camp_ctx(db, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
        a2 = _camp_ctx(db, "activista2@alpha.gov", ALPHA_CAMPAIGN_ID)
        lider = _camp_ctx(db, "lider@alpha.gov", ALPHA_CAMPAIGN_ID)
        _make(db, a1, "P1", seccion="0001")
        _make(db, a2, "P2", seccion="0002")
        result = report_service.por_seccion(db, lider)
        # Both activistas belong to the same lider, so both visible
        assert result["total"] == 2
    finally:
        db.query(Registro).delete(); db.commit(); db.close()


def test_por_seccion_superadmin_consolidated():
    """Superadmin (no campaign context) sees all registros across tenants."""
    from app.services import report_service
    db = TestingSessionLocal()
    try:
        a_alpha = _camp_ctx(db, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
        a_beta = _camp_ctx(db, "activista_beta@beta.gov", BETA_CAMPAIGN_ID)
        _make(db, a_alpha, "Alpha P", seccion="0001")
        _make(db, a_beta, "Beta P", seccion="9001")
        result = report_service.por_seccion(db, _consolidated_ctx(db))
        assert result["total"] == 2
        secciones = [i["seccion"] for i in result["items"]]
        assert "0001" in secciones
        assert "9001" in secciones
    finally:
        db.query(Registro).delete(); db.commit(); db.close()


def test_por_seccion_no_pii_in_result():
    """Response dict contains ONLY seccion + count — never PII fields."""
    from app.services import report_service
    PII_FIELDS = {
        "nombre_completo", "nombre", "apellido", "apellido_paterno",
        "apellido_materno", "email", "telefono", "curp",
        "clave_elector", "clave_elector_enc", "clave_masked",
        "direccion", "colonia", "lat", "lng",
    }
    db = TestingSessionLocal()
    try:
        a1 = _camp_ctx(db, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
        admin = _camp_ctx(db, "admin@alpha.gov", ALPHA_CAMPAIGN_ID)
        _make(db, a1, "Secret Name", seccion="0001", telefono="5551234567")
        result = report_service.por_seccion(db, admin)
        # Top-level keys
        top_keys = set(result.keys())
        assert not (top_keys & PII_FIELDS), f"PII at top level: {top_keys & PII_FIELDS}"
        # Per-item keys
        for item in result["items"]:
            item_keys = set(item.keys())
            assert not (item_keys & PII_FIELDS), f"PII in item: {item_keys & PII_FIELDS}"
    finally:
        db.query(Registro).delete(); db.commit(); db.close()


# ---------------------------------------------------------------------------
# API-level tests
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup_registros():
    """Delete all registros after each test."""
    yield
    db = TestingSessionLocal()
    try:
        db.query(Registro).delete()
        db.commit()
    finally:
        db.close()


def _hdr(client, email, campaign_id=None):
    h = auth_headers(client, email)
    if campaign_id:
        h["X-Campaign-Id"] = campaign_id
    return h


def _capture(client, email, campaign_id=ALPHA_CAMPAIGN_ID, **body):
    h = _hdr(client, email, campaign_id)
    r = client.post("/api/registros", json={"consentimiento": True, **body}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_api_secciones_admin_200(client):
    """Admin gets 200 and grouped results."""
    _capture(client, "activista1@alpha.gov", nombre_completo="P1", seccion="0001")
    _capture(client, "activista1@alpha.gov", nombre_completo="P2", seccion="0001")
    _capture(client, "activista2@alpha.gov", nombre_completo="P3", seccion="0002")
    resp = client.get("/api/reports/secciones", headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 3
    items = {i["seccion"]: i["count"] for i in body["items"]}
    assert items.get("0001") == 2
    assert items.get("0002") == 1


def test_api_secciones_lider_200(client):
    """Lider gets 200 and sees their estructura's registros."""
    _capture(client, "activista1@alpha.gov", nombre_completo="P1", seccion="0001")
    resp = client.get("/api/reports/secciones", headers=_hdr(client, "lider@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1


def test_api_secciones_activista_403(client):
    """Activista cannot access the reports endpoint — must get 403."""
    resp = client.get("/api/reports/secciones", headers=_hdr(client, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


def test_api_secciones_viewer_200(client):
    """VIEWER is now allowed on reports (RBAC v2 matrix) — must get 200."""
    resp = client.get("/api/reports/secciones", headers=_hdr(client, "viewer@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"


def test_api_secciones_capturista_403(client):
    """CAPTURISTA is excluded from reports — must get 403."""
    resp = client.get("/api/reports/secciones", headers=_hdr(client, "capturista@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


def test_api_secciones_no_pii_in_response(client):
    """Response body must never contain PII fields."""
    PII_FIELDS = {
        "nombre_completo", "nombre", "apellido", "email", "telefono",
        "curp", "clave_elector", "clave_elector_enc", "clave_masked",
        "direccion", "colonia",
    }
    _capture(client, "activista1@alpha.gov", nombre_completo="Secret Name",
             seccion="0001", telefono="5551234567")
    resp = client.get("/api/reports/secciones", headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    top_keys = set(body.keys())
    assert not (top_keys & PII_FIELDS), f"PII at top level: {top_keys & PII_FIELDS}"
    for item in body.get("items", []):
        item_keys = set(item.keys())
        assert not (item_keys & PII_FIELDS), f"PII in item: {item_keys & PII_FIELDS}"


def test_api_secciones_cross_tenant_isolation(client):
    """Admin from alpha must not see beta tenant registros."""
    _capture(client, "activista1@alpha.gov", nombre_completo="Alpha P", seccion="0001")
    _capture(client, "activista_beta@beta.gov", nombre_completo="Beta P",
             seccion="9001", campaign_id=BETA_CAMPAIGN_ID)
    resp = client.get("/api/reports/secciones", headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    secciones = [i["seccion"] for i in body["items"]]
    assert "9001" not in secciones


def test_api_secciones_superadmin_consolidated(client):
    """Superadmin without X-Campaign-Id sees all tenants."""
    _capture(client, "activista1@alpha.gov", nombre_completo="Alpha P", seccion="0001")
    _capture(client, "activista_beta@beta.gov", nombre_completo="Beta P",
             seccion="9001", campaign_id=BETA_CAMPAIGN_ID)
    resp = client.get("/api/reports/secciones", headers=auth_headers(client, "super@atlas.gov"))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 2
    secciones = [i["seccion"] for i in body["items"]]
    assert "0001" in secciones
    assert "9001" in secciones
