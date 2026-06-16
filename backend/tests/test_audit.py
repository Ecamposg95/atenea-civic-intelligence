"""Tests for the read-only audit endpoint."""

from datetime import datetime, timedelta, timezone

from app.models.audit_log import AuditLog
from app.models.organization import Organization

from .conftest import TestingSessionLocal, auth_headers


def _alpha_org_id() -> str:
    db = TestingSessionLocal()
    try:
        org = db.query(Organization).filter(Organization.slug == "alpha").one()
        return org.id
    finally:
        db.close()


def _seed_audit(org_id: str, **kwargs) -> AuditLog:
    """Insert a raw audit row scoped to an org and return it."""
    db = TestingSessionLocal()
    try:
        entry = AuditLog(organization_id=org_id, **kwargs)
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry
    finally:
        db.close()


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


def test_admin_does_not_see_other_tenant_events(client):
    # Logging in writes an auth.login audit row scoped to each user's org.
    alpha_headers = auth_headers(client, "admin@alpha.gov")
    beta_headers = auth_headers(client, "admin@beta.gov")

    alpha_resp = client.get("/api/audit", headers=alpha_headers)
    beta_resp = client.get("/api/audit", headers=beta_headers)
    assert alpha_resp.status_code == 200, alpha_resp.text
    assert beta_resp.status_code == 200, beta_resp.text

    alpha_orgs = {item["organization_id"] for item in alpha_resp.json()["items"]}
    beta_orgs = {item["organization_id"] for item in beta_resp.json()["items"]}

    # Each tenant sees its own events and exactly one org id, and they never overlap.
    assert alpha_orgs and beta_orgs
    assert len(alpha_orgs) == 1 and len(beta_orgs) == 1
    assert alpha_orgs.isdisjoint(beta_orgs)


def test_entity_type_filter_narrows_results(client):
    org_id = _alpha_org_id()
    _seed_audit(org_id, action="document.read", entity_type="document")
    _seed_audit(org_id, action="report.read", entity_type="report")
    headers = auth_headers(client, "admin@alpha.gov")

    resp = client.get("/api/audit?entity_type=document", headers=headers)
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert items, "expected at least one document entry"
    assert all(item["entity_type"] == "document" for item in items)
    assert not any(item["entity_type"] == "report" for item in items)


def test_actor_filter(client):
    org_id = _alpha_org_id()
    actor = "actor-fixed-12345"
    _seed_audit(org_id, action="thing.read", actor_id=actor, entity_type="thing")
    headers = auth_headers(client, "admin@alpha.gov")

    resp = client.get(f"/api/audit?actor={actor}", headers=headers)
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert items, "expected the seeded actor entry"
    assert all(item["actor_id"] == actor for item in items)


def test_until_bounds_results(client):
    org_id = _alpha_org_id()
    old_ts = datetime(2000, 1, 1, tzinfo=timezone.utc)
    _seed_audit(
        org_id, action="old.event", entity_type="ancient", created_at=old_ts
    )
    headers = auth_headers(client, "admin@alpha.gov")

    # until just after the old timestamp returns the old event...
    boundary = (old_ts + timedelta(days=1)).isoformat()
    resp = client.get(
        "/api/audit",
        params={"entity_type": "ancient", "until": boundary},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] >= 1

    # ...but a tighter upper bound before it excludes the event.
    tight = (old_ts - timedelta(days=1)).isoformat()
    resp = client.get(
        "/api/audit",
        params={"entity_type": "ancient", "until": tight},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 0
