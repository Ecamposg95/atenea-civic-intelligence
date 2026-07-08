"""Registro service — capture CRUD with encryption, consent, idempotency, audit."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import crypto
from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.registro import Registro
from app.models.user import User, UserRole
from app.schemas.registro import RegistroCreate, RegistroUpdate
from app.services.audit_service import record_audit
from app.services import privacy_service


class ConsentRequired(Exception):
    """Raised when a registro is created/updated without consentimiento=True."""


# Re-export so callers can catch this from registro_service directly.
NoActiveNotice = privacy_service.NoActiveNotice


def _role_scoped(ctx: CampaignContext):
    """Base SELECT for registros, filtered by tenant/campaign AND role scope."""
    stmt = scoped_query(Registro, ctx)
    if ctx.is_superadmin:
        return stmt
    role = ctx.role
    if role == UserRole.ADMIN:
        return stmt
    if role == UserRole.COORDINADOR:
        # Campaign executive: the coordinador runs the campaign and sees ALL of
        # its registros (tenant isolation stays enforced by scoped_query above).
        # LIDER and below remain hierarchy-scoped.
        return stmt
    if role == UserRole.LIDER:
        sub = select(User.id).where(User.lider_id == ctx.user.id)
        return stmt.where(or_(Registro.activista_id.in_(sub),
                              Registro.activista_id == ctx.user.id))
    if role in (UserRole.ACTIVISTA, UserRole.CAPTURISTA):
        return stmt.where(Registro.activista_id == ctx.user.id)
    # ANALYST / VIEWER / CONSULTA / cualquier otro: sin registros granulares.
    # Defense-in-depth: the router's CapturaCtx guard blocks them first.
    return stmt.where(sa.false())


def create_registro(db: Session, ctx: CampaignContext, data: RegistroCreate) -> Registro:
    if not data.consentimiento:
        raise ConsentRequired()

    # Idempotency: reuse an existing row with the same (campaign, client_uuid, owner).
    # Deliberately routed through _role_scoped so that an ACTIVISTA's lookup is
    # restricted to their own rows — activista-B's client_uuid must never match
    # activista-A's registro (Fix 3: owner-scoped idempotency).
    if data.client_uuid:
        existing = db.execute(
            _role_scoped(ctx).where(Registro.client_uuid == data.client_uuid)
        ).scalar_one_or_none()
        if existing is not None:
            # Idempotent path: return the existing row without creating a duplicate acceptance.
            return existing

    # Resolve the active privacy notice — raises NoActiveNotice if none found.
    notice = privacy_service.get_active_notice(db, ctx)

    clave_enc = crypto.encrypt_clave(data.clave_elector) if data.clave_elector else None
    clave_masked = crypto.mask_clave(data.clave_elector) if data.clave_elector else None

    reg = Registro(
        organization_id=ctx.organization_id,
        campaign_id=ctx.campaign_id,
        activista_id=ctx.user.id,
        nombre_completo=data.nombre_completo,
        seccion=data.seccion,
        direccion=data.direccion,
        colonia=data.colonia,
        telefono=data.telefono,
        area=data.area,
        sexo=data.sexo,
        edad=data.edad,
        estructura=data.estructura,
        observacion=data.observacion,
        clave_elector_enc=clave_enc,
        clave_masked=clave_masked,
        consentimiento=True,
        consentimiento_at=datetime.now(timezone.utc),
        aviso_version=notice.version,
        client_uuid=data.client_uuid,
        lat=data.lat,
        lng=data.lng,
        created_by=ctx.user.id,
    )
    db.add(reg)
    db.flush()
    record_audit(
        db,
        action="registro.create",
        actor_id=ctx.user.id,
        organization_id=ctx.organization_id,
        entity_type="registro",
        entity_id=reg.id,
    )
    privacy_service.record_acceptance(db, ctx, reg, notice)
    db.commit()
    db.refresh(reg)
    return reg


def list_registros(
    db: Session, ctx: CampaignContext, q: Optional[str],
    limit: int, offset: int, scope: str = "team",
) -> tuple[list[Registro], int]:
    stmt = _role_scoped(ctx)
    if scope == "mine":
        stmt = stmt.where(Registro.activista_id == ctx.user.id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(Registro.nombre_completo.ilike(like), Registro.seccion.ilike(like))
        )
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = (
        db.execute(
            stmt.order_by(Registro.created_at.desc()).limit(limit).offset(offset)
        )
        .scalars()
        .all()
    )
    rows = list(rows)
    # Resolve capturer names in one query (no N+1). activista_nombre is a
    # transient attribute read by RegistroRead (from_attributes); never mapped.
    ids = {r.activista_id for r in rows if r.activista_id}
    names: dict[str, str] = {}
    if ids:
        for uid, fname in db.execute(
            select(User.id, User.full_name).where(User.id.in_(ids))
        ).all():
            names[uid] = fname
    for r in rows:
        r.activista_nombre = names.get(r.activista_id)
    return rows, total


def get_registro(
    db: Session, ctx: CampaignContext, registro_id: str
) -> Optional[Registro]:
    return db.execute(
        _role_scoped(ctx).where(Registro.id == registro_id)
    ).scalar_one_or_none()


def update_registro(
    db: Session, ctx: CampaignContext, registro_id: str, data: RegistroUpdate
) -> Optional[Registro]:
    reg = get_registro(db, ctx, registro_id)
    if reg is None:
        return None
    if data.consentimiento is False:
        raise ConsentRequired()
    fields = data.model_dump(exclude_unset=True)
    if "clave_elector" in fields:
        clave = fields.pop("clave_elector")
        reg.clave_elector_enc = crypto.encrypt_clave(clave) if clave else None
        reg.clave_masked = crypto.mask_clave(clave) if clave else None
    fields.pop("consentimiento", None)
    for k, v in fields.items():
        setattr(reg, k, v)
    reg.updated_by = ctx.user.id
    db.flush()
    record_audit(
        db,
        action="registro.update",
        actor_id=ctx.user.id,
        organization_id=ctx.organization_id,
        entity_type="registro",
        entity_id=reg.id,
    )
    db.commit()
    db.refresh(reg)
    return reg


def delete_registro(db: Session, ctx: CampaignContext, registro_id: str) -> bool:
    reg = get_registro(db, ctx, registro_id)
    if reg is None:
        return False
    reg.deleted_at = datetime.now(timezone.utc)
    reg.updated_by = ctx.user.id
    db.flush()
    record_audit(
        db,
        action="registro.delete",
        actor_id=ctx.user.id,
        organization_id=ctx.organization_id,
        entity_type="registro",
        entity_id=reg.id,
    )
    db.commit()
    return True
