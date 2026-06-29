"""Tests for the analytics overview — verifies real, tenant-scoped aggregates."""

from app.services.analytics_service import ACTIVITY_WINDOW_DAYS

from .conftest import auth_headers


def test_overview_requires_auth(client):
    assert client.get("/api/analytics/overview").status_code == 401


def test_overview_returns_real_tenant_scoped_metrics(client):
    headers = auth_headers(client, "admin@alpha.gov")
    resp = client.get("/api/analytics/overview", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    summary = body["summary"]
    # Non-superadmin sees exactly their own organization.
    assert summary["organizations"] == 1
    # Alpha tenant seeded with 5 active users (admin, viewer, lider, activista1, activista2).
    assert summary["users"] == 5
    # Data sources come from the INE source registry (non-empty).
    assert summary["data_sources"] >= 1
    assert summary["electoral_areas"] >= 0

    # Activity trend has one bucket per day in the window.
    activity = body["trends"]["activity"]
    assert len(activity) == ACTIVITY_WINDOW_DAYS
    assert all({"period", "value"} <= set(point) for point in activity)

    assert isinstance(body["coverage"], list)
    assert len(body["alerts"]) >= 1
    assert "generated_at" in body


def test_overview_includes_breakdowns(client):
    from .conftest import auth_headers
    # generate a couple of audit events (logins)
    auth_headers(client, "admin@alpha.gov")
    headers = auth_headers(client, "admin@alpha.gov")
    body = client.get("/api/analytics/overview", headers=headers).json()
    assert "by_action" in body and isinstance(body["by_action"], list)
    assert all({"action", "count"} <= set(x) for x in body["by_action"])
    assert "by_actor" in body and isinstance(body["by_actor"], list)
    # at least the auth.login action present
    assert any(x["action"] == "auth.login" for x in body["by_action"])

    # entity-type breakdown: list of {entity_type, count}, nulls skipped.
    assert "by_entity_type" in body and isinstance(body["by_entity_type"], list)
    assert all({"entity_type", "count"} <= set(x) for x in body["by_entity_type"])
    assert all(x["entity_type"] is not None for x in body["by_entity_type"])

    # hour-of-day breakdown: exactly 24 buckets, 0..23, with counts.
    by_hour = body["by_hour"]
    assert isinstance(by_hour, list) and len(by_hour) == 24
    assert [x["hour"] for x in by_hour] == list(range(24))
    assert all({"hour", "count"} <= set(x) for x in by_hour)
