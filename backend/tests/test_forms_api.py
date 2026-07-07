"""API tests for /api/forms (builder CRUD, RBAC, schema validation)."""
from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers


def _hdr(client, email, cid=ALPHA_CAMPAIGN_ID):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = cid
    return h


def _payload(slug="peticion", canal="AMBOS"):
    return {
        "nombre": "Petición", "tipo": "PETICION", "slug": slug, "canal": canal,
        "schema": {"secciones": [{"titulo": "D", "campos": [
            {"key": "nombre", "tipo": "text", "label": "Nombre", "requerido": True}]}]},
    }


def test_create_and_list_form(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/forms", headers=h, json=_payload(slug="peticion-list"))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["slug"] == "peticion-list"
    assert body["version"] == 1
    lst = client.get("/api/forms", headers=h)
    assert lst.status_code == 200
    assert lst.json()["total"] >= 1


def test_reject_bad_schema(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/forms", headers=h, json={
        "nombre": "X", "tipo": "PETICION", "slug": "x-bad-schema", "canal": "INTERNO",
        "schema": {"secciones": [{"titulo": "d", "campos": [
            {"key": "a", "tipo": "BADTYPE", "label": "A"}]}]}})
    assert r.status_code == 422, r.text


def test_activista_cannot_create_or_list(client):
    h = _hdr(client, "activista1@alpha.gov")
    r = client.post("/api/forms", headers=h, json=_payload(slug="peticion-forbidden"))
    assert r.status_code == 403
    lst = client.get("/api/forms", headers=h)
    assert lst.status_code == 403


def test_get_by_slug_is_capture_tier(client):
    hc = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/forms", headers=hc, json=_payload(slug="peticion-slug"))
    assert r.status_code == 201, r.text

    ha = _hdr(client, "activista1@alpha.gov")
    got = client.get("/api/forms/slug/peticion-slug", headers=ha)
    assert got.status_code == 200, got.text
    assert got.json()["slug"] == "peticion-slug"


def test_get_by_slug_404_when_missing(client):
    ha = _hdr(client, "activista1@alpha.gov")
    r = client.get("/api/forms/slug/does-not-exist", headers=ha)
    assert r.status_code == 404


def test_get_one_and_update(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/forms", headers=h, json=_payload(slug="peticion-update"))
    fid = r.json()["id"]

    got = client.get(f"/api/forms/{fid}", headers=h)
    assert got.status_code == 200, got.text
    assert got.json()["version"] == 1

    upd = client.patch(f"/api/forms/{fid}", headers=h, json={"nombre": "Petición v2"})
    assert upd.status_code == 200, upd.text
    body = upd.json()
    assert body["nombre"] == "Petición v2"
    assert body["version"] == 2


def test_update_rejects_bad_schema(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/forms", headers=h, json=_payload(slug="peticion-update-badschema"))
    fid = r.json()["id"]

    upd = client.patch(f"/api/forms/{fid}", headers=h, json={
        "schema": {"secciones": [{"titulo": "d", "campos": [
            {"key": "a", "tipo": "BADTYPE", "label": "A"}]}]}})
    assert upd.status_code == 422, upd.text


def test_update_requires_builder_role(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/forms", headers=h, json=_payload(slug="peticion-update-rbac"))
    fid = r.json()["id"]

    ha = _hdr(client, "activista1@alpha.gov")
    forbidden = client.patch(f"/api/forms/{fid}", headers=ha, json={"nombre": "nope"})
    assert forbidden.status_code == 403


def test_duplicate_slug_conflicts(client):
    h = _hdr(client, "coord@alpha.gov")
    r1 = client.post("/api/forms", headers=h, json=_payload(slug="peticion-dup"))
    assert r1.status_code == 201, r1.text
    r2 = client.post("/api/forms", headers=h, json=_payload(slug="peticion-dup"))
    assert r2.status_code == 409, r2.text


def test_get_one_404(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.get("/api/forms/does-not-exist", headers=h)
    assert r.status_code == 404
