"""Municipal intelligence — read-only panorama of the VG study data.
Territory/census data is org-global; this is an intelligence read gated to the
coordinador tier and up."""
from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import CampaignCtx, DbSession, Tenant, require_roles
from app.models.user import UserRole
from app.schemas.municipio import RegionOut
from app.services import municipio_service

_INTEL_READ = Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER,
    UserRole.ANALYST, UserRole.VIEWER,
))  # superadmin auto-passes

router = APIRouter(prefix="/municipio", tags=["municipio"], dependencies=[_INTEL_READ])


@router.get("/region", response_model=RegionOut)
def region(db: DbSession, cctx: CampaignCtx):
    if not cctx.municipio_code:
        raise HTTPException(status_code=404, detail="Campaña sin municipio")
    data = municipio_service.region(db, cctx.municipio_code)
    if data is None:
        raise HTTPException(status_code=404, detail="Municipio fuera del registro")
    return data


@router.get("/{code}/panorama")
def panorama(code: str, db: DbSession, ctx: Tenant):
    data = municipio_service.panorama(db, code)
    if data is None:
        raise HTTPException(status_code=404, detail="Municipio sin datos de inteligencia")
    return data
