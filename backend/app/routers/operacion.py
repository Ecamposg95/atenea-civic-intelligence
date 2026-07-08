"""Operación territorial — plan por sección + agenda 30/60/90 (campaign-scoped)."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.dependencies import CampaignCtx, DbSession, require_roles
from app.models.user import UserRole
from app.services import operacion_service

_READ = Annotated[object, Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER,
    UserRole.ANALYST, UserRole.VIEWER))]
# Editing the plan / agenda is a supervisory operation.
_MANAGE = Annotated[object, Depends(require_roles(UserRole.ADMIN, UserRole.COORDINADOR))]

router = APIRouter(prefix="/operacion", tags=["operacion"])


class PlanUpdate(BaseModel):
    responsable_id: Optional[str] = None
    problema_dominante: Optional[str] = Field(default=None, max_length=120)
    liderazgo: Optional[str] = Field(default=None, max_length=500)
    meta_semanal: Optional[int] = Field(default=None, ge=0, le=100000)
    prioridad_operativa: Optional[str] = Field(default=None, max_length=30)
    notas: Optional[str] = Field(default=None, max_length=2000)


class AgendaCreate(BaseModel):
    fase: int = Field(..., description="30 | 60 | 90")
    titulo: str = Field(..., min_length=1, max_length=255)
    descripcion: Optional[str] = Field(default=None, max_length=1000)


class AgendaUpdate(BaseModel):
    titulo: Optional[str] = Field(default=None, min_length=1, max_length=255)
    descripcion: Optional[str] = Field(default=None, max_length=1000)
    done: Optional[bool] = None
    orden: Optional[int] = None


@router.get("/planes")
def planes(db: DbSession, ctx: CampaignCtx, _p: _READ):
    return operacion_service.list_planes(db, ctx)


@router.put("/planes/{seccion}")
def upsert_plan(seccion: str, data: PlanUpdate, db: DbSession, ctx: CampaignCtx, _p: _MANAGE):
    operacion_service.upsert_plan(db, ctx, seccion, data.model_dump(exclude_unset=True))
    return {"ok": True}


@router.get("/agenda")
def agenda(db: DbSession, ctx: CampaignCtx, _p: _READ):
    return operacion_service.list_agenda(db, ctx)


@router.post("/agenda", status_code=201)
def create_agenda(data: AgendaCreate, db: DbSession, ctx: CampaignCtx, _p: _MANAGE):
    return operacion_service.create_agenda(db, ctx, data.fase, data.titulo, data.descripcion)


@router.patch("/agenda/{item_id}")
def update_agenda(item_id: str, data: AgendaUpdate, db: DbSession, ctx: CampaignCtx, _p: _MANAGE):
    return operacion_service.update_agenda(db, ctx, item_id, data.model_dump(exclude_unset=True))
