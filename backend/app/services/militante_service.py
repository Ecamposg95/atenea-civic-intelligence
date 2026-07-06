"""Militante service — formal affiliation CRUD (crypto, folio, flags, audit)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import crypto
from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.campaign import Campaign
from app.models.militante import Militante
from app.models.user import User, UserRole
from app.schemas.militante import MilitanteCreate, MilitanteEstadoUpdate
from app.services import privacy_service, territory_service
from app.services.audit_service import record_audit


class ConsentRequired(Exception):
    """Raised when a militante is created without consentimiento=True."""


NoActiveNotice = privacy_service.NoActiveNotice


def _mask(value: str) -> str:
    return f"****-{value[-4:]}" if value else ""


def compute_quality_flags(m: Militante) -> dict:
    return {
        "falta_curp": m.curp_enc is None,
        "falta_foto_frente": m.credencial_frente_key is None,
        "falta_foto_reverso": m.credencial_reverso_key is None,
        "falta_firma": m.firma_key is None,
        "clave_incompleta": bool(m.clave_masked) is False,
        "posible_duplicado": False,  # set by _flag_duplicate below
    }


def _flag_duplicate(db: Session, ctx: CampaignContext, m: Militante) -> bool:
    """A soft signal: same masked CURP or clave within the campaign."""
    if not (m.curp_masked or m.clave_masked):
        return False
    stmt = scoped_query(Militante, ctx).where(Militante.id != m.id).where(
        or_(
            sa.and_(Militante.curp_masked.isnot(None), Militante.curp_masked == m.curp_masked),
            sa.and_(Militante.clave_masked.isnot(None), Militante.clave_masked == m.clave_masked),
        )
    )
    return db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one() > 0


def _next_folio(db: Session, ctx: CampaignContext) -> str:
    year = date.today().year
    prefix = f"SMA-{year}-"
    count = db.execute(
        select(func.count()).select_from(
            scoped_query(Militante, ctx).where(Militante.folio.like(f"{prefix}%")).subquery()
        )
    ).scalar_one()
    return f"{prefix}{count + 1:05d}"


def create_militante(db: Session, ctx: CampaignContext, data: MilitanteCreate) -> Militante:
    if not data.consentimiento:
        raise ConsentRequired()

    if data.client_uuid:
        existing = db.execute(
            scoped_query(Militante, ctx)
            .where(Militante.activista_id == ctx.user.id)
            .where(Militante.client_uuid == data.client_uuid)
        ).scalar_one_or_none()
        if existing is not None:
            return existing

    notice = privacy_service.get_active_notice(db, ctx)

    curp_enc = crypto.encrypt_clave(data.curp) if data.curp else None
    curp_masked = _mask(data.curp) if data.curp else None
    clave_enc = crypto.encrypt_clave(data.clave_elector) if data.clave_elector else None
    clave_masked = crypto.mask_clave(data.clave_elector) if data.clave_elector else None

    m = Militante(
        organization_id=ctx.organization_id,
        campaign_id=ctx.campaign_id,
        activista_id=ctx.user.id,
        nombre_completo=data.nombre_completo,
        sexo=data.sexo,
        fecha_nacimiento=data.fecha_nacimiento,
        seccion=data.seccion,
        email=data.email,
        telefono=data.telefono,
        calle_numero=data.calle_numero,
        colonia=data.colonia,
        cp=data.cp,
        municipio=data.municipio,
        estado_domicilio=data.estado_domicilio,
        es_activista=data.es_activista,
        estructura=data.estructura,
        promotor=data.promotor,
        folio=_next_folio(db, ctx),
        folio_externo=data.folio_externo,
        fecha_afiliacion=data.fecha_afiliacion or date.today(),
        curp_enc=curp_enc, curp_masked=curp_masked,
        clave_elector_enc=clave_enc, clave_masked=clave_masked,
        estado="REGISTRADO",
        consentimiento=True,
        consentimiento_at=datetime.now(timezone.utc),
        aviso_version=notice.version,
        client_uuid=data.client_uuid,
        lat=data.lat, lng=data.lng,
        created_by=ctx.user.id,
    )
    db.add(m)
    db.flush()
    flags = compute_quality_flags(m)
    flags["posible_duplicado"] = _flag_duplicate(db, ctx, m)
    m.quality_flags = flags
    record_audit(db, action="militante.create", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="militante", entity_id=m.id)
    privacy_service.record_acceptance(db, ctx, m, notice)
    db.commit()
    db.refresh(m)
    return m


def _militante_role_scoped(ctx: CampaignContext):
    """Role scope: activistas see own; supervisory roles reuse the registro
    hierarchy OR unowned rows (territory is the real gate); admin=campaign; SA=all."""
    if ctx.is_superadmin or ctx.role == UserRole.ADMIN:
        return scoped_query(Militante, ctx)
    if ctx.role in (UserRole.COORDINADOR, UserRole.LIDER):
        # mirror registro_service hierarchy, but against militantes:
        if ctx.role == UserRole.COORDINADOR:
            lideres = select(User.id).where(User.coordinador_id == ctx.user.id)
            activistas = select(User.id).where(User.lider_id.in_(lideres))
            owned = or_(Militante.activista_id.in_(activistas),
                        Militante.activista_id.in_(lideres),
                        Militante.activista_id == ctx.user.id)
        else:  # LIDER
            sub = select(User.id).where(User.lider_id == ctx.user.id)
            owned = or_(Militante.activista_id.in_(sub), Militante.activista_id == ctx.user.id)
        return scoped_query(Militante, ctx).where(or_(owned, Militante.activista_id.is_(None)))
    if ctx.role in (UserRole.ACTIVISTA, UserRole.CAPTURISTA):
        return scoped_query(Militante, ctx).where(Militante.activista_id == ctx.user.id)
    return scoped_query(Militante, ctx).where(sa.false())


def list_militantes(db: Session, ctx: CampaignContext, *, seccion, estado, activista,
                    flag, q, limit, offset) -> tuple[list[Militante], int, bool]:
    secciones = territory_service.scope_secciones(db, ctx.user)
    bypass_territory = ctx.is_superadmin or ctx.role == UserRole.ADMIN \
        or ctx.role in (UserRole.ACTIVISTA, UserRole.CAPTURISTA)
    has_territory = bypass_territory or bool(secciones)

    stmt = _militante_role_scoped(ctx)
    if not bypass_territory:
        stmt = stmt.where(Militante.seccion.in_(secciones)) if secciones else stmt.where(sa.false())
    if seccion:
        stmt = stmt.where(Militante.seccion == seccion)
    if estado:
        stmt = stmt.where(Militante.estado == estado)
    if activista:
        stmt = stmt.where(Militante.activista_id == activista)
    if q:
        stmt = stmt.where(Militante.nombre_completo.ilike(f"%{q}%"))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = list(db.execute(
        stmt.order_by(Militante.created_at.desc()).limit(limit).offset(offset)
    ).scalars().all())

    if flag:  # in-memory filter on the page (quality flags are JSON)
        rows = [r for r in rows if (r.quality_flags or {}).get(flag)]

    ids = {r.activista_id for r in rows if r.activista_id}
    names: dict[str, str] = {}
    if ids:
        for uid, fname in db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all():
            names[uid] = fname
    for r in rows:
        r.activista_nombre = names.get(r.activista_id)
        r.tiene_frente = r.credencial_frente_key is not None
        r.tiene_reverso = r.credencial_reverso_key is not None
        r.tiene_firma = r.firma_key is not None
    return rows, total, has_territory


def get_militante(db: Session, ctx: CampaignContext, mid: str) -> Optional[Militante]:
    return db.execute(
        _militante_role_scoped(ctx).where(Militante.id == mid)
    ).scalar_one_or_none()


def set_estado(db: Session, ctx: CampaignContext, mid: str,
               data: MilitanteEstadoUpdate) -> Optional[Militante]:
    m = get_militante(db, ctx, mid)
    if m is None:
        return None
    m.estado = data.estado
    m.observacion_validacion = data.observacion_validacion
    m.validado_por = ctx.user.id
    m.validado_at = datetime.now(timezone.utc)
    m.updated_by = ctx.user.id
    db.flush()
    record_audit(db, action="militante.validate", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="militante", entity_id=m.id)
    db.commit()
    db.refresh(m)
    return m


def reveal_militante(db: Session, ctx: CampaignContext, mid: str) -> Optional[dict]:
    from app.core import storage
    m = get_militante(db, ctx, mid)
    if m is None:
        return None
    record_audit(db, action="militante.reveal", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="militante", entity_id=m.id)
    db.commit()
    out = {
        "curp": crypto.decrypt_clave(m.curp_enc) if m.curp_enc else None,
        "clave_elector": crypto.decrypt_clave(m.clave_elector_enc) if m.clave_elector_enc else None,
        "frente_url": storage.presigned_get(m.credencial_frente_key) if m.credencial_frente_key else None,
        "reverso_url": storage.presigned_get(m.credencial_reverso_key) if m.credencial_reverso_key else None,
        "firma_url": storage.presigned_get(m.firma_key) if m.firma_key else None,
    }
    return out


_DOC_EXT = {"frente": ("frente.jpg", "credencial_frente_key"),
            "reverso": ("reverso.jpg", "credencial_reverso_key"),
            "firma": ("firma.png", "firma_key")}


def upload_documento(db: Session, ctx: CampaignContext, mid: str, tipo: str,
                     data: bytes, content_type: str) -> Optional[Militante]:
    from app.core import storage
    if tipo not in _DOC_EXT:
        raise ValueError(f"tipo inválido: {tipo}")
    m = get_militante(db, ctx, mid)
    if m is None:
        return None
    filename, attr = _DOC_EXT[tipo]
    key = f"militantes/{m.campaign_id}/{m.id}/{filename}"
    storage.put_object(key, data, content_type)
    setattr(m, attr, key)
    if tipo == "firma":
        m.manifestacion_voluntad = True
    flags = compute_quality_flags(m)
    flags["posible_duplicado"] = (m.quality_flags or {}).get("posible_duplicado", False)
    m.quality_flags = flags
    m.updated_by = ctx.user.id
    db.flush()
    record_audit(db, action="militante.doc.upload", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="militante", entity_id=m.id)
    db.commit()
    db.refresh(m)
    return m


def panorama(db: Session, ctx: CampaignContext) -> dict:
    from app.models.registro import Registro
    from app.models.seccion_electoral import SeccionElectoral

    secciones = territory_service.scope_secciones(db, ctx.user)
    bypass = ctx.is_superadmin or ctx.role == UserRole.ADMIN
    base = _militante_role_scoped(ctx)
    if not bypass:
        base = base.where(Militante.seccion.in_(secciones)) if secciones else base.where(sa.false())
    sub = base.subquery()

    total = db.execute(select(func.count()).select_from(sub)).scalar_one()

    def _count_estado(e):
        return db.execute(select(func.count()).select_from(sub).where(sub.c.estado == e)).scalar_one()
    validados, observados, registrados = _count_estado("VALIDADO"), _count_estado("OBSERVADO"), _count_estado("REGISTRADO")

    now = datetime.now(timezone.utc)
    def _since(days):
        return db.execute(select(func.count()).select_from(sub)
                          .where(sub.c.created_at >= now - timedelta(days=days))).scalar_one()

    campaign = db.get(Campaign, ctx.campaign_id) if ctx.campaign_id else None
    meta = getattr(campaign, "meta_afiliacion", None)

    # por seccion
    rows = db.execute(select(sub.c.seccion, func.count()).group_by(sub.c.seccion)).all()
    counts = {s: c for s, c in rows if s}
    codes = set(counts)
    facts = {}
    if codes:
        for f in db.execute(select(SeccionElectoral).where(
                SeccionElectoral.seccion.in_(codes), SeccionElectoral.anio == 2024)).scalars():
            facts[f.seccion] = f
    # promovidos per section (Registro), same scope
    prom = {}
    if codes:
        for s, c in db.execute(
            scoped_query(Registro, ctx).with_only_columns(Registro.seccion, func.count())
            .where(Registro.seccion.in_(codes)).group_by(Registro.seccion)
        ).all():
            prom[s] = c
    por_seccion = [{
        "seccion": s, "militantes": counts[s],
        "lista_nominal": getattr(facts.get(s), "lista_nominal", None),
        "prioridad": getattr(facts.get(s), "prioridad", None),
        "promovidos": prom.get(s, 0),
    } for s in sorted(counts, key=lambda x: -counts[x])]

    # por activista
    act_rows = db.execute(select(sub.c.activista_id, func.count()).group_by(sub.c.activista_id)).all()
    aids = {a for a, _ in act_rows if a}
    names = {}
    if aids:
        for uid, fn in db.execute(select(User.id, User.full_name).where(User.id.in_(aids))).all():
            names[uid] = fn
    por_activista = [{
        "activista_id": a, "nombre": names.get(a, "—") if a else "Sin activista",
        "militantes": c, "con_banderas": 0,
    } for a, c in sorted(act_rows, key=lambda x: -x[1])]

    return {
        "kpis": {"total": total, "validados": validados, "observados": observados,
                 "registrados": registrados, "meta": meta,
                 "ritmo_7d": _since(7), "ritmo_30d": _since(30)},
        "por_seccion": por_seccion,
        "por_activista": por_activista,
        "trend": [],  # optional: fill 14-day buckets if cheap; empty is acceptable v1
    }
