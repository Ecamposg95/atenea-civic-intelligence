"""Organizations router — tenant-scoped, paginated.

Non-superadmins only ever see their own organization.

Role gating (per-endpoint, roles differ):
  GET  /organizations        → ADMIN (sees own org) + superadmin (sees all)
  POST /organizations        → SUPERADMIN only (create tenant; service also enforces)
  PATCH /organizations/{id}  → SUPERADMIN only (mutate tenant; service also enforces)
"""
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select

from app.dependencies import DbSession, Tenant, require_roles
from app.models.organization import Organization
from app.models.user import UserRole
from app.schemas.organization import (
    OrganizationCreate,
    OrganizationRead,
    OrganizationUpdate,
)
from app.schemas.pagination import Page
from app.services import orgs_service
from app.utils.pagination import PaginationParams

# Admin can list their own org; superadmin auto-passes and sees all.
_AdminReadCtx = Annotated[object, Depends(require_roles(UserRole.ADMIN))]
# Only superadmin may create or update organizations (cross-tenant mutations).
_SuperadminCtx = Annotated[object, Depends(require_roles(UserRole.SUPERADMIN))]

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=Page[OrganizationRead], summary="List organizations")
def list_organizations(
    db: DbSession,
    ctx: Tenant,
    _perm: _AdminReadCtx,
    pagination: PaginationParams = Depends(),
) -> Page[OrganizationRead]:
    """List organizations visible to the caller."""
    filters = [Organization.deleted_at.is_(None)]
    if not ctx.is_superadmin:
        filters.append(Organization.id == ctx.organization_id)

    total = db.scalar(select(func.count(Organization.id)).where(*filters)) or 0
    rows = (
        db.execute(
            select(Organization)
            .where(*filters)
            .order_by(Organization.created_at)
            .limit(pagination.limit)
            .offset(pagination.offset)
        )
        .scalars()
        .all()
    )

    return Page[OrganizationRead](
        items=[OrganizationRead.model_validate(r) for r in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.post(
    "",
    response_model=OrganizationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create organization (superadmin only)",
)
def create_organization(
    payload: OrganizationCreate,
    db: DbSession,
    ctx: Tenant,
    _perm: _SuperadminCtx,
) -> OrganizationRead:
    """Create a new organization. Restricted to superadmins."""
    org = orgs_service.create_organization(db, ctx, payload)
    return OrganizationRead.model_validate(org)


@router.patch(
    "/{org_id}",
    response_model=OrganizationRead,
    summary="Update organization (superadmin only)",
)
def update_organization(
    org_id: str,
    payload: OrganizationUpdate,
    db: DbSession,
    ctx: Tenant,
    _perm: _SuperadminCtx,
) -> OrganizationRead:
    """Update an organization. Restricted to superadmins."""
    org = orgs_service.update_organization(db, ctx, org_id, payload)
    return OrganizationRead.model_validate(org)
