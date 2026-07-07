"""Caso service — atención ciudadana core logic.

Owns: folio assignment (AC-<year>-NNNNN, max-suffix + collision retry),
territorial auto-routing (assignee whose territory covers the caso's sección),
lifecycle (estado transitions), bitácora (CasoEvento trail), and the panorama
aggregate. Mirrors ``militante_service`` for scoping/crypto/audit; casos add
territorial routing and an event log.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import crypto
from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.atencion import Caso, CasoEvento
from app.models.user import User, UserRole
from app.services import territory_service
from app.services.audit_service import record_audit

# SLA (business days-as-calendar-days v1) per caso tipo. Missing tipo → 7.
SLA_DIAS = {"PETICION": 7, "QUEJA": 5, "APOYO": 10, "OTRO": 7}

_TERMINAL_ESTADOS = ("ATENDIDO", "CERRADO")


class InvalidEvidenciaKey(ValueError):
    """Raised when a client-supplied evidencia_key does not belong to the caso
    it is being attached to (prevents linking a bitácora event to a foreign or
    forged bucket object)."""


def _mask(value: str) -> str:
    """Masked display value for a contacto (phone/email): ``****-1234``."""
    return f"****-{value[-4:]}" if value else ""


# ── Folio (max-suffix + collision retry) ──────────────────────────────────────
_FOLIO_MAX_RETRIES = 5


def _next_folio(db: Session, ctx: CampaignContext) -> str:
    """Next folio = MAX existing numeric suffix + 1 for this campaign+prefix.

    Queries by campaign_id WITHOUT the soft-delete filter: uq_casos_campaign_folio
    covers soft-deleted rows too, so a deleted folio must NOT be reused. Basing the
    next suffix on MAX (not count) means deletes never lower the counter.
    """
    year = date.today().year
    prefix = f"AC-{year}-"
    folios = db.execute(
        select(Caso.folio).where(
            Caso.campaign_id == ctx.campaign_id,
            Caso.folio.like(f"{prefix}%"),
        )
    ).scalars().all()
    max_n = 0
    for folio in folios:
        suffix = folio[len(prefix):]
        if suffix.isdigit():
            max_n = max(max_n, int(suffix))
    return f"{prefix}{max_n + 1:05d}"


def _flush_with_folio_retry(db: Session, ctx: CampaignContext, c: Caso) -> None:
    """Flush the new caso, retrying on folio unique-constraint collisions.

    Concurrent captures can compute the same next folio and collide on
    uq_casos_campaign_folio. On that IntegrityError we roll back to a savepoint,
    recompute the folio from the current MAX, and retry (bounded). Other
    IntegrityErrors are re-raised immediately.
    """
    for attempt in range(_FOLIO_MAX_RETRIES):
        c.folio = _next_folio(db, ctx)
        savepoint = db.begin_nested()
        try:
            db.flush()
            savepoint.commit()
            return
        except IntegrityError as exc:
            savepoint.rollback()
            if "uq_casos_campaign_folio" not in str(exc.orig):
                raise
            if attempt == _FOLIO_MAX_RETRIES - 1:
                raise


# ── Territorial auto-routing ───────────────────────────────────────────────────
def _resolve_responsable(db: Session, ctx: CampaignContext, seccion: Optional[str]) -> Optional[str]:
    """Return the id of the user whose assigned territory MOST specifically
    covers ``seccion``.

    Fallback None → the caso lands in the coordinator (unassigned) queue. Scans
    org users with an assigned area_id and, among those whose resolved secciones
    contain the caso's sección, prefers the SMALLEST territory (an activista
    pinned to a single sección wins over a coordinator covering a whole
    municipio). Ties break deterministically by ``user.id`` so routing is stable
    regardless of row order.
    """
    if not seccion:
        return None
    users = db.execute(
        select(User).where(
            User.organization_id == ctx.organization_id,
            User.area_id.isnot(None),
            User.deleted_at.is_(None),
        )
    ).scalars().all()
    best: Optional[User] = None
    best_size = -1
    for u in users:
        secciones = territory_service.scope_secciones(db, u)
        if seccion not in secciones:
            continue
        size = len(secciones)
        if best is None or size < best_size or (size == best_size and u.id < best.id):
            best, best_size = u, size
    return best.id if best is not None else None


# ── Create ─────────────────────────────────────────────────────────────────────
def crear_directo(db: Session, ctx: CampaignContext, data: dict) -> Caso:
    """Create a caso directly (internal capture). Assigns folio + territorial
    routing + SLA compromiso, encrypts contacto, audits, and writes the opening
    bitácora event (CAMBIO_ESTADO → PENDIENTE)."""
    tipo = (data.get("tipo") or "OTRO").upper()
    seccion = data.get("seccion")

    contacto = data.get("contacto")
    contacto_enc = crypto.encrypt_clave(contacto) if contacto else None
    contacto_masked = _mask(contacto) if contacto else None

    asignado_a = _resolve_responsable(db, ctx, seccion)
    fecha_compromiso = date.today() + timedelta(days=SLA_DIAS.get(tipo, 7))

    titulo = data.get("titulo") or (data.get("descripcion") or "")[:60] or "Caso"

    c = Caso(
        organization_id=ctx.organization_id,
        campaign_id=ctx.campaign_id,
        folio="",  # assigned (with collision retry) by _flush_with_folio_retry
        tipo=tipo,
        titulo=titulo,
        descripcion=data.get("descripcion"),
        ciudadano_nombre=data.get("ciudadano_nombre"),
        contacto_enc=contacto_enc,
        contacto_masked=contacto_masked,
        seccion=seccion,
        colonia=data.get("colonia"),
        asignado_a=asignado_a,
        estado="PENDIENTE",
        prioridad=(data.get("prioridad") or "MEDIA").upper(),
        fecha_compromiso=fecha_compromiso,
        channel=(data.get("channel") or "INTERNO").upper(),
        moderacion=(data.get("moderacion") or "VERIFICADO").upper(),
        origin_response_id=data.get("origin_response_id"),
        created_by=ctx.user.id,
    )
    db.add(c)
    _flush_with_folio_retry(db, ctx, c)

    db.add(CasoEvento(
        organization_id=ctx.organization_id,
        caso_id=c.id,
        tipo="CAMBIO_ESTADO",
        estado_nuevo="PENDIENTE",
        actor_id=ctx.user.id,
    ))
    record_audit(db, action="caso.create", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="caso", entity_id=c.id)
    db.commit()
    db.refresh(c)
    return c


def _answer(answers: Optional[dict], *aliases: str):
    """First non-empty answer whose key EXACTLY matches (case-insensitive) one of
    ``aliases``, tried in alias order.

    Exact equality — NOT substring — is deliberate: a substring match let a
    ``tel`` alias swallow a ``detalle`` field, corrupting a form description into
    the citizen's ``contacto`` (PII + a garbage mask). Match keys against
    explicit alias lists only.
    """
    if not answers:
        return None
    lowered = {str(k).lower(): v for k, v in answers.items()}
    for alias in aliases:
        v = lowered.get(alias.lower())
        if v not in (None, ""):
            return v
    return None


def crear_desde_respuesta(db: Session, ctx: CampaignContext, response, form) -> Caso:
    """Materialize a caso from a public/form response using the key-convention
    mapping, then link both directions (caso.origin_response_id ↔ response.caso_id)."""
    answers = response.answers or {}
    descripcion = _answer(answers, "descripcion", "detalle")
    seccion = _answer(answers, "seccion") or response.seccion
    data = {
        "tipo": form.tipo,
        "titulo": _answer(answers, "titulo") or (descripcion or "")[:60],
        "descripcion": descripcion,
        "ciudadano_nombre": _answer(answers, "nombre", "ciudadano_nombre") or response.nombre_emisor,
        "contacto": _answer(answers, "contacto", "tel", "telefono", "celular", "email", "correo"),
        "seccion": seccion,
        "colonia": _answer(answers, "colonia"),
        "channel": response.channel,
        "moderacion": response.moderacion,
        "origin_response_id": response.id,
    }
    caso = crear_directo(db, ctx, data)
    # Link the response back to its caso (survives crear_directo's commit).
    response.caso_id = caso.id
    db.add(response)
    db.commit()
    return caso


# ── Scoping (role + territory) ─────────────────────────────────────────────────
def _caso_role_scoped(ctx: CampaignContext):
    """Role scope for casos. own = assigned-to-me OR created-by-me.

    - SUPERADMIN / ADMIN → whole campaign.
    - COORDINADOR / LIDER → the SUPERVISORY HIERARCHY (mirrors
      ``militante_service._militante_role_scoped``) OR unassigned rows. Because
      territorial auto-routing assigns casos to subordinate activistas (not to
      the supervisor), scoping only to "own OR unassigned" would hide a
      supervisor's own team's in-territory casos from list/get/panorama — the
      hierarchy keys on both ``asignado_a`` AND ``created_by`` restore oversight.
      The sección territory gate in ``_territory_gated`` remains the real limit.
    - ACTIVISTA / CAPTURISTA → own rows only.
    - everyone else → nothing.
    """
    if ctx.is_superadmin or ctx.role == UserRole.ADMIN:
        return scoped_query(Caso, ctx)
    if ctx.role in (UserRole.COORDINADOR, UserRole.LIDER):
        if ctx.role == UserRole.COORDINADOR:
            lideres = select(User.id).where(User.coordinador_id == ctx.user.id)
            activistas = select(User.id).where(User.lider_id.in_(lideres))
            hierarchy = or_(
                Caso.asignado_a.in_(activistas), Caso.asignado_a.in_(lideres),
                Caso.asignado_a == ctx.user.id,
                Caso.created_by.in_(activistas), Caso.created_by.in_(lideres),
                Caso.created_by == ctx.user.id,
            )
        else:  # LIDER
            activistas = select(User.id).where(User.lider_id == ctx.user.id)
            hierarchy = or_(
                Caso.asignado_a.in_(activistas), Caso.asignado_a == ctx.user.id,
                Caso.created_by.in_(activistas), Caso.created_by == ctx.user.id,
            )
        return scoped_query(Caso, ctx).where(or_(hierarchy, Caso.asignado_a.is_(None)))
    if ctx.role in (UserRole.ACTIVISTA, UserRole.CAPTURISTA):
        owned = or_(Caso.asignado_a == ctx.user.id, Caso.created_by == ctx.user.id)
        return scoped_query(Caso, ctx).where(owned)
    return scoped_query(Caso, ctx).where(sa.false())


def _bypass_territory(ctx: CampaignContext) -> bool:
    """Roles exempt from the sección territory gate: platform-wide roles
    (superadmin/ADMIN) and field roles restricted to their own rows already."""
    return ctx.is_superadmin or ctx.role == UserRole.ADMIN \
        or ctx.role in (UserRole.ACTIVISTA, UserRole.CAPTURISTA)


def _territory_gated(db: Session, ctx: CampaignContext):
    """Role scope + sección territory gate — the single source of truth shared by
    list/get (and therefore set_estado/asignar/add_evento). For COORDINADOR/LIDER
    an empty territory yields NO rows."""
    stmt = _caso_role_scoped(ctx)
    if _bypass_territory(ctx):
        return stmt
    secciones = territory_service.scope_secciones(db, ctx.user)
    return stmt.where(Caso.seccion.in_(secciones)) if secciones else stmt.where(sa.false())


# ── List / get ─────────────────────────────────────────────────────────────────
def _enrich_asignado(db: Session, rows: list[Caso]) -> None:
    ids = {r.asignado_a for r in rows if r.asignado_a}
    names: dict[str, str] = {}
    if ids:
        for uid, fname in db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all():
            names[uid] = fname
    for r in rows:
        r.asignado_nombre = names.get(r.asignado_a)


def list_casos(db: Session, ctx: CampaignContext, *, estado=None, colonia=None,
               asignado=None, tipo=None, q=None, limit=50, offset=0) -> tuple[list[Caso], int, bool]:
    has_territory = _bypass_territory(ctx) or bool(territory_service.scope_secciones(db, ctx.user))

    stmt = _territory_gated(db, ctx)
    if estado:
        stmt = stmt.where(Caso.estado == estado)
    if colonia:
        stmt = stmt.where(Caso.colonia == colonia)
    if asignado:
        stmt = stmt.where(Caso.asignado_a == asignado)
    if tipo:
        stmt = stmt.where(Caso.tipo == tipo)
    if q:
        stmt = stmt.where(or_(Caso.titulo.ilike(f"%{q}%"), Caso.folio.ilike(f"%{q}%")))

    ordered = stmt.order_by(Caso.created_at.desc())
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = list(db.execute(ordered.limit(limit).offset(offset)).scalars().all())
    _enrich_asignado(db, rows)
    return rows, total, has_territory


def get_caso(db: Session, ctx: CampaignContext, cid: str) -> Optional[Caso]:
    caso = db.execute(_territory_gated(db, ctx).where(Caso.id == cid)).scalar_one_or_none()
    if caso is not None:
        _enrich_asignado(db, [caso])
    return caso


# ── Lifecycle / bitácora ───────────────────────────────────────────────────────
def set_estado(db: Session, ctx: CampaignContext, cid: str, estado: str,
               texto: Optional[str] = None) -> Optional[Caso]:
    caso = get_caso(db, ctx, cid)
    if caso is None:
        return None
    estado = estado.upper()
    caso.estado = estado
    caso.updated_by = ctx.user.id
    db.add(CasoEvento(
        organization_id=ctx.organization_id, caso_id=caso.id, tipo="CAMBIO_ESTADO",
        estado_nuevo=estado, texto=texto, actor_id=ctx.user.id,
    ))
    record_audit(db, action="caso.set_estado", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="caso", entity_id=caso.id,
                 meta={"estado": estado})
    db.commit()
    db.refresh(caso)
    return caso


def asignar(db: Session, ctx: CampaignContext, cid: str, user_id: Optional[str],
            texto: Optional[str] = None) -> Optional[Caso]:
    caso = get_caso(db, ctx, cid)
    if caso is None:
        return None
    if user_id is not None:
        # Target must be a live user in the same org/campaign — never assign a
        # caso to an id from another tenant or a deleted user.
        target = db.execute(
            select(User.id).where(
                User.id == user_id,
                User.organization_id == ctx.organization_id,
                User.deleted_at.is_(None),
            )
        ).scalar_one_or_none()
        if target is None:
            return None
    caso.asignado_a = user_id
    caso.updated_by = ctx.user.id
    db.add(CasoEvento(
        organization_id=ctx.organization_id, caso_id=caso.id, tipo="REASIGNACION",
        texto=texto, actor_id=ctx.user.id,
    ))
    record_audit(db, action="caso.asignar", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="caso", entity_id=caso.id,
                 meta={"asignado_a": user_id})
    db.commit()
    db.refresh(caso)
    _enrich_asignado(db, [caso])
    return caso


def add_evento(db: Session, ctx: CampaignContext, cid: str, tipo: str, *,
               texto: Optional[str] = None, evidencia: Optional[bytes] = None,
               content_type: str = "image/jpeg",
               evidencia_key: Optional[str] = None) -> Optional[CasoEvento]:
    """Append a bitácora event (NOTA / EVIDENCIA).

    Two ways to attach evidence: pass raw ``evidencia`` bytes (legacy inline
    path — the object is stored under casos/{campaign}/{caso}/ev-{n}.jpg and
    the key recorded), or pass an ``evidencia_key`` already returned by
    ``subir_evidencia`` (the POST /casos/{cid}/evidencia upload endpoint) — in
    that case the object is already in the bucket, so it's just linked. A
    supplied ``evidencia_key`` MUST belong to this caso's own prefix.
    """
    caso = get_caso(db, ctx, cid)
    if caso is None:
        return None
    tipo = tipo.upper()
    key = None
    if evidencia:
        from app.core import storage
        n = db.execute(
            select(func.count()).select_from(CasoEvento)
            .where(CasoEvento.caso_id == caso.id, CasoEvento.evidencia_key.isnot(None))
        ).scalar_one()
        key = f"casos/{caso.campaign_id}/{caso.id}/ev-{n + 1}.jpg"
        storage.put_object(key, evidencia, content_type)
    elif evidencia_key:
        prefix = f"casos/{caso.campaign_id}/{caso.id}/"
        if not evidencia_key.startswith(prefix):
            raise InvalidEvidenciaKey("evidencia_key no pertenece a este caso")
        key = evidencia_key

    evento = CasoEvento(
        organization_id=ctx.organization_id, caso_id=caso.id, tipo=tipo,
        texto=texto, evidencia_key=key, actor_id=ctx.user.id,
    )
    db.add(evento)
    record_audit(db, action="caso.evento", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="caso", entity_id=caso.id,
                 meta={"tipo": tipo})
    db.commit()
    db.refresh(evento)
    return evento


def subir_evidencia(db: Session, ctx: CampaignContext, cid: str,
                    data: bytes, content_type: str) -> Optional[str]:
    """Upload a case-evidence object to the bucket under
    casos/{campaign}/{caso}/ev-{uuid}.jpg and return the storage key.

    The object is not yet linked to any bitácora event — the caller records
    that separately via ``add_evento(..., evidencia_key=key)`` (mirrors the
    two-step upload-then-reference flow used for form-response evidencia).
    """
    from app.core import storage
    caso = get_caso(db, ctx, cid)
    if caso is None:
        return None
    key = f"casos/{caso.campaign_id}/{caso.id}/ev-{uuid.uuid4()}.jpg"
    storage.put_object(key, data, content_type)
    record_audit(db, action="caso.evidencia.upload", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="caso", entity_id=caso.id)
    db.commit()
    return key


def evidencia_url(key: Optional[str]) -> Optional[str]:
    """Presigned GET for a CasoEvento's evidencia_key, or None if unset."""
    if not key:
        return None
    from app.core import storage
    return storage.presigned_get(key)


