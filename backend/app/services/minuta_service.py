"""Minuta service — meeting minutes + action items.

Mirrors caso_service for scoping/audit. COORDINADOR is campaign-wide;
LIDER/ACTIVISTA are hierarchy/ownership scoped. A PUBLICADA minuta is
campaign-wide READABLE by everyone, but frozen for non-coordinators on
mutation — see ``_minuta_role_scoped`` (reads) vs ``_minuta_mutate_scoped``
(update/delete row-fetch) below.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.minuta import Acuerdo, Minuta
from app.models.user import User, UserRole
from app.schemas.minuta import MinutaCreate, MinutaUpdate
from app.services.audit_service import record_audit


class PublishedLockError(Exception):
    """Raised when a non-coordinator edits a PUBLICADA minuta (any field)."""


def _is_coordinator(ctx: CampaignContext) -> bool:
    return ctx.is_superadmin or ctx.role in (UserRole.ADMIN, UserRole.COORDINADOR)


def _minuta_role_scoped(ctx: CampaignContext):
    """READ scope. COORDINADOR/ADMIN → whole campaign. LIDER → own team's
    minutas (created by self or a supervised activista). ACTIVISTA → own only.

    A PUBLICADA minuta is additionally visible campaign-wide to everyone: once
    published it is the campaign's official record, not a private draft — the
    publish-lock in ``update_minuta`` (all fields frozen for non-coordinators)
    is what keeps that campaign-wide visibility safe. BORRADOR minutas stay
    hierarchy/ownership-scoped as private drafts.

    NOTE: this helper is READ-ONLY scope. It must never be used to fetch the
    row for update/delete — use ``_minuta_mutate_scoped`` for those, which
    does not carry the published-campaign-wide broadening.
    """
    if _is_coordinator(ctx):
        return scoped_query(Minuta, ctx)
    published = Minuta.estado == "PUBLICADA"
    if ctx.role == UserRole.LIDER:
        activistas = select(User.id).where(User.lider_id == ctx.user.id)
        own = or_(Minuta.created_by == ctx.user.id, Minuta.created_by.in_(activistas))
        return scoped_query(Minuta, ctx).where(or_(own, published))
    if ctx.role in (UserRole.ACTIVISTA, UserRole.CAPTURISTA):
        return scoped_query(Minuta, ctx).where(
            or_(Minuta.created_by == ctx.user.id, published))
    return scoped_query(Minuta, ctx).where(sa.false())


def _minuta_mutate_scoped(ctx: CampaignContext):
    """MUTATE scope, used only by ``update_minuta``/``delete_minuta`` to fetch
    the row. Deliberately narrower than ``_minuta_role_scoped``: no
    published-campaign-wide broadening, so a non-owner/non-coordinator can
    never reach another user's minuta to edit or delete it — regardless of
    its estado. COORDINADOR/ADMIN keep whole-campaign scope.
    """
    if _is_coordinator(ctx):
        return scoped_query(Minuta, ctx)
    if ctx.role == UserRole.LIDER:
        activistas = select(User.id).where(User.lider_id == ctx.user.id)
        own = or_(Minuta.created_by == ctx.user.id, Minuta.created_by.in_(activistas))
        return scoped_query(Minuta, ctx).where(own)
    if ctx.role in (UserRole.ACTIVISTA, UserRole.CAPTURISTA):
        return scoped_query(Minuta, ctx).where(Minuta.created_by == ctx.user.id)
    return scoped_query(Minuta, ctx).where(sa.false())


def enrich_acuerdos(db: Session, minuta: Minuta) -> None:
    """Attach responsable_nombre to each acuerdo + acuerdos_pendientes count."""
    acuerdos = list(db.execute(
        select(Acuerdo).where(Acuerdo.minuta_id == minuta.id,
                              Acuerdo.deleted_at.is_(None))
        .order_by(Acuerdo.orden, Acuerdo.created_at)
    ).scalars().all())
    ids = {a.responsable_id for a in acuerdos if a.responsable_id}
    names: dict[str, str] = {}
    if ids:
        for uid, fname in db.execute(
                select(User.id, User.full_name).where(User.id.in_(ids))).all():
            names[uid] = fname
    for a in acuerdos:
        a.responsable_nombre = names.get(a.responsable_id)
    minuta.acuerdos = acuerdos
    minuta.acuerdos_pendientes = sum(
        1 for a in acuerdos if a.estado in ("PENDIENTE", "EN_CURSO"))


def create_minuta(db: Session, ctx: CampaignContext, data: MinutaCreate) -> Minuta:
    m = Minuta(
        organization_id=ctx.organization_id, campaign_id=ctx.campaign_id,
        titulo=data.titulo, fecha=data.fecha, lugar=data.lugar,
        tipo=data.tipo, estado=data.estado,
        asistentes=[a.model_dump() for a in data.asistentes],
        cuerpo=data.cuerpo, area_id=data.area_id, created_by=ctx.user.id,
    )
    db.add(m)
    db.flush()
    for i, ac in enumerate(data.acuerdos):
        db.add(Acuerdo(
            organization_id=ctx.organization_id, campaign_id=ctx.campaign_id,
            minuta_id=m.id, texto=ac.texto, orden=ac.orden or i,
            responsable_id=ac.responsable_id, fecha_limite=ac.fecha_limite,
            estado="PENDIENTE", created_by=ctx.user.id,
        ))
    record_audit(db, action="minuta.create", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="minuta",
                 entity_id=m.id, meta={"acuerdos": len(data.acuerdos)})
    db.flush()
    enrich_acuerdos(db, m)
    return m


def list_minutas(db: Session, ctx: CampaignContext, *, tipo=None, estado=None,
                 desde: Optional[date] = None, hasta: Optional[date] = None,
                 limit=50, offset=0) -> tuple[list[Minuta], int]:
    stmt = _minuta_role_scoped(ctx)
    if tipo:
        stmt = stmt.where(Minuta.tipo == tipo)
    if estado:
        stmt = stmt.where(Minuta.estado == estado)
    if desde:
        stmt = stmt.where(Minuta.fecha >= desde)
    if hasta:
        stmt = stmt.where(Minuta.fecha <= hasta)
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    ordered = stmt.order_by(Minuta.fecha.desc(), Minuta.created_at.desc())
    rows = list(db.execute(ordered.limit(limit).offset(offset)).scalars().all())
    for m in rows:
        enrich_acuerdos(db, m)
    return rows, total


def get_minuta(db: Session, ctx: CampaignContext, mid: str) -> Optional[Minuta]:
    m = db.execute(_minuta_role_scoped(ctx).where(Minuta.id == mid)).scalar_one_or_none()
    if m is not None:
        enrich_acuerdos(db, m)
    return m


def update_minuta(db: Session, ctx: CampaignContext, mid: str,
                  data: MinutaUpdate) -> Optional[Minuta]:
    m = db.execute(_minuta_mutate_scoped(ctx).where(Minuta.id == mid)).scalar_one_or_none()
    if m is None:
        return None
    fields = data.model_dump(exclude_unset=True)
    # PUBLICADA freezes ALL fields for non-coordinators — including reverting
    # estado back to BORRADOR. Coordinador/admin may still edit freely.
    if m.estado == "PUBLICADA" and not _is_coordinator(ctx) and fields:
        raise PublishedLockError()
    for k, v in fields.items():
        setattr(m, k, v)
    m.updated_by = ctx.user.id
    record_audit(db, action="minuta.update", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="minuta",
                 entity_id=m.id, meta={"fields": list(fields.keys())})
    db.flush()
    enrich_acuerdos(db, m)
    return m


def delete_minuta(db: Session, ctx: CampaignContext, mid: str) -> bool:
    m = db.execute(_minuta_mutate_scoped(ctx).where(Minuta.id == mid)).scalar_one_or_none()
    if m is None:
        return False
    m.deleted_at = datetime.now(timezone.utc)
    m.updated_by = ctx.user.id
    record_audit(db, action="minuta.delete", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="minuta",
                 entity_id=m.id, meta=None)
    db.flush()
    return True
