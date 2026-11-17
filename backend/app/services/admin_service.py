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
from app.models.user import User, UserRole
from app.core import crypto
from app.services import registro_service
from app.services.audit_service import record_audit
from app.services.registro_service import _role_scoped


class NoClave(Exception):
    """Raised when a registro has no stored clave de elector to reveal."""


def reveal_clave(db: Session, ctx: CampaignContext, registro_id: str) -> Optional[str]:
    """Decrypt the clave de elector. ALWAYS audits on successful reveal.

    Admin/superadmin gate lives at the router layer.
    Returns the plaintext, or None if the registro is out of scope (router → 404).
    Raises NoClave (router → 422) when there is no ciphertext stored.
    Decision: only successful reveals are audited; missed/out-of-scope lookups
    are not audited (brief is silent; the get_registro access-control layer
    is the correct enforcement point).
    """
    reg = registro_service.get_registro(db, ctx, registro_id)
    if reg is None:
        return None
    if not reg.clave_elector_enc:
        raise NoClave()
    plain = crypto.decrypt_clave(bytes(reg.clave_elector_enc))
    record_audit(
        db,
        action="registro.reveal_clave",
        actor_id=ctx.user.id,
        organization_id=reg.organization_id,
        entity_type="registro",
        entity_id=reg.id,
    )
    db.commit()
    return plain


def reveal_curp(db: Session, ctx: CampaignContext, registro_id: str) -> Optional[str]:
    """Decrypt the CURP if stored (None otherwise). Audits registro.reveal_curp
    on successful reveal only, like reveal_clave."""
    reg = registro_service.get_registro(db, ctx, registro_id)
    if reg is None or not reg.curp_enc:
        return None
    plain = crypto.decrypt_curp(bytes(reg.curp_enc))
    record_audit(
        db,
        action="registro.reveal_curp",
        actor_id=ctx.user.id,
        organization_id=reg.organization_id,
        entity_type="registro",
        entity_id=reg.id,
    )
    db.commit()
    return plain


def reveal_claves(db: Session, ctx: CampaignContext, registro_ids: list[str]) -> dict[str, str]:
    """Batch reveal. For each in-scope registro that has a stored clave, decrypt it
    and write ONE audit row per revealed registro (registro.reveal_clave,
    meta={"batch": True}). Registros that are out of scope or have no clave are
    silently skipped (not errors). Returns {registro_id: clave_plaintext} only
    for successfully revealed ones. Single db.commit() at the end.
    """
    claves: dict[str, str] = {}
    for rid in dict.fromkeys(registro_ids):  # dedupe, preserve order
        reg = registro_service.get_registro(db, ctx, rid)
        if reg is None or not reg.clave_elector_enc:
            continue
        plain = crypto.decrypt_clave(bytes(reg.clave_elector_enc))
        record_audit(
            db,
            action="registro.reveal_clave",
            actor_id=ctx.user.id,
            organization_id=reg.organization_id,
            entity_type="registro",
            entity_id=reg.id,
            meta={"batch": True},
        )
        claves[reg.id] = plain
    db.commit()
    return claves


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


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def _por_lider(db: Session, reg, act):
    """Bucket registros by lider, joining a second User alias for lider name."""
    lid = aliased(User)
    rows = db.execute(
        select(act.lider_id, lid.full_name, func.count())
        .select_from(reg)
        .outerjoin(act, act.id == reg.activista_id)
        .outerjoin(lid, lid.id == act.lider_id)
        .group_by(act.lider_id, lid.full_name)
        .order_by(func.count().desc())
    ).all()
    return [
        {"label": lname or "Sin líder", "count": int(n)}
        for _, lname, n in rows
    ]


def metrics(db: Session, ctx: CampaignContext) -> dict:
    """Return aggregate metrics for the admin console.

    Respects role/tenant scope identically to list_admin_registros.
    Returns a dict compatible with MetricsRead schema:
      total, by_seccion, by_activista, by_day.
    """
    base = _role_scoped(ctx).subquery()
    reg = aliased(Registro, base)
    act = aliased(User)

    total = db.execute(
        select(func.count()).select_from(reg)
    ).scalar_one()

    by_activista = [
        {"label": name or rid or "—", "count": int(n)}
        for rid, name, n in db.execute(
            select(reg.activista_id, act.full_name, func.count())
            .select_from(reg)
            .outerjoin(act, act.id == reg.activista_id)
            .group_by(reg.activista_id, act.full_name)
            .order_by(func.count().desc())
        ).all()
    ]

    by_seccion = [
        {"label": s or "Sin sección", "count": int(n)}
        for s, n in db.execute(
            select(reg.seccion, func.count())
            .select_from(reg)
            .group_by(reg.seccion)
            .order_by(func.count().desc())
        ).all()
    ]

    by_day = [
        {"date": str(d), "count": int(n)}
        for d, n in db.execute(
            select(func.date(reg.created_at), func.count())
            .select_from(reg)
            .group_by(func.date(reg.created_at))
            .order_by(func.date(reg.created_at))
        ).all()
    ]

    by_lider = _por_lider(db, reg, act)

    return {
        "total": int(total),
        "by_seccion": by_seccion,
        "by_activista": by_activista,
        "by_lider": by_lider,
        "by_day": by_day,
    }


# ---------------------------------------------------------------------------
# Estructura (árbol líder → activistas)
# ---------------------------------------------------------------------------

def estructura(db: Session, ctx: CampaignContext) -> list[dict]:
    """Return the organizational tree: each líder with their activistas and counts.

    Counts come from role-scoped registros; the tree membership (which users
    appear) is tenant-scoped by organization_id. For a LIDER context, only
    their own subtree is returned.
    """
    # Count registros per activista within scope
    base = _role_scoped(ctx).subquery()
    reg = aliased(Registro, base)
    counts: dict = dict(
        db.execute(
            select(reg.activista_id, func.count())
            .select_from(reg)
            .group_by(reg.activista_id)
        ).all()
    )

    # Query lideres visible to this context
    lideres_q = select(User).where(
        User.role == UserRole.LIDER,
        User.deleted_at.is_(None),
    )
    if ctx.organization_id is not None:
        lideres_q = lideres_q.where(User.organization_id == ctx.organization_id)
    if ctx.role == UserRole.LIDER and not ctx.is_superadmin:
        lideres_q = lideres_q.where(User.id == ctx.user.id)
    lideres = db.execute(lideres_q).scalars().all()

    tree: list[dict] = []
    for lider in lideres:
        acts_q = select(User).where(
            User.lider_id == lider.id,
            User.deleted_at.is_(None),
        )
        # In single-tenant mode, guard against stale cross-tenant lider_id
        # references that could surface another org's activistas.
        if ctx.organization_id is not None:
            acts_q = acts_q.where(User.organization_id == ctx.organization_id)
        acts = db.execute(acts_q).scalars().all()
        act_nodes = [
            {
                "id": a.id,
                "full_name": a.full_name,
                "email": a.email,
                "seccion": a.seccion,
                "count": int(counts.get(a.id, 0)),
            }
            for a in acts
        ]
        # Rollup = activistas' captures + any registros the líder captured directly
        node_total = sum(a["count"] for a in act_nodes) + int(counts.get(lider.id, 0))
        tree.append({
            "id": lider.id,
            "full_name": lider.full_name,
            "email": lider.email,
            "seccion": lider.seccion,
            "total": node_total,
            "activistas": act_nodes,
        })
    return tree
