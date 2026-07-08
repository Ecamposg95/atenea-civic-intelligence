"""Operación territorial — plan operativo por sección (electoral context +
live avance) + agenda 30/60/90. Campaign-scoped."""
from __future__ import annotations

from collections import Counter
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.dependencies import CampaignContext
from app.models.operacion import AgendaItem, SeccionPlan
from app.models.registro import Registro
from app.models.seccion_electoral import SeccionElectoral
from app.models.user import User

_ANIO = 2024
_PERSUADIBLE_UMBRAL = 150

# Suggested weekly promovidos target by the section's electoral priority —
# persuadible/competitiva sections get the highest target (invest where it moves).
_META_POR_PRIORIDAD = {
    "ALTA_PERSUADIBLE": 30,
    "COMPETITIVA": 25,
    "DEFENDER_EXPANDIR": 20,
    "RECUPERAR_OPOSICION": 15,
}
_META_DEFAULT = 15


def suggest_meta(prioridad: Optional[str]) -> int:
    return _META_POR_PRIORIDAD.get(prioridad or "", _META_DEFAULT)


def _avance_por_seccion(db: Session, ctx: CampaignContext) -> dict[str, int]:
    rows = db.execute(
        select(Registro.seccion, func.count())
        .where(
            Registro.campaign_id == ctx.campaign_id,
            Registro.organization_id == ctx.organization_id,
            Registro.deleted_at.is_(None),
        )
        .group_by(Registro.seccion)
    ).all()
    return {s: n for s, n in rows if s}


def list_planes(db: Session, ctx: CampaignContext) -> list[dict]:
    secciones = db.execute(
        select(SeccionElectoral)
        .where(SeccionElectoral.anio == _ANIO)
        .order_by(SeccionElectoral.margen)
    ).scalars().all()

    planes = {p.seccion: p for p in db.execute(
        select(SeccionPlan).where(
            SeccionPlan.campaign_id == ctx.campaign_id,
            SeccionPlan.deleted_at.is_(None),
        )).scalars()}

    avance = _avance_por_seccion(db, ctx)

    resp_ids = {p.responsable_id for p in planes.values() if p.responsable_id}
    nombres = {u.id: u.name for u in db.execute(
        select(User).where(User.id.in_(resp_ids or {"__none__"}))).scalars()}

    out: list[dict] = []
    for s in secciones:
        plan = planes.get(s.seccion)
        meta_sug = suggest_meta(s.prioridad)
        meta = plan.meta_semanal if plan and plan.meta_semanal is not None else None
        capturados = avance.get(s.seccion, 0)
        efectiva = meta if meta is not None else meta_sug
        out.append({
            "seccion": s.seccion,
            "electoral": {
                "margen": s.margen,
                "prioridad": s.prioridad,
                "participacion": float(s.participacion),
                "persuadible": abs(s.margen) <= _PERSUADIBLE_UMBRAL,
            },
            "plan": {
                "responsable_id": plan.responsable_id if plan else None,
                "responsable_nombre": nombres.get(plan.responsable_id) if plan and plan.responsable_id else None,
                "problema_dominante": plan.problema_dominante if plan else None,
                "liderazgo": plan.liderazgo if plan else None,
                "meta_semanal": meta,
                "meta_sugerida": meta_sug,
                "prioridad_operativa": plan.prioridad_operativa if plan else s.prioridad,
                "notas": plan.notas if plan else None,
            },
            "avance": {
                "promovidos": capturados,
                "meta": efectiva,
                "pct": round(min(100, capturados / efectiva * 100)) if efectiva else None,
            },
        })
    return out


def upsert_plan(db: Session, ctx: CampaignContext, seccion: str, data: dict) -> None:
    plan = db.execute(
        select(SeccionPlan).where(
            SeccionPlan.campaign_id == ctx.campaign_id,
            SeccionPlan.seccion == seccion,
        )
    ).scalar_one_or_none()
    if plan is None:
        plan = SeccionPlan(
            organization_id=ctx.organization_id,
            campaign_id=ctx.campaign_id,
            seccion=seccion,
        )
        db.add(plan)
    for field in ("responsable_id", "problema_dominante", "liderazgo",
                  "meta_semanal", "prioridad_operativa", "notas"):
        if field in data:
            setattr(plan, field, data[field])
    db.commit()


# ── Agenda 30/60/90 ──────────────────────────────────────────────────────────

