"""Activist capture router: /registros + /perfil."""
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.dependencies import CampaignCtx, DbSession, Tenant, require_roles
from app.models.user import User, UserRole
from app.schemas.registro import (
    PerfilRead, RegistroCreate, RegistroList, RegistroRead, RegistroUpdate,
)
from app.services import registro_service

router = APIRouter(tags=["registros"])

# Escritura: activistas, capturistas, líderes, admins (COORDINADOR se excluye a
# propósito — usa la consola, no captura). Superadmins auto-pasan.
CapturaWriteCtx = Annotated[object, Depends(require_roles(
    UserRole.ACTIVISTA, UserRole.CAPTURISTA, UserRole.LIDER,
    UserRole.COORDINADOR, UserRole.ADMIN))]
# Lectura: lo mismo + COORDINADOR (ve a su estructura; el scoping real lo impone
# _role_scoped en el service).
CapturaReadCtx = Annotated[object, Depends(require_roles(
    UserRole.ACTIVISTA, UserRole.CAPTURISTA, UserRole.LIDER,
    UserRole.COORDINADOR, UserRole.ADMIN))]


@router.post("/registros", response_model=RegistroRead, status_code=201)
def create(data: RegistroCreate, db: DbSession, ctx: CampaignCtx, _perm: CapturaWriteCtx) -> RegistroRead:
    if ctx.is_superadmin and not ctx.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a base first")
    try:
        reg = registro_service.create_registro(db, ctx, data)
    except registro_service.ConsentRequired:
        raise HTTPException(status_code=422, detail="Consentimiento es obligatorio")
    return RegistroRead.model_validate(reg)


@router.get("/registros/mios", response_model=RegistroList)
def list_mine(
    db: DbSession, ctx: CampaignCtx, _perm: CapturaReadCtx,
    q: Annotated[Optional[str], Query()] = None,
    scope: Annotated[Literal["mine", "team"], Query()] = "team",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RegistroList:
    rows, total = registro_service.list_registros(db, ctx, q, limit, offset, scope)
    return RegistroList(items=[RegistroRead.model_validate(r) for r in rows],
                        total=total, limit=limit, offset=offset)


@router.get("/registros/{registro_id}", response_model=RegistroRead)
def get_one(registro_id: str, db: DbSession, ctx: CampaignCtx, _perm: CapturaReadCtx) -> RegistroRead:
    reg = registro_service.get_registro(db, ctx, registro_id)
    if reg is None:
        raise HTTPException(status_code=404, detail="Registro not found")
    return RegistroRead.model_validate(reg)


@router.put("/registros/{registro_id}", response_model=RegistroRead)
def update(registro_id: str, data: RegistroUpdate, db: DbSession, ctx: CampaignCtx, _perm: CapturaWriteCtx) -> RegistroRead:
    try:
        reg = registro_service.update_registro(db, ctx, registro_id, data)
    except registro_service.ConsentRequired:
        raise HTTPException(status_code=422, detail="Consentimiento es obligatorio")
    if reg is None:
        raise HTTPException(status_code=404, detail="Registro not found")
    return RegistroRead.model_validate(reg)


@router.delete("/registros/{registro_id}", status_code=204)
def delete(registro_id: str, db: DbSession, ctx: CampaignCtx, _perm: CapturaWriteCtx) -> None:
    if not registro_service.delete_registro(db, ctx, registro_id):
        raise HTTPException(status_code=404, detail="Registro not found")


@router.get("/perfil", response_model=PerfilRead)
def perfil(db: DbSession, ctx: Tenant) -> PerfilRead:
    lider_nombre = None
    if ctx.user.lider_id:
        lider = db.execute(select(User).where(User.id == ctx.user.lider_id)).scalar_one_or_none()
        lider_nombre = lider.full_name if lider else None
    area = None
    if ctx.user.area_id and ctx.user.area:
        area = {"id": ctx.user.area.id, "nombre": ctx.user.area.name,
                "nivel": ctx.user.area.level.value}
    return PerfilRead(
        id=ctx.user.id, full_name=ctx.user.full_name, role=ctx.user.role,
        seccion=ctx.user.seccion, lider_id=ctx.user.lider_id,
        lider_nombre=lider_nombre, organization_id=ctx.organization_id,
        area=area,
    )
