"""API tests for /api/sprints + /api/workitems + /api/tablero + the acuerdo
convert bridge.

Reuses the auth pattern from test_minutas_api.py: authenticate via
tests.conftest.auth_headers against the seeded Alpha campaign users and add
X-Campaign-Id, rather than introducing new fixtures.
"""
from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers


def _hdr(client, email, cid=ALPHA_CAMPAIGN_ID):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = cid
    return h


def test_activista_cannot_create_workitem_but_can_move_own(client):
    coordinador_headers = _hdr(client, "coord@alpha.gov")
    activista_headers = _hdr(client, "activista1@alpha.gov")
    activista_user_id = client.get("/api/auth/me", headers=activista_headers).json()["id"]

    # governance create denied for activista
    r = client.post("/api/workitems", json={"titulo": "x"}, headers=activista_headers)
    assert r.status_code == 403

    # coordinator creates + assigns to the activista
    r2 = client.post("/api/workitems",
                     json={"titulo": "H", "story_points": 5, "responsable_id": activista_user_id},
                     headers=coordinador_headers)
    assert r2.status_code == 201, r2.text
    wid = r2.json()["id"]

    # activista moves their own card
    r3 = client.patch(f"/api/workitems/{wid}/estado", json={"estado": "EN_CURSO"},
                      headers=activista_headers)
    assert r3.status_code == 200 and r3.json()["estado"] == "EN_CURSO"


def test_activista_cannot_move_others_card(client):
    coordinador_headers = _hdr(client, "coord@alpha.gov")
    activista_headers = _hdr(client, "activista1@alpha.gov")

    r2 = client.post("/api/workitems", json={"titulo": "sin dueno"}, headers=coordinador_headers)
    assert r2.status_code == 201, r2.text
    wid = r2.json()["id"]

    r3 = client.patch(f"/api/workitems/{wid}/estado", json={"estado": "EN_CURSO"},
                      headers=activista_headers)
    assert r3.status_code == 403


def test_one_active_sprint_returns_409(client):
    coordinador_headers = _hdr(client, "coord@alpha.gov")

    def mk(nombre, ini, fin):
        return client.post("/api/sprints", json={"nombre": nombre, "fecha_inicio": ini, "fecha_fin": fin},
                           headers=coordinador_headers).json()["id"]

    a = mk("A", "2026-07-08", "2026-07-22")
    b = mk("B", "2026-07-23", "2026-08-06")
    assert client.post(f"/api/sprints/{a}/activar", headers=coordinador_headers).status_code == 200
    assert client.post(f"/api/sprints/{b}/activar", headers=coordinador_headers).status_code == 409


