"""Alertas — centro unificado de riesgo (cálculo al vuelo, sin persistencia).

Cada regla devuelve una lista de alertas (dicts). ``evaluar`` las ejecuta,
ordena por severidad y peso, y arma el resumen y la cuadrícula por sección.
Spec: docs/superpowers/specs/2026-09-24-alertas-centro-unificado-design.md
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from statistics import mean, pstdev
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.atencion import Caso
from app.models.campaign import CampaignMembership
from app.models.minuta import Acuerdo
from app.models.registro import Registro
from app.models.user import User, UserRole
from app.services import operacion_service
from app.services.caso_service import _TERMINAL_ESTADOS as _CASO_TERMINAL

AVANCE_ROJO_PCT = 60
Z_PARTICIPACION = 1.5
MIN_SECCIONES_Z = 5
CAIDA_RITMO_PCT = 30
MIN_RITMO_BASE = 5
DIAS_INACTIVIDAD = 7

_SEVERIDAD_RANGO = {"critica": 0, "alta": 1, "media": 2}
_ACUERDO_ABIERTO = ("PENDIENTE", "EN_CURSO")


def _alerta(regla: str, categoria: str, severidad: str, sujeto: str, titulo: str,
            detalle: str, enlace: str, *, seccion: Optional[str] = None,
            valor: Optional[float] = None, umbral: Optional[float] = None,
            peso: float = 0.0) -> dict:
    return {
        "clave": f"{regla}:{sujeto}", "regla": regla, "categoria": categoria,
        "severidad": severidad, "titulo": titulo, "detalle": detalle,
        "seccion": seccion, "valor": valor, "umbral": umbral, "enlace": enlace,
        "peso": float(peso),
    }


def _naive_utc(dt: datetime) -> datetime:
    """PostgreSQL devuelve timestamps con zona; SQLite sin zona. Normaliza a UTC naive."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def reglas_seccion(planes: list[dict]) -> list[dict]:
    """T1 (persuadible rezagada, crítica) y O1 (en rojo, alta) — excluyentes por sección."""
    out: list[dict] = []
    for p in planes:
        pct = p["avance"]["pct"]
        if pct is None or pct >= AVANCE_ROJO_PCT:
            continue
        s = p["seccion"]
        faltan = max(0, (p["avance"]["meta"] or 0) - p["avance"]["promovidos"])
        if p["electoral"]["persuadible"]:
            out.append(_alerta(
                "T1", "territorial", "critica", s,
                f"Sección {s} persuadible con {pct}% de avance",
                f"Margen 2024 ≤{operacion_service._PERSUADIBLE_UMBRAL} votos y avance "
                f"<{AVANCE_ROJO_PCT}% de la meta",
                "/plan-territorial", seccion=s, valor=pct, umbral=AVANCE_ROJO_PCT, peso=faltan))
        else:
            out.append(_alerta(
                "O1", "operativa", "alta", s,
                f"Sección {s} en rojo: {pct}% de avance",
                f"Avance <{AVANCE_ROJO_PCT}% de la meta de promovidos",
                "/war-room", seccion=s, valor=pct, umbral=AVANCE_ROJO_PCT, peso=faltan))
    return out


def regla_participacion(planes: list[dict]) -> list[dict]:
    """T2 — participación 2024 atípica frente a las demás secciones (|z| > umbral)."""
    datos = [(p["seccion"], float(p["electoral"]["participacion"]))
             for p in planes if p["electoral"]["participacion"] is not None]
    if len(datos) < MIN_SECCIONES_Z:
        return []
    valores = [v for _, v in datos]
    media, sd = mean(valores), pstdev(valores)
    if sd == 0:
        return []
    out: list[dict] = []
    for s, v in datos:
        z = (v - media) / sd
        if abs(z) <= Z_PARTICIPACION:
            continue
        sentido = "alta" if z > 0 else "baja"
        out.append(_alerta(
            "T2", "territorial", "media", s,
            f"Sección {s}: participación atípicamente {sentido} ({v:.1f}%)",
            f"Participación 2024 a más de {Z_PARTICIPACION} desviaciones estándar del "
            f"promedio de las secciones ({media:.1f}%)",
            "/municipio", seccion=s, valor=round(v, 1), umbral=round(media, 1), peso=abs(z)))
    return out


def regla_ritmo(fechas: list[datetime], hoy: date) -> list[dict]:
    """O2 — promovidos de la última semana ISO completa vs promedio de las 4 anteriores."""
    lunes = hoy - timedelta(days=hoy.weekday())
    semanas = [0] * 5  # [0] = última semana completa; [1..4] = base
    for dt in fechas:
        dias_antes = (lunes - _naive_utc(dt).date()).days
        if dias_antes <= 0:
            continue  # semana en curso
        idx = (dias_antes - 1) // 7
        if idx < 5:
            semanas[idx] += 1
    base = mean(semanas[1:])
    if base < MIN_RITMO_BASE:
        return []
    ultima = semanas[0]
    cambio = (ultima - base) / base * 100
    if cambio >= -CAIDA_RITMO_PCT:
        return []
    return [_alerta(
        "O2", "operativa", "alta", "campaña",
        f"Ritmo semanal {round(cambio)}% vs promedio de 4 semanas",
        f"Promovidos de la última semana completa ({ultima}) contra el promedio de las "
        f"4 anteriores ({base:.1f}); umbral −{CAIDA_RITMO_PCT}%",
        "/", valor=round(cambio), umbral=-CAIDA_RITMO_PCT, peso=-cambio)]


def regla_casos(db: Session, ctx: CampaignContext, hoy: date) -> list[dict]:
    """O3 — casos abiertos con fecha compromiso vencida (una alerta con el conteo)."""
    base = scoped_query(Caso, ctx).subquery()
    n = db.execute(select(func.count()).select_from(base).where(
        base.c.fecha_compromiso.isnot(None),
        base.c.fecha_compromiso < hoy,
        base.c.estado.notin_(_CASO_TERMINAL),
    )).scalar_one()
    if not n:
        return []
    return [_alerta(
        "O3", "operativa", "alta", "campaña",
        f"{n} {'caso' if n == 1 else 'casos'} con SLA vencido",
        "Casos abiertos cuya fecha compromiso ya pasó",
        "/atencion/casos", valor=n, umbral=0, peso=n)]


def regla_acuerdos(db: Session, ctx: CampaignContext, hoy: date) -> list[dict]:
    """O5 — acuerdos de minutas abiertos con fecha límite vencida."""
    base = scoped_query(Acuerdo, ctx).subquery()
    n = db.execute(select(func.count()).select_from(base).where(
        base.c.fecha_limite.isnot(None),
        base.c.fecha_limite < hoy,
        base.c.estado.in_(_ACUERDO_ABIERTO),
    )).scalar_one()
    if not n:
        return []
    return [_alerta(
        "O5", "operativa", "media", "campaña",
        f"{n} {'acuerdo vencido' if n == 1 else 'acuerdos vencidos'}",
        "Acuerdos pendientes o en curso con fecha límite ya pasada",
        "/acuerdos", valor=n, umbral=0, peso=n)]


def regla_inactivos(db: Session, ctx: CampaignContext, hoy: date) -> list[dict]:
    """O4 — activistas/capturistas de la campaña sin registros en DIAS_INACTIVIDAD días."""
    limite = hoy - timedelta(days=DIAS_INACTIVIDAD)
    miembros = db.execute(
        select(User)
        .join(CampaignMembership, CampaignMembership.user_id == User.id)
        .where(
            CampaignMembership.campaign_id == ctx.campaign_id,
            CampaignMembership.deleted_at.is_(None),
            User.organization_id == ctx.organization_id,
            User.role.in_((UserRole.ACTIVISTA, UserRole.CAPTURISTA)),
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
    ).scalars().all()
    if not miembros:
        return []
    ultima = dict(db.execute(
        scoped_query(Registro, ctx)
        .with_only_columns(Registro.activista_id, func.max(Registro.created_at))
        .where(Registro.activista_id.in_([u.id for u in miembros]))
        .group_by(Registro.activista_id)
    ).all())
    out: list[dict] = []
    for u in miembros:
        alta = _naive_utc(u.created_at).date()
        if alta > limite:
            continue  # recién dado de alta
        last = ultima.get(u.id)
        if last is not None and _naive_utc(last).date() > limite:
            continue
        desde = _naive_utc(last).date() if last is not None else alta
        dias = (hoy - desde).days
        titulo = (f"{u.full_name} sin capturas hace {dias} días" if last is not None
                  else f"{u.full_name} sin capturas desde su alta ({dias} días)")
        out.append(_alerta(
            "O4", "operativa", "media", u.id, titulo,
            f"Activista o capturista sin registros en los últimos {DIAS_INACTIVIDAD} días",
            "/admin/estructura", valor=dias, umbral=DIAS_INACTIVIDAD, peso=dias))
    return out
