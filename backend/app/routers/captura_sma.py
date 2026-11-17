"""Captura de hojas SMA — /captura/* (spec 2026-11-17 §5).

ADMIN, COORDINADOR and CAPTURISTA (superadmin auto-passes). Everything is
tenant+campaign scoped through ``CampaignCtx`` (X-Campaign-Id).
"""
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse

from app.dependencies import CampaignCtx, DbSession, require_roles
from app.models.user import UserRole
from app.schemas.captura_sma import CatalogoOut, HojaIn, HojaOut, HojaResumen, PersonaOut
from app.services import captura_sma_service as svc
from app.services import privacy_service

_CAPTURA = Depends(require_roles(UserRole.ADMIN, UserRole.COORDINADOR, UserRole.CAPTURISTA))

router = APIRouter(prefix="/captura", tags=["captura"], dependencies=[_CAPTURA])


@router.get("/catalogo", response_model=CatalogoOut)
def catalogo(ctx: CampaignCtx) -> CatalogoOut:
    return svc.catalogo()


@router.get("/personas", response_model=list[PersonaOut])
def personas(
    db: DbSession, ctx: CampaignCtx,
    tipo: Annotated[Literal["LIDER", "ACTIVISTA"], Query()],
    q: Annotated[Optional[str], Query(max_length=120)] = None,
) -> list[PersonaOut]:
    return svc.buscar_personas(db, ctx, tipo, q)


@router.post("/hoja", response_model=HojaOut,
             responses={422: {"model": HojaOut, "description": "La hoja tiene errores"}})
def hoja(data: HojaIn, db: DbSession, ctx: CampaignCtx):
    if ctx.is_superadmin and not ctx.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a base first")
    max_filas = svc.MAX_FILAS[data.tipo_hoja]
    if sum(1 for f in data.filas if not svc._is_empty(f)) > max_filas:
        raise HTTPException(status_code=422, detail=f"Una hoja {data.tipo_hoja} admite máximo {max_filas} filas")
    try:
        out = svc.procesar_hoja(db, ctx, data)
    except privacy_service.NoActiveNotice:
        raise HTTPException(status_code=409, detail="No hay aviso de privacidad activo")
    if not data.dry_run and not out.ok:
        return JSONResponse(status_code=422, content=out.model_dump(mode="json"))
    return out


@router.get("/mis-hojas", response_model=list[HojaResumen])
def mis_hojas(db: DbSession, ctx: CampaignCtx) -> list[HojaResumen]:
    return svc.mis_hojas(db, ctx)