def test_tablero_reflects_active_sprint_columns(client):
    coordinador_headers = _hdr(client, "coord@alpha.gov")

    # close whatever sprint another test in this module left ACTIVO — the DB
    # fixture is session-scoped, so campaign state carries across tests.
    activos = client.get("/api/sprints?estado=ACTIVO", headers=coordinador_headers).json()["items"]
    for s in activos:
        client.post(f"/api/sprints/{s['id']}/cerrar", headers=coordinador_headers)

    sid = client.post("/api/sprints",
                      json={"nombre": "Tablero", "fecha_inicio": "2026-07-08", "fecha_fin": "2026-07-22"},
                      headers=coordinador_headers).json()["id"]
    assert client.post(f"/api/sprints/{sid}/activar", headers=coordinador_headers).status_code == 200

    wid = client.post("/api/workitems",
                      json={"titulo": "En el sprint", "sprint_id": sid},
                      headers=coordinador_headers).json()["id"]

    r = client.get("/api/tablero", headers=coordinador_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sprint"]["id"] == sid
    assert any(w["id"] == wid for w in body["POR_HACER"])


def test_convertir_acuerdo_to_workitem(client):
    coordinador_headers = _hdr(client, "coord@alpha.gov")

    minuta = client.post("/api/minutas",
                         json={"titulo": "para convertir", "fecha": "2026-07-08",
                               "acuerdos": [{"texto": "hacer algo"}]},
                         headers=coordinador_headers).json()
    mid = minuta["id"]
    acuerdo_id = client.get(f"/api/minutas/{mid}", headers=coordinador_headers).json()["acuerdos"][0]["id"]

    r = client.post(f"/api/minutas/{mid}/acuerdos/{acuerdo_id}/convertir", headers=coordinador_headers)
    assert r.status_code == 201, r.text
    assert r.json()["origin_acuerdo_id"] == acuerdo_id

    # a second conversion of the same acuerdo is rejected
    r2 = client.post(f"/api/minutas/{mid}/acuerdos/{acuerdo_id}/convertir", headers=coordinador_headers)
    assert r2.status_code == 409


def test_lider_cannot_create_task_governance_tier(client):
    coordinador_headers = _hdr(client, "coord@alpha.gov")
    lider_headers = _hdr(client, "lider@alpha.gov")

    wid = client.post("/api/workitems", json={"titulo": "con tareas"},
                      headers=coordinador_headers).json()["id"]
    r = client.post(f"/api/workitems/{wid}/tareas", json={"texto": "sub-tarea"},
                    headers=lider_headers)
    assert r.status_code == 403  # tasks are governance-tier (ADMIN/COORDINADOR)


def test_create_sprint_with_estado_activo_returns_409_if_active_exists(client):
    coordinador_headers = _hdr(client, "coord@alpha.gov")

    # Close any active sprints (DB fixture is session-scoped)
    activos = client.get("/api/sprints?estado=ACTIVO", headers=coordinador_headers).json()["items"]
    for s in activos:
        client.post(f"/api/sprints/{s['id']}/cerrar", headers=coordinador_headers)

    # Create and activate sprint A
    r1 = client.post("/api/sprints",
                     json={"nombre": "Sprint A", "fecha_inicio": "2026-07-08", "fecha_fin": "2026-07-22"},
                     headers=coordinador_headers)
    assert r1.status_code == 201, r1.text
    sid_a = r1.json()["id"]

    activate_resp = client.post(f"/api/sprints/{sid_a}/activar", headers=coordinador_headers)
    assert activate_resp.status_code == 200, activate_resp.text

    # Try to POST /api/sprints with estado="ACTIVO" while A is active — should return 409
    r2 = client.post("/api/sprints",
                     json={"nombre": "Sprint B", "fecha_inicio": "2026-07-23", "fecha_fin": "2026-08-06",
                           "estado": "ACTIVO"},
                     headers=coordinador_headers)
    assert r2.status_code == 409, f"Expected 409, got {r2.status_code}: {r2.text}"
    assert "activo" in r2.json()["error"]["message"].lower()


def test_metrics_and_ceremonias(client):
    coordinador_headers = _hdr(client, "coord@alpha.gov")

    sid = client.post("/api/sprints", json={"nombre": "S", "fecha_inicio": "2026-07-08", "fecha_fin": "2026-07-22"},
                      headers=coordinador_headers).json()["id"]
    client.post("/api/workitems", json={"titulo": "h", "story_points": 5, "sprint_id": sid}, headers=coordinador_headers)
    m = client.get(f"/api/sprints/{sid}/metrics", headers=coordinador_headers)
    assert m.status_code == 200 and m.json()["comprometido"] == 5
    bd = client.get(f"/api/sprints/{sid}/burndown", headers=coordinador_headers)
    assert bd.status_code == 200 and bd.json()["total_puntos"] == 5
    # create a PLANNING ceremony linked to the sprint
    cer = client.post(f"/api/sprints/{sid}/ceremonias",
                      json={"titulo": "Planning", "fecha": "2026-07-08", "tipo": "PLANNING"},
                      headers=coordinador_headers)
    assert cer.status_code == 201, cer.text
    lst = client.get(f"/api/sprints/{sid}/ceremonias", headers=coordinador_headers)
    assert lst.status_code == 200 and lst.json()["total"] == 1
