from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select

from app.dependencies import DbSession, Tenant, require_roles
from app.models.electoral_area import ElectoralArea
from app.models.user import UserRole
from app.services import territory_service

# Intelligence read: admin/coordinador/lider/analyst/viewer; superadmin auto-passes.
_INTEL_READ = Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER, UserRole.ANALYST, UserRole.VIEWER,
))

# Territory search / assignment management: admin/superadmin only.
_AREA_MANAGE = Depends(require_roles(UserRole.ADMIN))  # superadmin auto-passes

router = APIRouter(prefix="/territory", tags=["territory"], dependencies=[_INTEL_READ])


@router.get("/search")
def search(
    db: DbSession, ctx: Tenant, _perm: object = _AREA_MANAGE,
    q: Optional[str] = None, level: Optional[str] = None,
):
    areas = territory_service.search_areas(db, ctx.organization_id, q, level)
    return [{"id": a.id, "name": a.name, "level": a.level.value, "code": a.code} for a in areas]


@router.get("/children")
def children(
    db: DbSession,
    ctx: Tenant,
    parent_id: Optional[str] = None,
    level: Optional[str] = None,
):
    stmt = select(ElectoralArea).where(
        ElectoralArea.deleted_at.is_(None),
        or_(
            ElectoralArea.organization_id.is_(None),
            ElectoralArea.organization_id == ctx.organization_id,
        ),
    )
    if parent_id:
        stmt = stmt.where(ElectoralArea.parent_id == parent_id)
    if level:
        stmt = stmt.where(ElectoralArea.level == level)
    rows = db.execute(stmt.limit(5000)).scalars()
    return [{"id": a.id, "name": a.name, "level": a.level.value, "code": a.code} for a in rows]
