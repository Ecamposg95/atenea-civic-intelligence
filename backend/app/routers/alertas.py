"""Alertas — centro unificado de riesgo (lectura agregada, campaign-scoped)."""
from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import CampaignCtx, DbSession, require_roles
from app.models.user import UserRole
from app.schemas.alerta import AlertasResponse
from app.services import alerta_service

# Ejecutivo de campaña: admin + coordinador (superadmin pasa siempre).
_READ = Annotated[object, Depends(require_roles(UserRole.ADMIN, UserRole.COORDINADOR))]

router = APIRouter(prefix="/alertas", tags=["alertas"])


@router.get("", response_model=AlertasResponse)
def listar(db: DbSession, ctx: CampaignCtx, _p: _READ) -> AlertasResponse:
    return AlertasResponse(**alerta_service.evaluar(db, ctx))