def list_agenda(db: Session, ctx: CampaignContext) -> list[dict]:
    rows = db.execute(
        select(AgendaItem)
        .where(AgendaItem.campaign_id == ctx.campaign_id, AgendaItem.deleted_at.is_(None))
        .order_by(AgendaItem.fase, AgendaItem.orden, AgendaItem.created_at)
    ).scalars()
    return [{
        "id": a.id, "fase": a.fase, "titulo": a.titulo,
        "descripcion": a.descripcion, "done": a.done, "orden": a.orden,
    } for a in rows]


def create_agenda(db: Session, ctx: CampaignContext, fase: int, titulo: str,
                  descripcion: Optional[str]) -> dict:
    item = AgendaItem(
        organization_id=ctx.organization_id, campaign_id=ctx.campaign_id,
        fase=fase, titulo=titulo, descripcion=descripcion)
    db.add(item)
    db.commit()
    return {"id": item.id, "fase": item.fase, "titulo": item.titulo,
            "descripcion": item.descripcion, "done": item.done, "orden": item.orden}


def _get_item(db: Session, ctx: CampaignContext, item_id: str) -> AgendaItem:
    item = db.execute(
        select(AgendaItem).where(
            AgendaItem.id == item_id,
            AgendaItem.campaign_id == ctx.campaign_id,
            AgendaItem.deleted_at.is_(None),
        )
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Ítem de agenda no encontrado")
    return item


def update_agenda(db: Session, ctx: CampaignContext, item_id: str, data: dict) -> dict:
    item = _get_item(db, ctx, item_id)
    for field in ("titulo", "descripcion", "done", "orden"):
        if field in data and data[field] is not None:
            setattr(item, field, data[field])
    db.commit()
    return {"id": item.id, "fase": item.fase, "titulo": item.titulo,
            "descripcion": item.descripcion, "done": item.done, "orden": item.orden}


# ── Seguimiento / war room ───────────────────────────────────────────────────

def _weekly_trend(db: Session, ctx: CampaignContext, last_n: int = 12) -> list[dict]:
    """Cumulative promovidos by ISO week, derived from Registro.created_at
    (immutable → real history for free, no snapshot table)."""
    fechas = db.execute(
        select(Registro.created_at).where(
            Registro.campaign_id == ctx.campaign_id,
            Registro.organization_id == ctx.organization_id,
            Registro.deleted_at.is_(None),
            Registro.created_at.is_not(None),
        )
    ).scalars().all()
    por_semana: Counter = Counter()
    for dt in fechas:
        y, w, _ = dt.isocalendar()
        por_semana[(y, w)] += 1
    acc = 0
    out: list[dict] = []
    for key in sorted(por_semana):
        acc += por_semana[key]
        out.append({"semana": f"{key[0]}-W{key[1]:02d}", "promovidos": acc})
    return out[-last_n:]


def _status(pct: int) -> str:
    return "verde" if pct >= 100 else ("ambar" if pct >= 60 else "rojo")


def seguimiento(db: Session, ctx: CampaignContext) -> dict:
    planes = list_planes(db, ctx)
    semaforo: list[dict] = []
    meta_total = 0
    prom_total = 0
    for p in planes:
        meta = p["avance"]["meta"] or 0
        prom = p["avance"]["promovidos"]
        pct = p["avance"]["pct"] if p["avance"]["pct"] is not None else 0
        meta_total += meta
        prom_total += prom
        semaforo.append({
            "seccion": p["seccion"],
            "prioridad": p["electoral"]["prioridad"],
            "persuadible": p["electoral"]["persuadible"],
            "meta": meta,
            "promovidos": prom,
            "pct": pct,
            "status": _status(pct),
        })
    alertas = sorted(
        (s for s in semaforo if s["status"] == "rojo"),
        key=lambda s: s["meta"] - s["promovidos"], reverse=True,
    )[:8]
    alertas = [{**a, "faltan": max(0, a["meta"] - a["promovidos"])} for a in alertas]
    return {
        "resumen": {
            "secciones": len(semaforo),
            "meta_total": meta_total,
            "promovidos_total": prom_total,
            "pct_global": round(min(100, prom_total / meta_total * 100)) if meta_total else None,
            "en_riesgo": sum(1 for s in semaforo if s["status"] == "rojo"),
            "al_dia": sum(1 for s in semaforo if s["status"] == "verde"),
        },
        "tendencia": _weekly_trend(db, ctx),
        "semaforo": sorted(semaforo, key=lambda s: s["pct"]),  # worst first
        "alertas": alertas,
    }
