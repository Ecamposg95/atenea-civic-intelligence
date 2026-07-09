"""Scrum service — sprints, backlog work items, tasks, and the acuerdo→WorkItem
bridge. One ACTIVO sprint per campaign. Governance (backlog/sprint CRUD) is
COORDINADOR/ADMIN; card moves + task toggles are allowed for the item's
responsable (or a coordinator). Mirrors minuta_service scoping/audit.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.scrum import Sprint
from app.models.user import UserRole
from app.schemas.scrum import SprintCreate, SprintUpdate
from app.services.audit_service import record_audit


class SprintActivoExiste(Exception):
    """Raised when activating a sprint while another is already ACTIVO."""


def _is_coordinator(ctx: CampaignContext) -> bool:
    return ctx.is_superadmin or ctx.role in (UserRole.ADMIN, UserRole.COORDINADOR)


def active_sprint(db: Session, ctx: CampaignContext) -> Optional[Sprint]:
    return db.execute(
        scoped_query(Sprint, ctx).where(Sprint.estado == "ACTIVO")
    ).scalars().first()


def create_sprint(db: Session, ctx: CampaignContext, data: SprintCreate) -> Sprint:
    if data.estado == "ACTIVO":
        existing = active_sprint(db, ctx)
        if existing is not None:
            raise SprintActivoExiste()
    s = Sprint(organization_id=ctx.organization_id, campaign_id=ctx.campaign_id,
               nombre=data.nombre, objetivo=data.objetivo,
               fecha_inicio=data.fecha_inicio, fecha_fin=data.fecha_fin,
               estado=data.estado, created_by=ctx.user.id)
    db.add(s)
    record_audit(db, action="sprint.create", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="sprint",
                 entity_id=s.id, meta={"nombre": s.nombre})
    db.flush()
    return s


def list_sprints(db: Session, ctx: CampaignContext, *, estado=None,
                 limit=50, offset=0) -> tuple[list[Sprint], int]:
    stmt = scoped_query(Sprint, ctx)
    if estado:
        stmt = stmt.where(Sprint.estado == estado)
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = list(db.execute(
        stmt.order_by(Sprint.fecha_inicio.desc()).limit(limit).offset(offset)
    ).scalars().all())
    return rows, total


def get_sprint(db: Session, ctx: CampaignContext, sid: str) -> Optional[Sprint]:
    return db.execute(scoped_query(Sprint, ctx).where(Sprint.id == sid)).scalar_one_or_none()


def update_sprint(db: Session, ctx: CampaignContext, sid: str,
                  data: SprintUpdate) -> Optional[Sprint]:
    s = get_sprint(db, ctx, sid)
    if s is None:
        return None
    updates = data.model_dump(exclude_unset=True)
    if updates.get("estado") == "ACTIVO" and s.estado != "ACTIVO":
        existing = active_sprint(db, ctx)
        if existing is not None and existing.id != s.id:
            raise SprintActivoExiste()
    for k, v in updates.items():
        setattr(s, k, v)
    s.updated_by = ctx.user.id
    record_audit(db, action="sprint.update", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="sprint",
                 entity_id=s.id, meta=None)
    db.flush()
    return s


def delete_sprint(db: Session, ctx: CampaignContext, sid: str) -> bool:
    s = get_sprint(db, ctx, sid)
    if s is None:
        return False
    s.deleted_at = datetime.now(timezone.utc)
    s.updated_by = ctx.user.id
    record_audit(db, action="sprint.delete", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="sprint",
                 entity_id=s.id, meta=None)
    db.flush()
    return True


def activar_sprint(db: Session, ctx: CampaignContext, sid: str) -> Optional[Sprint]:
    s = get_sprint(db, ctx, sid)
    if s is None:
        return None
    existing = active_sprint(db, ctx)
    if existing is not None and existing.id != s.id:
        raise SprintActivoExiste()
    s.estado = "ACTIVO"
    s.updated_by = ctx.user.id
    record_audit(db, action="sprint.activar", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="sprint",
                 entity_id=s.id, meta=None)
    db.flush()
    return s


def cerrar_sprint(db: Session, ctx: CampaignContext, sid: str) -> Optional[Sprint]:
    s = get_sprint(db, ctx, sid)
    if s is None:
        return None
    s.estado = "CERRADO"
    s.updated_by = ctx.user.id
    record_audit(db, action="sprint.cerrar", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="sprint",
                 entity_id=s.id, meta=None)
    db.flush()
    return s
