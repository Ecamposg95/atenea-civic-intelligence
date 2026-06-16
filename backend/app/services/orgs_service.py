"""Organization management service — superadmin-only writes.

Only superadmins may create or update organizations (tenants). Slugs are unique
across the platform; collisions raise 409. Sensitive actions emit audit rows
(Golden Rule #5); responses are mapped to Pydantic schemas at the router.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import TenantContext
from app.models.organization import Organization
from app.schemas.organization import OrganizationCreate, OrganizationUpdate
from app.services.audit_service import record_audit


def _require_superadmin(ctx: TenantContext) -> None:
    if not ctx.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a superadmin can manage organizations",
        )


def _slug_in_use(db: Session, slug: str, *, exclude_id: str | None = None) -> bool:
    stmt = select(Organization.id).where(Organization.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(Organization.id != exclude_id)
    return db.execute(stmt).first() is not None


def _conflict() -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already in use")


def _get_org(db: Session, org_id: str) -> Organization:
    org = db.execute(
        select(Organization).where(
            Organization.id == org_id, Organization.deleted_at.is_(None)
        )
    ).scalar_one_or_none()
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        )
    return org


def create_organization(
    db: Session, ctx: TenantContext, data: OrganizationCreate
) -> Organization:
    """Create an organization. Superadmin-only; slug must be unique."""
    _require_superadmin(ctx)

    if _slug_in_use(db, data.slug):
        raise _conflict()

    org = Organization(
        name=data.name,
        slug=data.slug,
        is_active=True,
        created_by=ctx.user.id,
        updated_by=ctx.user.id,
    )
    db.add(org)
    db.flush()
    record_audit(
        db,
        action="organization.create",
        actor_id=ctx.user.id,
        organization_id=org.id,
        entity_type="organization",
        entity_id=org.id,
        meta={"slug": org.slug},
    )
    db.commit()
    db.refresh(org)
    return org


def update_organization(
    db: Session, ctx: TenantContext, org_id: str, data: OrganizationUpdate
) -> Organization:
    """Update an organization's name/slug/active flag. Superadmin-only."""
    _require_superadmin(ctx)

    org = _get_org(db, org_id)

    if data.slug is not None and data.slug != org.slug:
        if _slug_in_use(db, data.slug, exclude_id=org.id):
            raise _conflict()
        org.slug = data.slug
    if data.name is not None:
        org.name = data.name
    if data.is_active is not None:
        org.is_active = data.is_active

    org.updated_by = ctx.user.id
    record_audit(
        db,
        action="organization.update",
        actor_id=ctx.user.id,
        organization_id=org.id,
        entity_type="organization",
        entity_id=org.id,
        meta=data.model_dump(exclude_none=True),
    )
    db.commit()
    db.refresh(org)
    return org
