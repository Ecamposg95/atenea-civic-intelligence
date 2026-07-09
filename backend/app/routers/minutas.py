"""/api/minutas + /api/acuerdos — meeting minutes and action items.

Route order: /acuerdos is its own top-level collection (transversal view);
/minutas/{mid} nests acuerdos. Gates: create/write = COORDINADOR tier + LIDER;
list/get = capture tier (ACTIVISTA+); delete/publish-revert = COORDINADOR/ADMIN.
"""
from typing import Annotated, Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import CampaignCtx, DbSession, require_roles
from app.models.user import UserRole
from app.schemas.minuta import (
    AcuerdoCreate, AcuerdoList, AcuerdoRead, AcuerdoUpdate,
    MinutaCreate, MinutaList, MinutaRead, MinutaUpdate,
)
from app.services import minuta_service

router = APIRouter(tags=["minutas"])

_WRITE = Annotated[object, Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER))]
_READ = Annotated[object, Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER,
    UserRole.ACTIVISTA, UserRole.CAPTURISTA))]


# ── Acuerdos transversal (antes de /minutas/{mid}) ──────────────────────────────
@router.get("/acuerdos", response_model=AcuerdoList)
def list_acuerdos(db: DbSession, ctx: CampaignCtx, _p: _READ,
                  responsable_id: Annotated[Optional[str], Query()] = None,
                  estado: Annotated[Optional[str], Query()] = None,
                  vence_antes: Annotated[Optional[date], Query()] = None,
                  limit: Annotated[int, Query(ge=1, le=200)] = 50,
                  offset: Annotated[int, Query(ge=0)] = 0):
    rows, total = minuta_service.list_acuerdos(
        db, ctx, responsable_id=responsable_id, estado=estado,
        vence_antes=vence_antes, limit=limit, offset=offset)
    return AcuerdoList(items=[AcuerdoRead.model_validate(a, from_attributes=True) for a in rows],
                       total=total, limit=limit, offset=offset)


# ── Minutas ─────────────────────────────────────────────────────────────────────
@router.post("/minutas", response_model=MinutaRead, status_code=status.HTTP_201_CREATED)
def create_minuta(data: MinutaCreate, db: DbSession, ctx: CampaignCtx, _p: _WRITE):
    m = minuta_service.create_minuta(db, ctx, data)
    db.commit()
    return MinutaRead.model_validate(m, from_attributes=True)


@router.get("/minutas", response_model=MinutaList)
def list_minutas(db: DbSession, ctx: CampaignCtx, _p: _READ,
                 tipo: Annotated[Optional[str], Query()] = None,
                 estado: Annotated[Optional[str], Query()] = None,
                 desde: Annotated[Optional[date], Query()] = None,
                 hasta: Annotated[Optional[date], Query()] = None,
                 limit: Annotated[int, Query(ge=1, le=200)] = 50,
                 offset: Annotated[int, Query(ge=0)] = 0):
    rows, total = minuta_service.list_minutas(
        db, ctx, tipo=tipo, estado=estado, desde=desde, hasta=hasta,
        limit=limit, offset=offset)
    return MinutaList(items=[MinutaRead.model_validate(m, from_attributes=True) for m in rows],
                      total=total, limit=limit, offset=offset)


@router.get("/minutas/{mid}", response_model=MinutaRead)
def get_minuta(mid: str, db: DbSession, ctx: CampaignCtx, _p: _READ):
    m = minuta_service.get_minuta(db, ctx, mid)
    if m is None:
        raise HTTPException(status_code=404, detail="Minuta no encontrada")
    return MinutaRead.model_validate(m, from_attributes=True)


@router.patch("/minutas/{mid}", response_model=MinutaRead)
def update_minuta(mid: str, data: MinutaUpdate, db: DbSession, ctx: CampaignCtx, _p: _WRITE):
    try:
        m = minuta_service.update_minuta(db, ctx, mid, data)
    except minuta_service.PublishedLockError:
        raise HTTPException(status_code=409, detail="Minuta publicada: solo un coordinador puede editar el acta")
    if m is None:
        raise HTTPException(status_code=404, detail="Minuta no encontrada")
    db.commit()
    return MinutaRead.model_validate(m, from_attributes=True)


@router.delete("/minutas/{mid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_minuta(mid: str, db: DbSession, ctx: CampaignCtx,
                  _p: Annotated[object, Depends(require_roles(UserRole.ADMIN, UserRole.COORDINADOR))]):
    if not minuta_service.delete_minuta(db, ctx, mid):
        raise HTTPException(status_code=404, detail="Minuta no encontrada")
    db.commit()


# ── Acuerdos anidados ───────────────────────────────────────────────────────────
@router.post("/minutas/{mid}/acuerdos", response_model=AcuerdoRead, status_code=status.HTTP_201_CREATED)
def add_acuerdo(mid: str, data: AcuerdoCreate, db: DbSession, ctx: CampaignCtx, _p: _WRITE):
    a = minuta_service.add_acuerdo(db, ctx, mid, data)
    if a is None:
        raise HTTPException(status_code=404, detail="Minuta no encontrada")
    db.commit()
    return AcuerdoRead.model_validate(a, from_attributes=True)


@router.patch("/minutas/{mid}/acuerdos/{aid}", response_model=AcuerdoRead)
def update_acuerdo(mid: str, aid: str, data: AcuerdoUpdate, db: DbSession, ctx: CampaignCtx, _p: _WRITE):
    a = minuta_service.update_acuerdo(db, ctx, mid, aid, data)
    if a is None:
        raise HTTPException(status_code=404, detail="Acuerdo no encontrado")
    db.commit()
    return AcuerdoRead.model_validate(a, from_attributes=True)


@router.delete("/minutas/{mid}/acuerdos/{aid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_acuerdo(mid: str, aid: str, db: DbSession, ctx: CampaignCtx, _p: _WRITE):
    if not minuta_service.delete_acuerdo(db, ctx, mid, aid):
        raise HTTPException(status_code=404, detail="Acuerdo no encontrado")
    db.commit()
