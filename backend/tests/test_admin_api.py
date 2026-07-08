"""API tests for /admin/* router (T5).

Tests cover:
- RBAC: admin can list/metricas/estructura; activista gets 403
- Masking: no clave_elector in listing response
- reveal_clave: admin-only, returns plaintext, audited; lider→403; NoClave→422; missing→404
- Superadmin consolidated: no X-Campaign-Id still returns results
"""
import pytest

from app.models.registro import Registro
from tests.conftest import auth_headers, ALPHA_CAMPAIGN_ID, BETA_CAMPAIGN_ID, TestingSessionLocal


@pytest.fixture(autouse=True)
def cleanup_registros():
    """Delete all registros after each test to prevent contaminating count-based assertions
    in test_admin_estructura.py and test_admin_metricas.py (which share the same SQLite pool)."""
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


def _capture(client, email, **body):
    h = _hdr(client, email, ALPHA_CAMPAIGN_ID)
    r = client.post("/api/registros", json={"consentimiento": True, **body}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_admin_registros_lists_with_base(client):
    _capture(client, "activista1@alpha.gov", nombre_completo="Para Admin", seccion="0001")
    resp = client.get("/api/admin/registros", headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1
    assert "organization_name" in body["items"][0]
    assert "clave_elector" not in body["items"][0]


def test_activista_forbidden_on_admin(client):
    resp = client.get("/api/admin/registros", headers=_hdr(client, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert resp.status_code == 403


def test_metricas_and_estructura(client):
    _capture(client, "activista1@alpha.gov", nombre_completo="Me", seccion="0001")
    h = _hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID)
    assert client.get("/api/admin/metricas", headers=h).status_code == 200
    assert client.get("/api/admin/estructura", headers=h).status_code == 200


def test_reveal_admin_only_and_audited(client):
    rid = _capture(client, "activista1@alpha.gov", nombre_completo="Rev", clave_elector="ABCD1234567890XYZ8")
    # lider cannot reveal
    bad = client.post(f"/api/admin/registros/{rid}/revelar-clave",
                      headers=_hdr(client, "lider@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert bad.status_code == 403
    # admin can
    ok = client.post(f"/api/admin/registros/{rid}/revelar-clave",
                     headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert ok.status_code == 200, ok.text
    assert ok.json()["clave_elector"] == "ABCD1234567890XYZ8"
    # audit visible
    aud = client.get("/api/admin/auditoria?action=registro.reveal_clave",
                     headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert aud.status_code == 200 and aud.json()["total"] >= 1


def test_reveal_coordinador_can_reveal_audited(client):
    # The campaign COORDINADOR (executive) may reveal, campaign-wide + audited.
    rid = _capture(client, "activista1@alpha.gov", nombre_completo="RevCoord",
                   clave_elector="WXYZ1234567890ABC5")
    ok = client.post(f"/api/admin/registros/{rid}/revelar-clave",
                     headers=_hdr(client, "coord@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert ok.status_code == 200, ok.text
    assert ok.json()["clave_elector"] == "WXYZ1234567890ABC5"
    aud = client.get("/api/admin/auditoria?action=registro.reveal_clave",
                     headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert aud.status_code == 200 and aud.json()["total"] >= 1


def test_reveal_noclave_returns_422(client):
    rid = _capture(client, "activista1@alpha.gov", nombre_completo="NoClave Person")
    h = _hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID)
    resp = client.post(f"/api/admin/registros/{rid}/revelar-clave", headers=h)
    assert resp.status_code == 422


def test_reveal_out_of_scope_returns_404(client):
    """A registro_id that doesn't exist → 404."""
    h = _hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID)
    resp = client.post("/api/admin/registros/00000000-dead-beef-0000-000000000000/revelar-clave", headers=h)
    assert resp.status_code == 404


def test_superadmin_consolidated_no_base(client):
    _capture(client, "activista1@alpha.gov", nombre_completo="Alpha row")
    # superadmin WITHOUT X-Campaign-Id → consolidated
    resp = client.get("/api/admin/registros", headers=auth_headers(client, "super@atlas.gov"))
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] >= 1


# ---------------------------------------------------------------------------
# 403 RBAC full coverage — all five admin endpoints
# (registros + revelar-clave already covered above; adding metricas, estructura, auditoria)
# viewer@alpha.gov is a campaign member (seeded) but has role=VIEWER → 403 from RBAC
# lider@alpha.gov is a campaign member with role=LIDER → 403 on AdminOnly endpoints
# ---------------------------------------------------------------------------

def test_viewer_forbidden_on_metricas(client):
    """VIEWER (campaign member) is not ADMIN/LIDER → metricas must return 403."""
    resp = client.get("/api/admin/metricas", headers=_hdr(client, "viewer@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


def test_viewer_forbidden_on_estructura(client):
    """VIEWER (campaign member) is not ADMIN/LIDER → estructura must return 403."""
    resp = client.get("/api/admin/estructura", headers=_hdr(client, "viewer@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


def test_lider_forbidden_on_auditoria(client):
    """LIDER is not ADMIN → auditoria (AdminOnly) must return 403."""
    resp = client.get("/api/admin/auditoria", headers=_hdr(client, "lider@alpha.gov", ALPHA_CAMPAIGN_ID))
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
