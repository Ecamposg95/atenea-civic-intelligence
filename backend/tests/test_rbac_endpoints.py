"""TDD tests for RBAC v2 Task 4: role lists on captura/consola/export/reports.

RED phase: run before updating require_roles to confirm failures.
GREEN phase: run after updating role lists to confirm all pass.
"""
from tests.conftest import auth_headers, ALPHA_CAMPAIGN_ID


def _h(client, email):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID
    return h


def test_capturista_can_capture(client):
    r = client.post(
        "/api/registros",
        json={"nombre_completo": "Cap Uno", "consentimiento": True},
        headers=_h(client, "capturista@alpha.gov"),
    )
    assert r.status_code == 201, r.text
    client.delete(f"/api/registros/{r.json()['id']}", headers=_h(client, "capturista@alpha.gov"))


def test_coordinador_cannot_capture(client):
    r = client.post(
        "/api/registros",
        json={"nombre_completo": "X", "consentimiento": True},
        headers=_h(client, "coord@alpha.gov"),
    )
    assert r.status_code == 403, r.text


def test_coordinador_sees_admin_registros(client):
    assert client.get("/api/admin/registros", headers=_h(client, "coord@alpha.gov")).status_code == 200


def test_consulta_forbidden_on_admin_and_capture(client):
    assert client.get("/api/admin/registros", headers=_h(client, "consulta@alpha.gov")).status_code == 403
    assert (
        client.post(
            "/api/registros",
            json={"nombre_completo": "Y", "consentimiento": True},
            headers=_h(client, "consulta@alpha.gov"),
        ).status_code
        == 403
    )
