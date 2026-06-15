"""Audit router — read-only access to the tenant-scoped audit trail."""

from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query

from app.dependencies import DbSession, TenantContext, require_roles
from app.models.user import UserRole
from app.schemas.audit import AuditEntry
from app.schemas.pagination import Page
from app.services import audit_service
from app.utils.pagination import PaginationParams

router = APIRouter(prefix="/audit", tags=["audit"])

AuditCtx = Annotated[TenantContext, Depends(require_roles(UserRole.ADMIN))]


@router.get("", summary="List audit entries", response_model=Page[AuditEntry])
def list_audit(
    ctx: AuditCtx,
    db: DbSession,
    pagination: Annotated[PaginationParams, Depends()],
    action: Optional[str] = Query(None, description="Filter by exact action"),
    since: Optional[datetime] = Query(None, description="Only entries at/after this UTC time"),
) -> Page[AuditEntry]:
    items, total = audit_service.list_events(
        db, ctx, action=action, since=since,
        limit=pagination.limit, offset=pagination.offset,
    )
    return Page[AuditEntry](
        items=[AuditEntry.model_validate(i) for i in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )
