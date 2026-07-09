"""Executive Command Center — composes campaign KPIs from the operación,
militante and caso services into one campaign-scoped payload. Read-only."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import CampaignContext
from app.models.campaign import Contest
from app.services import caso_service, militante_service, operacion_service, scrum_service


def _election_date(db: Session, ctx: CampaignContext):
    val = db.execute(
        select(Contest.election_date).where(
            Contest.campaign_id == ctx.campaign_id,
            Contest.organization_id == ctx.organization_id,
            Contest.election_date.is_not(None),
            Contest.deleted_at.is_(None),
        ).order_by(Contest.election_date).limit(1)
    ).scalar_one_or_none()
    return val.isoformat() if val else None


def executive(db: Session, ctx: CampaignContext) -> dict:
    seg = operacion_service.seguimiento(db, ctx)
    resumen = seg["resumen"]
    mil = militante_service.panorama(db, ctx)["kpis"]
    cas = caso_service.panorama(db, ctx)["kpis"]

    por_estado = cas.get("por_estado", {}) or {}
    cerrados = por_estado.get("CERRADO", 0)
    top = sorted(seg["semaforo"], key=lambda s: s["promovidos"], reverse=True)[:6]

    return {
        "election_date": _election_date(db, ctx),
        "promovidos": {
            "total": resumen["promovidos_total"],
            "meta": resumen["meta_total"],
            "pct": resumen["pct_global"],
        },
        "afiliados": {
            "total": mil.get("total", 0),
            "validados": mil.get("validados", 0),
            "meta": mil.get("meta"),
        },
        "casos": {
            "total": cas.get("total", 0),
            "abiertos": max(0, cas.get("total", 0) - cerrados),
            "sla_vencidos": cas.get("sla_vencidos", 0),
        },
        "cobertura": {
            "secciones": resumen["secciones"],
            "en_riesgo": resumen["en_riesgo"],
            "al_dia": resumen["al_dia"],
            "pct_global": resumen["pct_global"],
        },
        "tendencia": seg["tendencia"],
        "por_seccion_top": [{"seccion": s["seccion"], "promovidos": s["promovidos"]} for s in top],
        "casos_por_estado": [{"estado": e, "n": n} for e, n in por_estado.items()],
        "alertas": [{"seccion": a["seccion"], "faltan": a["faltan"]} for a in seg["alertas"]],
        "scrum": scrum_service.scrum_summary(db, ctx),
    }
