"""Municipal intelligence — read-only panorama of the VG study data.
Territory/census data is org-global; this is an intelligence read gated to the
coordinador tier and up."""
from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import DbSession, Tenant, require_roles
from app.models.user import UserRole
from app.services import municipio_service

_INTEL_READ = Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER,
    UserRole.ANALYST, UserRole.VIEWER,
))  # superadmin auto-passes

router = APIRouter(prefix="/municipio", tags=["municipio"], dependencies=[_INTEL_READ])


@router.get("/{code}/panorama")
def panorama(code: str, db: DbSession, ctx: Tenant):
    data = municipio_service.panorama(db, code)
    if data is None:
        raise HTTPException(status_code=404, detail="Municipio sin datos de inteligencia")
    return data
