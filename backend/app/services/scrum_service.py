"""Scrum service — sprints, backlog work items, tasks, and the acuerdo→WorkItem
bridge. One ACTIVO sprint per campaign. Governance (backlog/sprint CRUD) is
COORDINADOR/ADMIN; card moves + task toggles are allowed for the item's
responsable (or a coordinator). Mirrors minuta_service scoping/audit.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.scrum import Sprint, WorkItem, WorkItemTask
from app.models.user import User, UserRole
from app.schemas.scrum import (
    SprintCreate, SprintUpdate, TaskCreate, TaskUpdate, WorkItemCreate, WorkItemUpdate,
)
from app.services import minuta_service
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
    db.flush()
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


class NoAutorizado(Exception):
    """Raised when a non-owner non-coordinator tries to move a card/toggle a task."""


def enrich_workitem(db: Session, wi: WorkItem) -> None:
    tareas = list(db.execute(
        select(WorkItemTask).where(WorkItemTask.work_item_id == wi.id,
                                   WorkItemTask.deleted_at.is_(None))
        .order_by(WorkItemTask.orden, WorkItemTask.created_at)
    ).scalars().all())
    ids = {t.responsable_id for t in tareas if t.responsable_id}
    if wi.responsable_id:
        ids.add(wi.responsable_id)
    names: dict[str, str] = {}
    if ids:
        for uid, fname in db.execute(
                select(User.id, User.full_name).where(
                    User.id.in_(ids), User.organization_id == wi.organization_id)).all():
            names[uid] = fname
    for t in tareas:
        t.responsable_nombre = names.get(t.responsable_id)
    wi.responsable_nombre = names.get(wi.responsable_id)
    wi.tareas = tareas
    wi.tareas_total = len(tareas)
    wi.tareas_hechas = sum(1 for t in tareas if t.done)


def create_workitem(db: Session, ctx: CampaignContext, data: WorkItemCreate) -> WorkItem:
    wi = WorkItem(organization_id=ctx.organization_id, campaign_id=ctx.campaign_id,
                  titulo=data.titulo, descripcion=data.descripcion, tipo=data.tipo,
                  story_points=data.story_points, estado="POR_HACER",
                  prioridad=data.prioridad, orden=data.orden, sprint_id=data.sprint_id,
                  responsable_id=data.responsable_id, created_by=ctx.user.id)
    db.add(wi)
    db.flush()
    record_audit(db, action="workitem.create", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="workitem",
                 entity_id=wi.id, meta={"tipo": wi.tipo})
    db.flush()
    enrich_workitem(db, wi)
    return wi


def list_workitems(db: Session, ctx: CampaignContext, *, sprint_id=None, estado=None,
                   responsable_id=None, tipo=None, q=None, limit=50, offset=0):
    stmt = scoped_query(WorkItem, ctx)
    if sprint_id is not None:
        stmt = stmt.where(WorkItem.sprint_id == sprint_id)
    if estado:
        stmt = stmt.where(WorkItem.estado == estado)
    if responsable_id:
        stmt = stmt.where(WorkItem.responsable_id == responsable_id)
    if tipo:
        stmt = stmt.where(WorkItem.tipo == tipo)
    if q:
        stmt = stmt.where(WorkItem.titulo.ilike(f"%{q}%"))
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = list(db.execute(
        stmt.order_by(WorkItem.orden, WorkItem.created_at.desc()).limit(limit).offset(offset)
    ).scalars().all())
    for wi in rows:
        enrich_workitem(db, wi)
    return rows, total


def get_workitem(db: Session, ctx: CampaignContext, wid: str) -> Optional[WorkItem]:
    wi = db.execute(scoped_query(WorkItem, ctx).where(WorkItem.id == wid)).scalar_one_or_none()
    if wi is not None:
        enrich_workitem(db, wi)
    return wi


def update_workitem(db: Session, ctx: CampaignContext, wid: str,
                    data: WorkItemUpdate) -> Optional[WorkItem]:
    wi = db.execute(scoped_query(WorkItem, ctx).where(WorkItem.id == wid)).scalar_one_or_none()
    if wi is None:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(wi, k, v)
    wi.updated_by = ctx.user.id
    record_audit(db, action="workitem.update", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="workitem",
                 entity_id=wi.id, meta=None)
    db.flush()
    enrich_workitem(db, wi)
    return wi


def mover_estado(db: Session, ctx: CampaignContext, wid: str, estado: str) -> Optional[WorkItem]:
    wi = db.execute(scoped_query(WorkItem, ctx).where(WorkItem.id == wid)).scalar_one_or_none()
    if wi is None:
        return None
    if not _is_coordinator(ctx) and wi.responsable_id != ctx.user.id:
        raise NoAutorizado()
    prev = wi.estado
    wi.estado = estado
    if estado == "HECHO" and prev != "HECHO":
        wi.completed_at = datetime.now(timezone.utc)
    elif estado != "HECHO":
        wi.completed_at = None
    wi.updated_by = ctx.user.id
    record_audit(db, action="workitem.mover", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="workitem",
                 entity_id=wi.id, meta={"de": prev, "a": estado})
    db.flush()
    enrich_workitem(db, wi)
    return wi


def delete_workitem(db: Session, ctx: CampaignContext, wid: str) -> bool:
    wi = db.execute(scoped_query(WorkItem, ctx).where(WorkItem.id == wid)).scalar_one_or_none()
    if wi is None:
        return False
    wi.deleted_at = datetime.now(timezone.utc)
    wi.updated_by = ctx.user.id
    record_audit(db, action="workitem.delete", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="workitem",
                 entity_id=wi.id, meta=None)
    db.flush()
    return True


def board(db: Session, ctx: CampaignContext) -> dict:
    s = active_sprint(db, ctx)
    cols: dict = {"sprint": s, "POR_HACER": [], "EN_CURSO": [], "HECHO": []}
    if s is None:
        return cols
    rows = list(db.execute(
        scoped_query(WorkItem, ctx).where(WorkItem.sprint_id == s.id)
        .order_by(WorkItem.orden, WorkItem.created_at)
    ).scalars().all())
    for wi in rows:
        enrich_workitem(db, wi)
        if wi.estado in cols:
            cols[wi.estado].append(wi)
    return cols


class YaConvertido(Exception):
    """Raised when converting an acuerdo that already has a work_item_id."""


def _task_in_scope(db: Session, ctx: CampaignContext, wid: str, tid: str) -> Optional[WorkItemTask]:
    wi = db.execute(scoped_query(WorkItem, ctx).where(WorkItem.id == wid)).scalar_one_or_none()
    if wi is None:
        return None
    return db.execute(
        scoped_query(WorkItemTask, ctx).where(
            WorkItemTask.id == tid, WorkItemTask.work_item_id == wid)
    ).scalar_one_or_none()


def add_task(db: Session, ctx: CampaignContext, wid: str, data: TaskCreate) -> Optional[WorkItemTask]:
    wi = db.execute(scoped_query(WorkItem, ctx).where(WorkItem.id == wid)).scalar_one_or_none()
    if wi is None:
        return None
    t = WorkItemTask(organization_id=wi.organization_id, campaign_id=wi.campaign_id,
                     work_item_id=wi.id, texto=data.texto, done=False,
                     orden=data.orden, responsable_id=data.responsable_id,
                     created_by=ctx.user.id)
    db.add(t)
    db.flush()
    record_audit(db, action="task.create", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="task",
                 entity_id=t.id, meta={"work_item_id": wi.id})
    db.flush()
    return t


def update_task(db: Session, ctx: CampaignContext, wid: str, tid: str,
                data: TaskUpdate) -> Optional[WorkItemTask]:
    t = _task_in_scope(db, ctx, wid, tid)
    if t is None:
        return None
    if not _is_coordinator(ctx):
        wi = db.execute(scoped_query(WorkItem, ctx).where(WorkItem.id == wid)).scalar_one_or_none()
        owner = ctx.user.id in (t.responsable_id, (wi.responsable_id if wi else None))
        if not owner:
            raise NoAutorizado()
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    t.updated_by = ctx.user.id
    record_audit(db, action="task.update", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="task",
                 entity_id=t.id, meta={"done": t.done})
    db.flush()
    return t


def delete_task(db: Session, ctx: CampaignContext, wid: str, tid: str) -> bool:
    t = _task_in_scope(db, ctx, wid, tid)
    if t is None:
        return False
    t.deleted_at = datetime.now(timezone.utc)
    t.updated_by = ctx.user.id
    record_audit(db, action="task.delete", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="task",
                 entity_id=t.id, meta=None)
    db.flush()
    return True


def convertir_acuerdo(db: Session, ctx: CampaignContext, mid: str, aid: str) -> Optional[WorkItem]:
    # Reuse module A's mutate-scope gate on the acuerdo (actor must be able to
    # write it); None → 404 at the router.
    ac = minuta_service._acuerdo_in_scope(db, ctx, mid, aid)
    if ac is None:
        return None
    if ac.work_item_id:
        raise YaConvertido()
    wi = WorkItem(organization_id=ac.organization_id, campaign_id=ac.campaign_id,
                  titulo=ac.texto[:255], tipo="HISTORIA", estado="POR_HACER",
                  prioridad="MEDIA", orden=0, responsable_id=ac.responsable_id,
                  origin_acuerdo_id=ac.id, created_by=ctx.user.id)
    db.add(wi)
    db.flush()
    ac.work_item_id = wi.id
    ac.updated_by = ctx.user.id
    record_audit(db, action="acuerdo.convertir", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="workitem",
                 entity_id=wi.id, meta={"acuerdo_id": ac.id})
    db.flush()
    enrich_workitem(db, wi)
    return wi


def _sprint_items(db: Session, ctx: CampaignContext, sid: str) -> list[WorkItem]:
    return list(db.execute(
        scoped_query(WorkItem, ctx).where(WorkItem.sprint_id == sid)
    ).scalars().all())


def sprint_metrics(db: Session, ctx: CampaignContext, sid: str) -> Optional[dict]:
    s = db.execute(scoped_query(Sprint, ctx).where(Sprint.id == sid)).scalar_one_or_none()
    if s is None:
        return None
    items = _sprint_items(db, ctx, sid)
    def pts(i):
        return i.story_points or 0
    por_estado = {"POR_HACER": 0, "EN_CURSO": 0, "HECHO": 0}
    for i in items:
        if i.estado in por_estado:
            por_estado[i.estado] += 1
    return {
        "comprometido": sum(pts(i) for i in items),
        "completado": sum(pts(i) for i in items if i.estado == "HECHO"),
        "historias_total": len(items),
        "historias_hechas": sum(1 for i in items if i.estado == "HECHO"),
        "por_estado": por_estado,
        "sin_estimar": sum(1 for i in items if i.story_points is None),
    }


def velocidad(db: Session, ctx: CampaignContext, n: int = 6) -> list[dict]:
    sprints = list(db.execute(
        scoped_query(Sprint, ctx).where(Sprint.estado == "CERRADO")
        .order_by(Sprint.fecha_fin.desc()).limit(n)
    ).scalars().all())
    out = []
    for s in sprints:
        items = _sprint_items(db, ctx, s.id)
        out.append({
            "sprint_id": s.id, "nombre": s.nombre, "fecha_fin": s.fecha_fin,
            "velocidad": sum((i.story_points or 0) for i in items if i.estado == "HECHO"),
        })
    return out


def burndown(db: Session, ctx: CampaignContext, sid: str) -> Optional[dict]:
    s = db.execute(scoped_query(Sprint, ctx).where(Sprint.id == sid)).scalar_one_or_none()
    if s is None:
        return None
    items = _sprint_items(db, ctx, sid)
    total = sum((i.story_points or 0) for i in items)
    dias = (s.fecha_fin - s.fecha_inicio).days
    n = max(dias, 0) + 1                      # inclusive
    serie = []
    for k in range(n):
        d = s.fecha_inicio + timedelta(days=k)
        completado = sum(
            (i.story_points or 0) for i in items
            if i.estado == "HECHO" and i.completed_at is not None
            and i.completed_at.date() <= d
        )
        ideal = round(total * (1 - k / (n - 1))) if n > 1 else 0
        serie.append({"fecha": d, "restante": total - completado, "ideal": ideal})
    return {"total_puntos": total, "dias": serie}
