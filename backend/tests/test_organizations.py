"""Organizations CRUD: superadmin-only writes, RBAC, slug uniqueness, listing.

The shared conftest seeds only ADMIN/VIEWER users (no superadmin), so the
write-path tests here assert that non-superadmins are forbidden (403) and that
the read path keeps working. The service-level happy paths (create/update,
duplicate-slug 409) are exercised directly against the session with a
superadmin context, which does not require editing conftest.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.dependencies import TenantContext
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.schemas.organization import OrganizationCreate, OrganizationUpdate
from app.services import orgs_service
from tests.conftest import TestingSessionLocal, auth_headers


# --- Router-level RBAC (HTTP) ----------------------------------------------
def test_list_organizations_still_works(client: TestClient) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    resp = client.get("/api/organizations", headers=h)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "items" in body and "total" in body
    # A non-superadmin only sees their own org.
    assert all("id" in item for item in body["items"])


def test_admin_cannot_create_organization(client: TestClient) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    resp = client.post(
        "/api/organizations",
        headers=h,
        json={"name": "Gamma Institute", "slug": "gamma"},
    )
    assert resp.status_code == 403, resp.text


def test_viewer_cannot_create_organization(client: TestClient) -> None:
    h = auth_headers(client, "viewer@alpha.gov")
    resp = client.post(
        "/api/organizations",
        headers=h,
        json={"name": "Delta Institute", "slug": "delta"},
    )
    assert resp.status_code == 403, resp.text


def test_admin_cannot_update_organization(client: TestClient) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    # Resolve the caller's own org id via the listing endpoint.
    org_id = client.get("/api/organizations", headers=h).json()["items"][0]["id"]
    resp = client.patch(
        f"/api/organizations/{org_id}",
        headers=h,
        json={"name": "Renamed"},
    )
    assert resp.status_code == 403, resp.text


# --- Service-level superadmin happy paths -----------------------------------
@pytest.fixture()
def superadmin_ctx() -> TenantContext:
    """A superadmin actor not bound to any organization (platform-wide)."""
    sa = User(
        email="root@agora.gov",
        full_name="Platform Root",
        hashed_password="x",
        role=UserRole.SUPERADMIN,
        organization_id=None,
    )
    return TenantContext(user=sa, organization_id=None, role=UserRole.SUPERADMIN)


def test_superadmin_creates_organization(superadmin_ctx: TenantContext) -> None:
    db = TestingSessionLocal()
    try:
        org = orgs_service.create_organization(
            db,
            superadmin_ctx,
            OrganizationCreate(name="Omega Institute", slug="omega"),
        )
        assert org.id
        assert org.slug == "omega"
        assert org.is_active is True
        # Persisted and retrievable.
        fetched = db.get(Organization, org.id)
        assert fetched is not None and fetched.name == "Omega Institute"
    finally:
        db.close()


def test_superadmin_updates_organization(superadmin_ctx: TenantContext) -> None:
    db = TestingSessionLocal()
    try:
        org = orgs_service.create_organization(
            db,
            superadmin_ctx,
            OrganizationCreate(name="Sigma Institute", slug="sigma"),
        )
        updated = orgs_service.update_organization(
            db,
            superadmin_ctx,
            org.id,
            OrganizationUpdate(name="Sigma Renamed", slug="sigma-2", is_active=False),
        )
        assert updated.name == "Sigma Renamed"
        assert updated.slug == "sigma-2"
        assert updated.is_active is False
    finally:
        db.close()


def test_duplicate_slug_on_create_conflicts(superadmin_ctx: TenantContext) -> None:
    db = TestingSessionLocal()
    try:
        # "alpha" is seeded by conftest.
        with pytest.raises(HTTPException) as exc:
            orgs_service.create_organization(
                db,
                superadmin_ctx,
                OrganizationCreate(name="Clash", slug="alpha"),
            )
        assert exc.value.status_code == 409
    finally:
        db.close()


def test_duplicate_slug_on_update_conflicts(superadmin_ctx: TenantContext) -> None:
    db = TestingSessionLocal()
    try:
        org = orgs_service.create_organization(
            db,
            superadmin_ctx,
            OrganizationCreate(name="Movable", slug="movable"),
        )
        with pytest.raises(HTTPException) as exc:
            orgs_service.update_organization(
                db,
                superadmin_ctx,
                org.id,
                OrganizationUpdate(slug="alpha"),  # collides with seeded org
            )
        assert exc.value.status_code == 409
    finally:
        db.close()


def test_non_superadmin_service_create_forbidden() -> None:
    db = TestingSessionLocal()
    try:
        admin = User(
            email="svc-admin@alpha.gov",
            full_name="Svc Admin",
            hashed_password="x",
            role=UserRole.ADMIN,
            organization_id="some-org",
        )
        ctx = TenantContext(user=admin, organization_id="some-org", role=UserRole.ADMIN)
        with pytest.raises(HTTPException) as exc:
            orgs_service.create_organization(
                db, ctx, OrganizationCreate(name="Nope", slug="nope")
            )
        assert exc.value.status_code == 403
    finally:
        db.close()
