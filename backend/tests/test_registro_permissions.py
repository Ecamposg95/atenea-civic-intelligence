"""API-level permission + lifecycle tests for /registros."""
from tests.conftest import ALPHA_CAMPAIGN_ID, BETA_CAMPAIGN_ID, auth_headers


def _hdr(client, email, campaign_id):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = campaign_id
    return h


def test_capture_cycle_and_consent(client):
    h = _hdr(client, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
    # consent false -> 422
    bad = client.post("/api/registros", json={"nombre_completo": "No Consent", "consentimiento": False}, headers=h)
    assert bad.status_code == 422, bad.text
    # create
    ok = client.post("/api/registros", json={
        "nombre_completo": "María López", "seccion": "0001",
        "clave_elector": "ABCD1234567890XYZ8", "consentimiento": True}, headers=h)
    assert ok.status_code == 201, ok.text
    body = ok.json()
    assert body["clave_masked"] == "****-XYZ8"
    assert "clave_elector_enc" not in body and "clave_elector" not in body
    rid = body["id"]
    # list
    lst = client.get("/api/registros/mios", headers=h)
    assert lst.status_code == 200 and lst.json()["total"] >= 1
    # delete
    dele = client.delete(f"/api/registros/{rid}", headers=h)
    assert dele.status_code == 204


def test_activista_cannot_see_other_activista(client):
    h1 = _hdr(client, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
    h2 = _hdr(client, "activista2@alpha.gov", ALPHA_CAMPAIGN_ID)
    created = client.post("/api/registros", json={"nombre_completo": "Solo A1", "consentimiento": True}, headers=h1)
    rid = created.json()["id"]
    # activista2 cannot fetch activista1's registro
    assert client.get(f"/api/registros/{rid}", headers=h2).status_code == 404
    client.delete(f"/api/registros/{rid}", headers=h1)


def test_superadmin_can_capture_in_any_base(client):
    h = _hdr(client, "super@atlas.gov", BETA_CAMPAIGN_ID)
    ok = client.post("/api/registros", json={"nombre_completo": "Super en Beta", "consentimiento": True}, headers=h)
    assert ok.status_code == 201, ok.text
    assert ok.json()["organization_id"]  # adopted from the selected base
    client.delete(f"/api/registros/{ok.json()['id']}", headers=h)


def test_perfil_returns_lider_name(client):
    h = auth_headers(client, "activista1@alpha.gov")
    resp = client.get("/api/perfil", headers=h)
    assert resp.status_code == 200, resp.text
    assert resp.json()["lider_nombre"] == "Alpha Líder"


def test_viewer_cannot_read_or_write_registros(client):
    """A campaign-member with VIEWER role must get 403 on all /registros endpoints.

    viewer@alpha.gov is seeded with UserRole.VIEWER and has an Alpha campaign
    membership (added in conftest so the 403 comes from RBAC, not membership check).
    """
    h = _hdr(client, "viewer@alpha.gov", ALPHA_CAMPAIGN_ID)

    # GET /registros/mios → 403
    assert client.get("/api/registros/mios", headers=h).status_code == 403

    # POST /registros → 403 (must be blocked before any PII is processed)
    assert client.post(
        "/api/registros",
        json={"nombre_completo": "Blocked Viewer", "consentimiento": True},
        headers=h,
    ).status_code == 403
