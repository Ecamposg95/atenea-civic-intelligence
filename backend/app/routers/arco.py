"""ARCO compliance router — admin-only hard-delete endpoints (AC-7.3).

All endpoints require ADMIN role (superadmin auto-passes via require_roles).
Tenant scope is enforced by the service layer via scoped_query / _role_scoped.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import AdminCtx, DbSession, require_roles
from app.models.user import UserRole
from app.schemas.arco import (
    ArcoEjecutarResponse,
    ArcoRequestCreate,
    ArcoRequestRead,
    EjecutarRequest,
)
from app.schemas.pagination import Page
from app.services import arco_service
from app.utils.pagination import PaginationParams

router = APIRouter(prefix="/arco", tags=["arco"])

# All ARCO operations are admin-only; superadmin passes automatically.
ArcoAdminOnly = Annotated[object, Depends(require_roles(UserRole.ADMIN))]


@router.post("/solicitudes", response_model=ArcoRequestRead, status_code=status.HTTP_201_CREATED)
def create_solicitud(
    body: ArcoRequestCreate,
    db: DbSession,
    ctx: AdminCtx,
    _perm: ArcoAdminOnly,
) -> ArcoRequestRead:
    """Create a new ARCO erasure request (PENDIENTE state)."""
    arco = arco_service.create_request(
        db, ctx,
        registro_id=body.registro_id,
        tipo=body.tipo,
        motivo=body.motivo,
        titular_ref=body.titular_ref,
    )
    return ArcoRequestRead.model_validate(arco)


@router.post("/solicitudes/{request_id}/ejecutar", response_model=ArcoEjecutarResponse)
def ejecutar_solicitud(
    request_id: str,
    db: DbSession,
    ctx: AdminCtx,
    _perm: ArcoAdminOnly,
    body: EjecutarRequest = EjecutarRequest(),
) -> ArcoEjecutarResponse:
    """Execute an ARCO hard-delete: permanently destroy the Registro + acceptances."""
    from sqlalchemy import select
    from app.models.arco import ArcoRequest

    # Resolve the ArcoRequest (must belong to this tenant unless superadmin).
    stmt = select(ArcoRequest).where(ArcoRequest.id == request_id)
    if not ctx.is_superadmin:
        stmt = stmt.where(ArcoRequest.organization_id == ctx.organization_id)
    arco = db.execute(stmt).scalar_one_or_none()
    if arco is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ArcoRequest not found")

    deleted = arco_service.hard_delete_titular(
        db, ctx,
        request_id=request_id,
        registro_ids=[arco.registro_id],
    )

    # Refresh to pick up the updated estado/processed_at.
    db.refresh(arco)
    from app.models.arco import ArcoEstado
    return ArcoEjecutarResponse(
        request_id=request_id,
        deleted=deleted,
        estado=arco.estado,
    )


@router.get("/solicitudes", response_model=Page[ArcoRequestRead])
def list_solicitudes(
    db: DbSession,
    ctx: AdminCtx,
    _perm: ArcoAdminOnly,
    pagination: Annotated[PaginationParams, Depends()],
) -> Page[ArcoRequestRead]:
    """List ARCO requests for the current tenant (admin-only)."""
    items, total = arco_service.list_requests(
        db, ctx, limit=pagination.limit, offset=pagination.offset
    )
    return Page[ArcoRequestRead](
        items=[ArcoRequestRead.model_validate(i) for i in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )
