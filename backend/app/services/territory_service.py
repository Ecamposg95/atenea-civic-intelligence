"""Territory scope helpers — resolve a user's assigned area and its secciones."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.user import User


def assigned_area(db: Session, user: User) -> Optional[ElectoralArea]:
    if not user.area_id:
        return None
    return db.execute(
        select(ElectoralArea).where(ElectoralArea.id == user.area_id)
    ).scalar_one_or_none()


def scope_area_ids(db: Session, user: User) -> set[str]:
    area = assigned_area(db, user)
    if area is None:
        return set()
    ids = {area.id}
    # descendants via denormalized FKs (estado_id / municipio_id / parent_id)
    stmt = select(ElectoralArea.id).where(
        or_(
            ElectoralArea.estado_id == area.id,
            ElectoralArea.municipio_id == area.id,
            ElectoralArea.parent_id == area.id,
        )
    )
    ids.update(i for (i,) in db.execute(stmt).all())
    return ids


def scope_secciones(db: Session, user: User) -> set[str]:
    area = assigned_area(db, user)
    if area is None:
        return set()
    if area.level == AreaLevel.SECCION:
        return {area.code} if area.code else set()
    stmt = select(ElectoralArea.code).where(ElectoralArea.level == AreaLevel.SECCION)
    if area.level == AreaLevel.MUNICIPIO:
        stmt = stmt.where(ElectoralArea.municipio_id == area.id)
    elif area.level == AreaLevel.ESTADO:
        stmt = stmt.where(ElectoralArea.estado_id == area.id)
    else:
        stmt = stmt.where(ElectoralArea.parent_id == area.id)
    return {c for (c,) in db.execute(stmt).all() if c}


def search_areas(
    db: Session, org_id: Optional[str], q: Optional[str],
    level: Optional[str], limit: int = 20,
) -> list[ElectoralArea]:
    stmt = select(ElectoralArea).where(
        ElectoralArea.deleted_at.is_(None),
        or_(ElectoralArea.organization_id.is_(None),
            ElectoralArea.organization_id == org_id),
    )
    if q:
        stmt = stmt.where(ElectoralArea.name.ilike(f"%{q}%"))
    if level:
        stmt = stmt.where(ElectoralArea.level == level)
    return list(db.execute(stmt.limit(limit)).scalars().all())
