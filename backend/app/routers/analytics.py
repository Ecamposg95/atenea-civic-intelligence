"""Analytics router — civic intelligence overview metrics."""

from typing import Any

from fastapi import APIRouter, Depends

from app.dependencies import DbSession, Tenant, require_roles
from app.models.user import UserRole
from app.services import analytics_service

# Intelligence read: admin/coordinador/lider/analyst/viewer; superadmin auto-passes.
_INTEL_READ = Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER, UserRole.ANALYST, UserRole.VIEWER,
))

router = APIRouter(prefix="/analytics", tags=["analytics"], dependencies=[_INTEL_READ])


@router.get("/overview", summary="Civic intelligence overview")
def overview(ctx: Tenant, db: DbSession) -> dict[str, Any]:
    """Return real, tenant-scoped KPIs, coverage and activity for the dashboard."""
    return analytics_service.get_overview(db, ctx)
