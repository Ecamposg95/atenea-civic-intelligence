"""API tests for /api/minutas + /api/acuerdos.

Reuses the auth pattern from test_casos_api.py: authenticate via
tests.conftest.auth_headers against the seeded Alpha campaign users and add
X-Campaign-Id, rather than introducing new fixtures.
"""
from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers


def _hdr(client, email, cid=ALPHA_CAMPAIGN_ID):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = cid
    return h


def test_activista_cannot_create_minuta(client):
    h = _hdr(client, "activista1@alpha.gov")
    r = client.post("/api/minutas", json={"titulo": "x", "fecha": "2026-07-08"},
                    headers=h)
    assert r.status_code == 403


def test_coordinador_creates_and_lists_minuta(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/minutas",
                    json={"titulo": "Arranque", "fecha": "2026-07-08",
                          "acuerdos": [{"texto": "tarea"}]},
                    headers=h)
    assert r.status_code == 201, r.text
    mid = r.json()["id"]
    r2 = client.get("/api/minutas", headers=h)
    assert r2.status_code == 200
    body = r2.json()
    item = next(i for i in body["items"] if i["id"] == mid)
    assert item["acuerdos_pendientes"] == 1


def test_acuerdos_transversal_endpoint(client):
    h = _hdr(client, "coord@alpha.gov")
    before = client.get("/api/acuerdos?vence_antes=2026-07-31", headers=h).json()["total"]
    client.post("/api/minutas",
                json={"titulo": "m", "fecha": "2026-07-08",
                      "acuerdos": [{"texto": "t", "fecha_limite": "2026-07-10"}]},
                headers=h)
    r = client.get("/api/acuerdos?vence_antes=2026-07-31", headers=h)
    assert r.status_code == 200
    assert r.json()["total"] == before + 1


def test_lider_cannot_delete_minuta(client):
    hcoord = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/minutas",
                    json={"titulo": "no-delete-for-lider", "fecha": "2026-07-08"},
                    headers=hcoord)
    assert r.status_code == 201, r.text
    mid = r.json()["id"]

    hlider = _hdr(client, "lider@alpha.gov")
    r2 = client.delete(f"/api/minutas/{mid}", headers=hlider)
    assert r2.status_code == 403


def test_published_minuta_locks_edits_for_lider(client):
    h = _hdr(client, "lider@alpha.gov")
    r = client.post("/api/minutas",
                    json={"titulo": "acta a publicar", "fecha": "2026-07-08"},
                    headers=h)
    assert r.status_code == 201, r.text
    mid = r.json()["id"]

    r2 = client.patch(f"/api/minutas/{mid}", json={"estado": "PUBLICADA"}, headers=h)
    assert r2.status_code == 200, r2.text
    assert r2.json()["estado"] == "PUBLICADA"

    r3 = client.patch(f"/api/minutas/{mid}", json={"cuerpo": "x"}, headers=h)
    assert r3.status_code == 409
