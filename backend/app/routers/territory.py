from typing import Optional

from fastapi import APIRouter
from sqlalchemy import or_, select

from app.dependencies import DbSession, Tenant
from app.models.electoral_area import ElectoralArea

router = APIRouter(prefix="/territory", tags=["territory"])


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
