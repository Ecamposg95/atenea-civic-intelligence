"""Admin console service — read-only aggregates + audited clave reveal.

No schema changes: reuses Registro, User, Organization and the SPA-1 role-scope
helper (registro_service._role_scoped). Listings/metrics NEVER decrypt; only the
reveal endpoint does, and it always audits (Golden Rule #5).
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from app.dependencies import CampaignContext
from app.models.organization import Organization
from app.models.registro import Registro
from app.models.user import User
from app.services.registro_service import _role_scoped


def list_admin_registros(
    db: Session,
    ctx: CampaignContext,
    *,
    q: Optional[str],
    lider_id: Optional[str],
    activista_id: Optional[str],
    seccion: Optional[str],
    since: Optional[datetime],
    until: Optional[datetime],
    limit: int,
    offset: int,
) -> tuple[list[dict], int]:
    """Return a filtered, paginated list of registros for the admin console.

    Role/tenant scope is delegated to _role_scoped (SPA-1).
    clave_elector_enc is NEVER included — only clave_masked.
    The `organization_name` column is always present (base column for
    consolidated/superadmin views showing multiple orgs).
    """
    # Scope: valid registro IDs for this context (tenant + role + soft-delete)
    scope = _role_scoped(ctx).with_only_columns(Registro.id)

    act = aliased(User)        # activista (capturer)
    lid = aliased(User)        # activista's leader
    org = aliased(Organization)

    stmt = (
        select(
            Registro,
            act.full_name.label("act_name"),
            act.lider_id.label("act_lider_id"),
            lid.full_name.label("lid_name"),
            org.name.label("org_name"),
        )
        .where(Registro.id.in_(scope))
        .outerjoin(act, act.id == Registro.activista_id)
        .outerjoin(lid, lid.id == act.lider_id)
        .outerjoin(org, org.id == Registro.organization_id)
    )

    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(Registro.nombre_completo.ilike(like), Registro.seccion.ilike(like))
        )
    if activista_id:
        stmt = stmt.where(Registro.activista_id == activista_id)
    if seccion:
        stmt = stmt.where(Registro.seccion == seccion)
    if lider_id:
        # Registros captured by this leader's activistas or by the leader directly
        members = select(User.id).where(User.lider_id == lider_id)
        stmt = stmt.where(
            or_(Registro.activista_id.in_(members), Registro.activista_id == lider_id)
        )
    if since is not None:
        stmt = stmt.where(Registro.created_at >= since)
    if until is not None:
        stmt = stmt.where(Registro.created_at <= until)

    total = db.execute(
        select(func.count()).select_from(stmt.subquery())
    ).scalar_one()

    rows = db.execute(
        stmt.order_by(Registro.created_at.desc()).limit(limit).offset(offset)
    ).all()

    out: list[dict] = []
    for r, act_name, act_lider_id, lid_name, org_name in rows:
        out.append({
            "id": r.id,
            "organization_id": r.organization_id,
            "organization_name": org_name,
            "campaign_id": r.campaign_id,
            "activista_id": r.activista_id,
            "activista_nombre": act_name,
            "lider_id": act_lider_id,
            "lider_nombre": lid_name,
            "nombre_completo": r.nombre_completo,
            "seccion": r.seccion,
            "colonia": r.colonia,
            "area": r.area,
            "telefono": r.telefono,
            "clave_masked": r.clave_masked,
            "consentimiento": r.consentimiento,
            "consentimiento_at": r.consentimiento_at,
            "created_at": r.created_at,
        })
    return out, int(total)
