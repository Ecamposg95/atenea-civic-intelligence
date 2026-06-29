"""Admin console router: /admin registros, metricas, estructura, reveal, auditoria."""
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import AdminCtx, DbSession, Tenant, require_roles
from app.models.user import UserRole
from app.schemas.admin import (
    AdminRegistroList,
    AdminRegistroRead,
    EstructuraNode,
    MetricsRead,
    RevelarClaveResponse,
)
from app.schemas.audit import AuditEntry
from app.schemas.pagination import Page
from app.services import admin_service, audit_service
from app.utils.pagination import PaginationParams

router = APIRouter(prefix="/admin", tags=["admin"])

# Console read access: admin + coordinador + lider (each scoped by service layer).
ConsoleCtx = Annotated[object, Depends(require_roles(UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER))]
# Reveal + auditoria: admin only (lider/activista excluded; superadmin auto-passes).
AdminOnly = Annotated[object, Depends(require_roles(UserRole.ADMIN))]


@router.get("/registros", response_model=AdminRegistroList)
def list_registros(
    db: DbSession,
    ctx: AdminCtx,
    _perm: ConsoleCtx,
    pagination: Annotated[PaginationParams, Depends()],
    q: Optional[str] = Query(None),
    lider_id: Optional[str] = Query(None),
    activista_id: Optional[str] = Query(None),
    seccion: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None),
    until: Optional[datetime] = Query(None),
) -> AdminRegistroList:
    rows, total = admin_service.list_admin_registros(
        db, ctx,
        q=q, lider_id=lider_id, activista_id=activista_id, seccion=seccion,
        since=since, until=until, limit=pagination.limit, offset=pagination.offset,
    )
    return AdminRegistroList(
        items=[AdminRegistroRead(**r) for r in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/metricas", response_model=MetricsRead)
def metricas(db: DbSession, ctx: AdminCtx, _perm: ConsoleCtx) -> MetricsRead:
    return MetricsRead(**admin_service.metrics(db, ctx))


@router.get("/estructura", response_model=list[EstructuraNode])
def estructura(db: DbSession, ctx: AdminCtx, _perm: ConsoleCtx) -> list[EstructuraNode]:
    return [EstructuraNode(**n) for n in admin_service.estructura(db, ctx)]


@router.post("/registros/{registro_id}/revelar-clave", response_model=RevelarClaveResponse)
def revelar_clave(
    registro_id: str,
    db: DbSession,
    ctx: AdminCtx,
    _perm: AdminOnly,
) -> RevelarClaveResponse:
    try:
        plain = admin_service.reveal_clave(db, ctx, registro_id)
    except admin_service.NoClave:
        raise HTTPException(status_code=422, detail="El registro no tiene clave de elector")
    if plain is None:
        raise HTTPException(status_code=404, detail="Registro not found")
    return RevelarClaveResponse(registro_id=registro_id, clave_elector=plain)


@router.get("/auditoria", response_model=Page[AuditEntry])
def auditoria(
    ctx: Tenant,
    db: DbSession,
    _perm: AdminOnly,
    pagination: Annotated[PaginationParams, Depends()],
    action: Optional[str] = Query(None),
    actor: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None),
    until: Optional[datetime] = Query(None),
) -> Page[AuditEntry]:
    items, total = audit_service.list_events(
        db, ctx,
        action=action, actor=actor, entity_type=entity_type,
        since=since, until=until,
        limit=pagination.limit, offset=pagination.offset,
    )
    return Page[AuditEntry](
        items=[AuditEntry.model_validate(i) for i in items],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )
