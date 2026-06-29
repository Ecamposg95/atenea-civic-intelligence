"""Tenant isolation and pagination contract tests."""

from fastapi.testclient import TestClient

from tests.conftest import auth_headers


def test_users_list_is_tenant_scoped(client: TestClient) -> None:
    """An Alpha admin must only ever see Alpha users (Golden Rule #1)."""
    headers = auth_headers(client, "admin@alpha.gov")

    me = client.get("/api/auth/me", headers=headers).json()
    my_org = me["organization_id"]
    assert my_org

    resp = client.get("/api/users", headers=headers)
    assert resp.status_code == 200
    body = resp.json()

    emails = {u["email"] for u in body["items"]}
    # Only Alpha users are visible; the Beta admin is never leaked.
    assert emails == {
        "admin@alpha.gov", "viewer@alpha.gov",
        "lider@alpha.gov", "activista1@alpha.gov", "activista2@alpha.gov",
        "coord@alpha.gov", "capturista@alpha.gov", "consulta@alpha.gov",
    }
    assert "admin@beta.gov" not in emails
    # Every returned record is scoped to the caller's organization.
    assert all(u["organization_id"] == my_org for u in body["items"])


def test_cross_tenant_users_are_isolated(client: TestClient) -> None:
    """Beta admin sees only Beta users — the inverse isolation check."""
    headers = auth_headers(client, "admin@beta.gov")
    resp = client.get("/api/users", headers=headers)
    assert resp.status_code == 200
    emails = {u["email"] for u in resp.json()["items"]}
    assert emails == {"admin@beta.gov", "activista_beta@beta.gov"}
    assert "admin@alpha.gov" not in emails


def test_pagination_response_shape(client: TestClient) -> None:
    """List endpoints return the canonical shape (Golden Rule #7)."""
    headers = auth_headers(client, "admin@alpha.gov")
    resp = client.get("/api/users?limit=1&offset=0", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) >= {"items", "total", "limit", "offset"}
    assert body["limit"] == 1
    assert body["offset"] == 0
    assert body["total"] == 8  # eight Alpha users (admin, viewer, lider, activista1, activista2, coord, capturista, consulta)
    assert len(body["items"]) == 1  # limited to one


def test_list_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/users")
    assert resp.status_code == 401
