"""Promovidos listing — role+territory scoped, enriched with electoral context."""
from __future__ import annotations

from typing import Optional

import sqlalchemy as sa
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.registro import Registro
from app.models.seccion_electoral import SeccionElectoral
from app.models.user import UserRole
from app.services import territory_service
from app.services.registro_service import _role_scoped
from app.services.territory_service import secciones_query


def _promovido_role_scoped(ctx: CampaignContext):
    """Role scope for /promovidos.

    Unlike /registros, a "promovido" may be attributed only to a free-text
    `promotor` (a canvasser with no user account) — `activista_id` is then
    NULL, so it falls outside anyone's activista-hierarchy. `_role_scoped`'s
    hierarchy filter would hide those rows from every non-ADMIN role.
    Supervisory roles (COORDINADOR/LIDER) reuse `_role_scoped`'s hierarchy
    filter as an id subquery, OR'd with unowned `promotor` rows — territory
    scoping (applied by the caller) is the real gate for those, not
    hierarchy.
    """
    if ctx.is_superadmin or ctx.role == UserRole.ADMIN:
        return _role_scoped(ctx)
    if ctx.role == UserRole.COORDINADOR:
        # Campaign-wide (see registro_service._role_scoped); already includes
        # unowned promotor rows, so no extra OR is needed.
        return _role_scoped(ctx)
    if ctx.role == UserRole.LIDER:
        hierarchy_ids = select(_role_scoped(ctx).subquery().c.id)
        return scoped_query(Registro, ctx).where(
            or_(Registro.id.in_(hierarchy_ids), Registro.activista_id.is_(None))
        )
    # any other role (defense-in-depth; the router already denies these).
    return _role_scoped(ctx)


# Whitelist of sortable columns — concrete Registro columns only. Prevents
# arbitrary attribute/SQL injection via the `sort` query param and keeps
# joined/categorical fields (e.g. prioridad, which lives on SeccionElectoral)
# out of scope.
_SORT_WHITELIST = {
    "nombre": Registro.nombre_completo,
    "seccion": Registro.seccion,
    "created_at": Registro.created_at,
    "edad": Registro.edad,
}


def list_promovidos(
    db: Session, ctx: CampaignContext, *, seccion: Optional[str], promotor: Optional[str],
    prioridad: Optional[str], q: Optional[str], limit: int, offset: int,
    sort: str = "created_at", order: str = "desc",
) -> tuple[list[Registro], int, bool]:
    secciones = territory_service.scope_secciones(db, ctx.user)
    # COORDINADOR is the campaign executive → campaign-wide, no territory gate.
    bypass_territory = ctx.is_superadmin or ctx.role in (UserRole.ADMIN, UserRole.COORDINADOR)
    has_territory = bypass_territory or bool(secciones)

    stmt = _promovido_role_scoped(ctx)
    if not bypass_territory:
        if not secciones:
            stmt = stmt.where(sa.false())
        else:
            stmt = stmt.where(Registro.seccion.in_(secciones))
    if seccion:
        stmt = stmt.where(Registro.seccion == seccion)
    if promotor:
        stmt = stmt.where(Registro.promotor.ilike(f"%{promotor}%"))
    if q:
        stmt = stmt.where(Registro.nombre_completo.ilike(f"%{q}%"))

    # prioridad filter needs the electoral join
    if prioridad:
        pr = secciones_query(ctx).with_only_columns(SeccionElectoral.seccion).where(
            SeccionElectoral.prioridad == prioridad)
        stmt = stmt.where(Registro.seccion.in_(pr))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()

    sort_col = _SORT_WHITELIST.get(sort, Registro.created_at)
    direction = sa.asc if order == "asc" else sa.desc
    # Stable secondary key (id) so pagination is deterministic across pages,
    # even when the primary sort column has duplicate values.
    stmt = stmt.order_by(direction(sort_col), Registro.id)

    rows = list(db.execute(stmt.limit(limit).offset(offset)).scalars().all())

    # enrich with electoral context (single query)
    codes = {r.seccion for r in rows if r.seccion}
    facts = {}
    if codes:
        for f in db.execute(secciones_query(ctx).where(SeccionElectoral.seccion.in_(codes))).scalars():
            facts[f.seccion] = f
    for r in rows:
        f = facts.get(r.seccion)
        r.participacion = f.participacion if f else None
        r.margen = f.margen if f else None
        r.prioridad = f.prioridad if f else None
    return rows, total, has_territory
