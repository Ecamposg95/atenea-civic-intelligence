"""Tests for the read-only audit endpoint."""

from .conftest import auth_headers


def _seed_login_events(client):
    # Each successful login writes an audit entry (auth flow records it).
    auth_headers(client, "admin@alpha.gov")
    auth_headers(client, "admin@alpha.gov")


def test_audit_requires_auth(client):
    assert client.get("/api/audit").status_code == 401


def test_viewer_forbidden(client):
    headers = auth_headers(client, "viewer@alpha.gov")
    assert client.get("/api/audit", headers=headers).status_code == 403


def test_admin_sees_paginated_tenant_events(client):
    _seed_login_events(client)
    headers = auth_headers(client, "admin@alpha.gov")
    resp = client.get("/api/audit?limit=5", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body) >= {"items", "total", "limit", "offset"}
    assert body["limit"] == 5
    assert body["total"] >= 1
    for item in body["items"]:
        assert {"id", "action", "created_at"} <= set(item)


def test_action_filter(client):
    headers = auth_headers(client, "admin@alpha.gov")
    resp = client.get("/api/audit?action=auth.login", headers=headers)
    assert resp.status_code == 200, resp.text
    for item in resp.json()["items"]:
        assert item["action"] == "auth.login"
