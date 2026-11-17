"""Captura de hojas SMA (spec 2026-11-17 §4–§5).

Paper chain: Líder → 10 activistas (Formato C1) → activista + 7 promovidos
(Formato Activista). Every person is a ``Registro`` linked by ``padre_id``.

PII rules: the clave de elector is never logged, never echoed back (messages
mention only *that* something is wrong), and the audit row carries counts/ids.
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import false, func, select
from sqlalchemy.orm import Session, aliased

from app.core import crypto
from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.audit_log import AuditLog
from app.models.registro import Registro
from app.schemas.captura_sma import (
    CatalogoOut, EstructuraActivista, EstructuraLider, EstructuraPage, EstructuraPersona,
    EstructuraResumen, FilaResultado, HojaIn, HojaOut, HojaResumen, PersonaIn, PersonaOut,
    SeccionCatalogo, TitularIn,
)
from app.seeds import sma
from app.services import privacy_service
from app.services.audit_service import record_audit

AVISO_VERSION = "papel-2027"
MAX_FILAS = {"LIDER": 10, "FAMILIA": 7}
# Sheet type → (titular tipo, row tipo)
_TIPOS = {"LIDER": ("LIDER", "ACTIVISTA"), "FAMILIA": ("ACTIVISTA", "PROMOVIDO")}

_CLAVE_RE = re.compile(r"[A-Z0-9]{18}")
_CURP_RE = re.compile(r"[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d")
_PERSONA_FIELDS = ("apellido_paterno", "apellido_materno", "nombres", "seccion",
                   "calle", "numero", "colonia", "clave_elector", "curp", "telefono")


class TitularNoEncontrado(Exception):
    pass


# ── Normalization ────────────────────────────────────────────────────────────

def _up(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = " ".join(str(v).split()).upper()
    return s or None


@dataclass
class _Persona:
    apellido_paterno: Optional[str]
    apellido_materno: Optional[str]
    nombres: Optional[str]
    seccion: Optional[str]
    calle: Optional[str]
    numero: Optional[str]
    colonia: Optional[str]
    clave: Optional[str]          # normalized (no spaces, upper) — never echoed
    curp: Optional[str]           # normalized (no spaces, upper) — never echoed
    telefono_raw: Optional[str]
    telefono: Optional[str]       # digits only
    errores: list[str] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)

    @property
    def nombre_completo(self) -> str:
        return " ".join(p for p in (self.nombres, self.apellido_paterno, self.apellido_materno) if p)

    @property
    def direccion(self) -> Optional[str]:
        return " ".join(p for p in (self.calle, self.numero) if p) or None

    @property
    def clave_hash(self) -> Optional[str]:
        return crypto.hash_clave(self.clave) if self.clave else None

    @property
    def clave_valida(self) -> bool:
        return bool(self.clave and _CLAVE_RE.fullmatch(self.clave))

    @property
    def curp_valida(self) -> bool:
        return bool(self.curp and _CURP_RE.fullmatch(self.curp))

    @property
    def curp_hash(self) -> Optional[str]:
        return crypto.hash_curp(self.curp) if self.curp else None


def _is_empty(p: PersonaIn) -> bool:
    return all(not (getattr(p, f) or "").strip() for f in _PERSONA_FIELDS)


def _normalize(p: PersonaIn) -> _Persona:
    clave = crypto.normalize_clave(p.clave_elector) if p.clave_elector else None
    curp = crypto.normalize_clave(p.curp) if p.curp else None
    tel_raw = (p.telefono or "").strip() or None
    tel = re.sub(r"\D", "", tel_raw) if tel_raw else None
    seccion = re.sub(r"\s+", "", p.seccion) if p.seccion else None
    return _Persona(
        apellido_paterno=_up(p.apellido_paterno), apellido_materno=_up(p.apellido_materno),
        nombres=_up(p.nombres), seccion=seccion or None, calle=_up(p.calle),
        numero=_up(p.numero), colonia=_up(p.colonia), clave=clave or None,
        curp=curp or None,
        telefono_raw=tel_raw, telefono=tel or None,
    )


# ── Validation ───────────────────────────────────────────────────────────────

def _validate_local(per: _Persona, secciones: frozenset[str]) -> None:
    if not per.apellido_paterno:
        per.errores.append("Falta el apellido paterno")
    if not per.nombres:
        per.errores.append("Faltan los nombres")
    if not per.seccion:
        per.errores.append("Falta la sección")
    elif per.seccion not in secciones:
        per.errores.append(f"La sección {per.seccion} no es de San Mateo Atenco")
    if per.clave is None:
        per.errores.append("Falta la clave de elector")
    elif not per.clave_valida:
        per.errores.append("La clave de elector debe tener 18 caracteres alfanuméricos")
    if per.curp is None:
        per.avisos.append("Falta la CURP")
    elif not per.curp_valida:
        per.errores.append("La CURP no tiene un formato válido")
    if per.telefono_raw is None:
        per.avisos.append("Falta el teléfono")
    elif per.telefono is None or len(per.telefono) != 10:
        per.errores.append("El teléfono debe tener 10 dígitos")


def _validate_against_db(db: Session, ctx: CampaignContext, personas: list[_Persona]) -> None:
    """Clave/nombre duplicates vs. the campaign (new captures) and legacy matches."""
    base = scoped_query(Registro, ctx)
    valid_claves = {p.clave_hash: p for p in personas if p.clave_valida}
    hashes_nuevos: set[str] = set()
    hashes_viejos: set[str] = set()
    if valid_claves:
        for h, legacy in db.execute(
            base.with_only_columns(Registro.clave_hash, Registro.legacy)
            .where(Registro.clave_hash.in_(list(valid_claves)))
        ).all():
            (hashes_viejos if legacy else hashes_nuevos).add(h)

    curps = {p.curp_hash for p in personas if p.curp_valida}
    curps_nuevos: set[str] = set()
    curps_viejos: set[str] = set()
    if curps:
        for h, legacy in db.execute(
            base.with_only_columns(Registro.curp_hash, Registro.legacy)
            .where(Registro.curp_hash.in_(list(curps)))
        ).all():
            (curps_viejos if legacy else curps_nuevos).add(h)

    nombres = {p.nombre_completo for p in personas if p.nombre_completo}
    nombres_nuevos: set[str] = set()
    nombres_viejos: set[str] = set()
    if nombres:
        up = func.upper(Registro.nombre_completo)
        for n, legacy in db.execute(
            base.with_only_columns(up, Registro.legacy).where(up.in_(list(nombres)))
        ).all():
            (nombres_viejos if legacy else nombres_nuevos).add(n)

    for p in personas:
        h = p.clave_hash if p.clave_valida else None
        if h and h in hashes_nuevos:
            p.errores.append("La clave de elector ya fue capturada en esta campaña")
        ch = p.curp_hash if p.curp_valida else None
        if ch and ch in curps_nuevos:
            p.errores.append("La CURP ya fue capturada en esta campaña")
        if p.nombre_completo and p.nombre_completo in nombres_nuevos:
            p.avisos.append("Ya existe una captura con este nombre (posible duplicado)")
        if ((h and h in hashes_viejos) or (ch and ch in curps_viejos)
                or (p.nombre_completo and p.nombre_completo in nombres_viejos)):
            p.avisos.append("Coincide con un valor viejo (se guarda como captura nueva)")


def _dup_claves_in_sheet(personas: list[_Persona]) -> None:
    claves: dict[str, int] = {}
    curps: dict[str, int] = {}
    for p in personas:
        if p.clave_valida:
            claves[p.clave] = claves.get(p.clave, 0) + 1
        if p.curp_valida:
            curps[p.curp] = curps.get(p.curp, 0) + 1
    for p in personas:
        if p.clave_valida and claves[p.clave] > 1:
            p.errores.append("La clave de elector está repetida en la hoja")
        if p.curp_valida and curps[p.curp] > 1:
            p.errores.append("La CURP está repetida en la hoja")


def _resultado(per: _Persona, index: Optional[int], rid: Optional[str] = None) -> FilaResultado:
    estado = "error" if per.errores else ("aviso" if per.avisos else "ok")
    return FilaResultado(index=index, estado=estado, mensajes=per.errores + per.avisos, id=rid)


def _find_persona(db: Session, ctx: CampaignContext, rid: Optional[str], tipo: str) -> Optional[Registro]:
    if not rid:
        return None
    return db.execute(
        scoped_query(Registro, ctx).where(
            Registro.id == rid, Registro.tipo == tipo, Registro.legacy.is_(False))
    ).scalar_one_or_none()


# ── Public API ───────────────────────────────────────────────────────────────

def catalogo() -> CatalogoOut:
    metas = sma.metas(sma.SMA_CODE)
    return CatalogoOut(
        secciones=[SeccionCatalogo(seccion=m["seccion"], barrio=m["barrio"],
                                   region=m["region"], prioridad=m["prioridad"])
                   for m in sorted(metas.values(), key=lambda m: m["seccion"])],
        barrios=sma.barrios(sma.SMA_CODE),
    )


def buscar_personas(db: Session, ctx: CampaignContext, tipo: str, q: Optional[str],
                    limit: int = 20) -> list[PersonaOut]:
    padre = aliased(Registro)
    hijo = aliased(Registro)
    hijos_sq = (
        select(func.count(hijo.id)).where(
            hijo.padre_id == Registro.id, hijo.deleted_at.is_(None), hijo.legacy.is_(False))
        .correlate(Registro).scalar_subquery()
    )
    stmt = (
        scoped_query(Registro, ctx)
        .where(Registro.tipo == tipo, Registro.legacy.is_(False))
        .outerjoin(padre, padre.id == Registro.padre_id)
        .add_columns(padre.nombre_completo, hijos_sq)
    )
    if q and q.strip():
        like = f"%{' '.join(q.split())}%"
        stmt = stmt.where(Registro.nombre_completo.ilike(like))
    rows = db.execute(stmt.order_by(Registro.nombre_completo).limit(limit)).all()
    return [
        PersonaOut(id=r.id, tipo=r.tipo, nombre_completo=r.nombre_completo, seccion=r.seccion,
                   telefono=r.telefono, padre_id=r.padre_id, padre_nombre=pn, hijos=h or 0)
        for r, pn, h in rows
    ]


def procesar_hoja(db: Session, ctx: CampaignContext, data: HojaIn) -> HojaOut:
    """Validate (and, if ``dry_run`` is false and there are no errors, write) one
    paper sheet. All-or-nothing: either every person is created or none is."""
    secciones = sma.secciones_validas(sma.SMA_CODE)
    tipo_titular, tipo_fila = _TIPOS[data.tipo_hoja]

    # Titular: existing (by id) or new.
    titular_existente: Optional[Registro] = None
    titular_per: Optional[_Persona] = None
    titular_res_errores: list[str] = []
    lider_de_titular: Optional[Registro] = None
    if data.titular.id:
        titular_existente = _find_persona(db, ctx, data.titular.id, tipo_titular)
        if titular_existente is None:
            titular_res_errores.append(
                "No se encontró el líder" if tipo_titular == "LIDER" else "No se encontró el activista")
        elif tipo_titular == "ACTIVISTA" and titular_existente.padre_id:
            lider_de_titular = db.execute(
                scoped_query(Registro, ctx).where(Registro.id == titular_existente.padre_id)
            ).scalar_one_or_none()
    elif _is_empty(data.titular):
        titular_res_errores.append(
            "Falta el líder de la hoja" if tipo_titular == "LIDER" else "Falta el activista de la hoja")
    else:
        titular_per = _normalize(data.titular)
        _validate_local(titular_per, secciones)
        if tipo_titular == "ACTIVISTA":
            lider_de_titular = _find_persona(db, ctx, data.titular.padre_id, "LIDER")
            if lider_de_titular is None:
                titular_per.errores.append("Elige el líder del activista")

    # Rows (empty ones are ignored but keep their original index).
    filas: list[tuple[int, _Persona]] = []
    for i, f in enumerate(data.filas):
        if _is_empty(f):
            continue
        per = _normalize(f)
        _validate_local(per, secciones)
        filas.append((i, per))

    personas = ([titular_per] if titular_per else []) + [p for _, p in filas]
    _dup_claves_in_sheet(personas)
    _validate_against_db(db, ctx, personas)

    if titular_per is not None:
        titular_res = _resultado(titular_per, None)
    else:
        titular_res = FilaResultado(
            index=None, estado="error" if titular_res_errores else "ok",
            mensajes=titular_res_errores,
            id=titular_existente.id if titular_existente else None)
    filas_res = [_resultado(p, i) for i, p in filas]
    ok = titular_res.estado != "error" and all(r.estado != "error" for r in filas_res)

    out = HojaOut(ok=ok, titular=titular_res, filas=filas_res, creados=0, hoja_id=None)
    if data.dry_run or not ok:
        return out

    # ── Commit: all or nothing ──
    hoja_id = str(uuid.uuid4())
    notice = privacy_service.get_active_notice(db, ctx)
    now = datetime.now(timezone.utc)
    if tipo_titular == "LIDER":
        nombre_lider = (titular_existente.nombre_completo if titular_existente
                        else titular_per.nombre_completo)
    else:
        nombre_lider = lider_de_titular.nombre_completo if lider_de_titular else None
    promotor = nombre_lider[:160] if nombre_lider else None

    def _crear(per: _Persona, tipo: str, padre_id: Optional[str]) -> Registro:
        reg = Registro(
            organization_id=ctx.organization_id, campaign_id=ctx.campaign_id,
            activista_id=ctx.user.id,
            tipo=tipo, padre_id=padre_id, hoja_id=hoja_id, legacy=False,
            apellido_paterno=per.apellido_paterno, apellido_materno=per.apellido_materno,
            nombres=per.nombres, nombre_completo=per.nombre_completo[:255],
            seccion=per.seccion, calle=per.calle, numero=per.numero,
            direccion=per.direccion, colonia=per.colonia, telefono=per.telefono,
            promotor=promotor,
            clave_elector_enc=crypto.encrypt_clave(per.clave) if per.clave else None,
            clave_masked=crypto.mask_clave(per.clave) if per.clave else None,
            clave_hash=per.clave_hash,
            curp_enc=crypto.encrypt_curp(per.curp) if per.curp else None,
            curp_masked=crypto.mask_curp(per.curp) if per.curp else None,
            curp_hash=per.curp_hash,
            consentimiento=True, consentimiento_at=now, aviso_version=AVISO_VERSION,
            created_by=ctx.user.id,
        )
        db.add(reg)
        db.flush()
        privacy_service.record_acceptance(db, ctx, reg, notice)
        return reg

    try:
        creados = 0
        if titular_existente is not None:
            titular_id = titular_existente.id
            titular_nombre = titular_existente.nombre_completo
        else:
            padre = lider_de_titular.id if (tipo_titular == "ACTIVISTA" and lider_de_titular) else None
            t = _crear(titular_per, tipo_titular, padre)
            titular_id, titular_nombre = t.id, t.nombre_completo
            out.titular.id = t.id
            creados += 1
        for (i, per), res in zip(filas, out.filas):
            r = _crear(per, tipo_fila, titular_id)
            res.id = r.id
            creados += 1
        record_audit(
            db, action="captura.hoja", actor_id=ctx.user.id,
            organization_id=ctx.organization_id, entity_type="hoja", entity_id=hoja_id,
            meta={
                "campaign_id": ctx.campaign_id,
                "tipo_hoja": data.tipo_hoja,
                "titular_id": titular_id,
                "titular_nuevo": titular_existente is None,
                "filas": len(filas),
                "creados": creados,
                "avisos": sum(1 for r in [out.titular, *out.filas] if r.estado == "aviso"),
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    out.creados = creados
    out.hoja_id = hoja_id
    return out


def mis_hojas(db: Session, ctx: CampaignContext, limit: int = 20) -> list[HojaResumen]:
    """The user's latest committed sheets in this campaign, from the
    ``captura.hoja`` audit rows (one per sheet, counts only)."""
    rows = db.execute(
        select(AuditLog).where(
            AuditLog.action == "captura.hoja",
            AuditLog.actor_id == ctx.user.id,
            AuditLog.organization_id == ctx.organization_id,
        ).order_by(AuditLog.created_at.desc()).limit(limit * 10)
    ).scalars().all()
    hojas = [a for a in rows if (a.meta or {}).get("campaign_id") == ctx.campaign_id][:limit]
    ids = {(a.meta or {}).get("titular_id") for a in hojas} - {None}
    nombres: dict[str, str] = {}
    if ids:
        nombres = dict(db.execute(
            scoped_query(Registro, ctx).with_only_columns(Registro.id, Registro.nombre_completo)
            .where(Registro.id.in_(ids))
        ).all())
    out = []
    for a in hojas:
        m = a.meta or {}
        out.append(HojaResumen(
            hoja_id=a.entity_id, tipo_hoja=m.get("tipo_hoja", ""),
            titular_id=m.get("titular_id"), titular_nombre=nombres.get(m.get("titular_id")),
            titular_nuevo=bool(m.get("titular_nuevo")), filas=int(m.get("filas", 0)),
            created_at=a.created_at,
        ))
    return out


# ── Estructura del papel ─────────────────────────────────────────────────────

def _estructura_base(db: Session, ctx: CampaignContext):
    """Visible non-legacy registros. ADMIN/COORDINADOR/superadmin: whole campaign
    (``scoped_query``). LIDER: the same scope as ``GET /promovidos`` (hierarchy
    + territory), so the tree never shows more than the Lista does."""
    from app.models.user import UserRole
    from app.services import promovido_service, territory_service

    if ctx.is_superadmin or ctx.role in (UserRole.ADMIN, UserRole.COORDINADOR):
        stmt = scoped_query(Registro, ctx)
    else:
        stmt = promovido_service._promovido_role_scoped(ctx)
        secciones = territory_service.scope_secciones(db, ctx.user)
        stmt = stmt.where(Registro.seccion.in_(secciones) if secciones else false())
    return stmt.where(Registro.legacy.is_(False))


def estructura(db: Session, ctx: CampaignContext, *, seccion: Optional[str], q: Optional[str],
               limit: int, offset: int) -> EstructuraPage:
    """Paper structure Líder → Activistas → Promovidos, paginated by líder.

    ``q`` matches any name in a líder's tree (líder, activista or promovido);
    ``seccion`` matches the líder's or any of its activistas' sección. Names,
    secciones and counts only — never clave/CURP."""
    meta_act, meta_prom = MAX_FILAS["LIDER"], MAX_FILAS["FAMILIA"]
    base = _estructura_base(db, ctx).subquery()
    R = aliased(Registro, base)

    personas = db.execute(
        select(R.id, R.tipo, R.nombre_completo, R.seccion, R.padre_id)
        .where(R.tipo.in_(("LIDER", "ACTIVISTA")))
    ).all()
    lideres = {p.id: p for p in personas if p.tipo == "LIDER"}
    acts_de: dict[str, list] = {}
    for p in personas:
        if p.tipo == "ACTIVISTA" and p.padre_id in lideres:
            acts_de.setdefault(p.padre_id, []).append(p)
    n_prom: dict[str, int] = dict(db.execute(
        select(R.padre_id, func.count()).where(R.tipo == "PROMOVIDO", R.padre_id.is_not(None))
        .group_by(R.padre_id)
    ).all())

    # ── filters ──
    candidatos = set(lideres)
    if seccion and seccion.strip():
        s = seccion.strip()
        candidatos = {lid for lid in candidatos
                      if lideres[lid].seccion == s or any(a.seccion == s for a in acts_de.get(lid, []))}
    if q and q.strip():
        needle = " ".join(q.split()).upper()
        hit = {lid for lid in candidatos
               if needle in (lideres[lid].nombre_completo or "").upper()
               or any(needle in (a.nombre_completo or "").upper() for a in acts_de.get(lid, []))}
        # promovido names live one level deeper → resolve through their activista
        act_padre = {a.id: lid for lid in candidatos for a in acts_de.get(lid, [])}
        if act_padre:
            prom_hits = db.execute(
                select(R.padre_id).where(
                    R.tipo == "PROMOVIDO", R.padre_id.in_(list(act_padre)),
                    func.upper(R.nombre_completo).like(f"%{needle}%"))
            ).scalars().all()
            hit |= {act_padre[a] for a in prom_hits if a in act_padre}
        candidatos = hit

    orden = sorted(candidatos, key=lambda lid: (lideres[lid].nombre_completo or "", lid))

    def _completas(lid: str) -> int:
        return sum(1 for a in acts_de.get(lid, []) if n_prom.get(a.id, 0) >= meta_prom)

    resumen = EstructuraResumen(
        lideres=len(orden),
        activistas=sum(len(acts_de.get(lid, [])) for lid in orden),
        promovidos=sum(n_prom.get(a.id, 0) for lid in orden for a in acts_de.get(lid, [])),
        familias_completas=sum(_completas(lid) for lid in orden),
        lideres_completos=sum(1 for lid in orden if len(acts_de.get(lid, [])) >= meta_act),
    )

    pagina = orden[offset:offset + limit]
    pag_acts = [a.id for lid in pagina for a in acts_de.get(lid, [])]
    proms_de: dict[str, list[EstructuraPersona]] = {}
    if pag_acts:
        for p in db.execute(
            select(R.id, R.nombre_completo, R.seccion, R.padre_id)
            .where(R.tipo == "PROMOVIDO", R.padre_id.in_(pag_acts))
            .order_by(R.nombre_completo, R.id)
        ).all():
            proms_de.setdefault(p.padre_id, []).append(
                EstructuraPersona(id=p.id, nombre_completo=p.nombre_completo, seccion=p.seccion))

    items = []
    for lid in pagina:
        lider = lideres[lid]
        acts = sorted(acts_de.get(lid, []), key=lambda a: (a.nombre_completo or "", a.id))
        items.append(EstructuraLider(
            id=lider.id, nombre_completo=lider.nombre_completo, seccion=lider.seccion,
            activistas=[EstructuraActivista(id=a.id, nombre_completo=a.nombre_completo,
                                            seccion=a.seccion, promovidos=proms_de.get(a.id, []))
                        for a in acts],
            total_promovidos=sum(n_prom.get(a.id, 0) for a in acts),
            familias_completas=_completas(lid),
        ))
    return EstructuraPage(items=items, total=len(orden), limit=limit, offset=offset,
                          meta_activistas=meta_act, meta_promovidos=meta_prom, resumen=resumen)