# ── Panorama ───────────────────────────────────────────────────────────────────
def panorama(db: Session, ctx: CampaignContext) -> dict:
    stmt = _territory_gated(db, ctx)
    sub = stmt.subquery()

    total = db.execute(select(func.count()).select_from(sub)).scalar_one()

    estado_rows = db.execute(
        select(sub.c.estado, func.count()).group_by(sub.c.estado)
    ).all()
    por_estado = {e: c for e, c in estado_rows}

    today = date.today()
    sla_vencidos = db.execute(
        select(func.count()).select_from(sub).where(
            sub.c.fecha_compromiso.isnot(None),
            sub.c.fecha_compromiso < today,
            sub.c.estado.notin_(_TERMINAL_ESTADOS),
        )
    ).scalar_one()

    # tiempo_prom (days from creation to last update) over terminal casos.
    terminal = db.execute(
        select(sub.c.created_at, sub.c.updated_at).where(sub.c.estado.in_(_TERMINAL_ESTADOS))
    ).all()
    deltas = [
        (u - c).total_seconds() / 86400.0
        for c, u in terminal if c is not None and u is not None
    ]
    tiempo_prom = round(sum(deltas) / len(deltas), 1) if deltas else None

    col_rows = db.execute(
        select(sub.c.colonia, func.count()).group_by(sub.c.colonia)
    ).all()
    por_colonia = [
        {"colonia": col or "Sin colonia", "casos": c}
        for col, c in sorted(col_rows, key=lambda x: -x[1])
    ]

    resp_rows = db.execute(
        select(sub.c.asignado_a, func.count()).group_by(sub.c.asignado_a)
    ).all()
    # Pendientes = non-terminal casos per responsable (same scoped subquery).
    pend_rows = db.execute(
        select(sub.c.asignado_a, func.count())
        .where(sub.c.estado.notin_(_TERMINAL_ESTADOS))
        .group_by(sub.c.asignado_a)
    ).all()
    pendientes = {a: c for a, c in pend_rows}
    rids = {a for a, _ in resp_rows if a}
    names: dict[str, str] = {}
    if rids:
        for uid, fn in db.execute(select(User.id, User.full_name).where(User.id.in_(rids))).all():
            names[uid] = fn
    por_responsable = [
        {"asignado_a": a, "nombre": names.get(a, "—") if a else "Sin asignar",
         "casos": c, "pendientes": pendientes.get(a, 0)}
        for a, c in sorted(resp_rows, key=lambda x: -x[1])
    ]

    return {
        "kpis": {
            "total": total,
            "por_estado": por_estado,
            "sla_vencidos": sla_vencidos,
            "tiempo_prom_dias": tiempo_prom,
        },
        "por_colonia": por_colonia,
        "por_responsable": por_responsable,
    }
