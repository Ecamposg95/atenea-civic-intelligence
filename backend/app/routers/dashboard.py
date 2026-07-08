"""Executive Command Center — campaign KPIs (read-only, campaign-scoped)."""
from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import CampaignCtx, DbSession, require_roles
from app.models.user import UserRole
from app.services import dashboard_service

_READ = Annotated[object, Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER,
    UserRole.ANALYST, UserRole.VIEWER, UserRole.CONSULTA))]

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/executive")
def executive(db: DbSession, ctx: CampaignCtx, _p: _READ):
    return dashboard_service.executive(db, ctx)
