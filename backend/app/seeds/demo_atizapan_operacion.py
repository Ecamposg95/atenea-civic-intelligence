"""Seed AZ-4 (gateado, una sola vez): operación sintética para la campaña de Atizapán.
Determinista (random.Random(15013)); personas y claves FICTICIAS; marcador
``Registro.promotor == "demo-seed"``. Nunca loguea claves."""
from __future__ import annotations

import logging
import os
import random
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import crypto
from app.dependencies import CampaignContext
from app.models.campaign import Campaign
from app.models.militante import Militante
from app.models.registro import Registro
from app.models.seccion_electoral import SeccionElectoral
from app.models.user import User, UserRole
from app.seeds.demo_atizapan import _APELLIDOS, _NOMBRES, EMAIL_DOMAIN, zonas
from app.services import militante_service, privacy_service

logger = logging.getLogger(__name__)

MARCADOR = "demo-seed"
N_PROMOVIDOS = 6000
N_MILITANTES = 1200
SEMANAS = 12
ZONAS_SILENCIOSAS = (3, 7)          # sin capturas en la última semana ISO completa (O2/O4)
_PESO = {"ALTA_PERSUADIBLE": 1.6, "COMPETITIVA": 1.6, "RECUPERAR_OPOSICION": 1.0, "DEFENDER_EXPANDIR": 0.6}
COLONIAS = ["Lomas de Atizapán", "Las Alamedas", "Ciudad Adolfo López Mateos Centro", "Lomas de San Miguel",
            "Rancho San Juan", "El Potrero", "Villas de la Hacienda", "Las Colonias", "Lomas Lindas",
            "Ex-Hacienda El Pedregal", "Bosques de Ixtacala", "Calacoaya", "Lomas de Bellavista",
            "México Nuevo", "Hogares de Atizapán", "Jardines de Atizapán", "Las Peñitas", "Los Olivos",
            "San Juan Bosco", "Lázaro Cárdenas", "Ampliación Emiliano Zapata", "Prados Ixtacala",
            "Lomas de Monte María", "Villa de las Palmas", "El Cerrito", "Ampliación Peñitas",
            "Lomas de Guadalupe", "Margarita Maza de Juárez", "Zona Esmeralda", "La Condesa"]


def _ctx(db: Session, campaign: Campaign, user: User) -> CampaignContext:
    return CampaignContext(user=user, organization_id=campaign.organization_id, role=user.role,
                           campaign_id=campaign.id, municipio_code=campaign.municipio_code)


def distribuir(total: int, pesos: dict[str, float]) -> dict[str, int]:
    suma = sum(pesos.values()) or 1.0
    exact = {k: total * v / suma for k, v in pesos.items()}
    out = {k: int(v) for k, v in exact.items()}
    faltan = total - sum(out.values())
    for k in sorted(exact, key=lambda k: exact[k] - out[k], reverse=True)[:faltan]:
        out[k] += 1
    return out


def clave_ficticia(rng: random.Random, apellidos: str, nacimiento: date, sexo: str, n: int) -> str:
    # `rng` no se usa (firma estable); la clave es función pura de sus argumentos.
    letras = "".join(ch for ch in apellidos.upper() if ch.isalpha())[:6].ljust(6, "X")
    return f"{letras}{nacimiento:%y%m%d}15{sexo}{n % 1000:03d}"


def clave_unica(rng: random.Random, apellidos: str, nacimiento: date, sexo: str, n: int,
                seen: set[str]) -> str:
    """Como clave_ficticia pero única por construcción: si ya existe, avanza la fecha un día."""
    clave = clave_ficticia(rng, apellidos, nacimiento, sexo, n)
    while clave in seen:
        nacimiento += timedelta(days=1)
        clave = clave_ficticia(rng, apellidos, nacimiento, sexo, n)
    seen.add(clave)
    return clave


def ya_sembrado(db: Session, campaign: Campaign) -> bool:
    return db.execute(select(Registro.id).where(
        Registro.campaign_id == campaign.id, Registro.promotor == MARCADOR).limit(1)).first() is not None


def _estructura(db: Session, campaign: Campaign) -> tuple[list[User], dict[str, list[User]]]:
    """(líderes ordenados por zona, {sección: [activistas de la zona]})."""
    users = db.execute(select(User).where(User.organization_id == campaign.organization_id,
                                          User.email.like(f"%@{EMAIL_DOMAIN}"))).scalars().all()
    lideres = sorted([u for u in users if u.role == UserRole.LIDER], key=lambda u: u.email)
    act_por_lider = {l.id: sorted([u for u in users if u.role == UserRole.ACTIVISTA and u.lider_id == l.id],
                                  key=lambda u: u.email) for l in lideres}
    secciones = [f.seccion for f in db.execute(select(SeccionElectoral).where(
        SeccionElectoral.municipio_code == campaign.municipio_code, SeccionElectoral.anio == 2024)).scalars()]
    por_seccion: dict[str, list[User]] = {}
    for lider, bloque in zip(lideres, zonas(secciones, len(lideres))):
        for s in bloque:
            por_seccion[s] = act_por_lider[lider.id]
    return lideres, por_seccion


def activistas_de_zonas(db: Session, campaign: Campaign, zonas_idx: tuple[int, ...]) -> set[str]:
    lideres, _ = _estructura(db, campaign)
    ids = set()
    for z in zonas_idx:
        lider = lideres[z - 1]
        ids.update(u.id for u in db.execute(select(User).where(User.lider_id == lider.id)).scalars())
    return ids


def generar_registros(db: Session, campaign: Campaign, rng: random.Random, hoy: date) -> list[Registro]:
    notice = privacy_service.get_active_notice(db, _ctx(db, campaign, db.execute(
        select(User).where(User.email == f"coordinador@{EMAIL_DOMAIN}")).scalar_one()))
    facts = db.execute(select(SeccionElectoral).where(
        SeccionElectoral.municipio_code == campaign.municipio_code, SeccionElectoral.anio == 2024)).scalars().all()
    facts.sort(key=lambda f: int(f.seccion))  # orden determinista (sin depender del SQL)
    lideres, act_por_seccion = _estructura(db, campaign)
    silenciosos = activistas_de_zonas(db, campaign, ZONAS_SILENCIOSAS)
    cupos = distribuir(N_PROMOVIDOS, {f.seccion: (f.lista_nominal or 1) * _PESO.get(f.prioridad or "", 1.0) for f in facts})
    inicio_actual = hoy - timedelta(days=hoy.weekday())
    ult_ini = inicio_actual - timedelta(days=7)
    inicio = hoy - timedelta(weeks=SEMANAS)

    out: list[Registro] = []
    seen: set[str] = set()
    n = 0
    for f in facts:
        acts = act_por_seccion.get(f.seccion) or []
        for i in range(cupos.get(f.seccion, 0)):
            n += 1
            sexo = rng.choice("HM")            # H/M: convención INE para la clave
            sexo_db = "M" if sexo == "H" else "F"  # M/F: convención del modelo Registro
            nombre = f"{rng.choice(_NOMBRES)} {rng.choice(_APELLIDOS)} {rng.choice(_APELLIDOS)}"
            apellidos = " ".join(nombre.split()[1:])
            edad = rng.randint(18, 85)
            nac = date(hoy.year - edad, rng.randint(1, 12), rng.randint(1, 28))
            act = acts[n % len(acts)] if acts else None
            dia = inicio + timedelta(days=rng.randint(0, SEMANAS * 7 - 1))
            if act is not None and act.id in silenciosos and dia >= ult_ini:
                dia -= timedelta(days=14)
            creado = datetime.combine(dia, time(rng.randint(8, 20), rng.randint(0, 59)), tzinfo=timezone.utc)
            clave = clave_unica(rng, apellidos, nac, sexo, n, seen)
            out.append(Registro(
                organization_id=campaign.organization_id, campaign_id=campaign.id,
                activista_id=act.id if act else None, nombre_completo=nombre, seccion=f.seccion,
                direccion=f"Calle {rng.randint(1, 60)} No. {rng.randint(1, 250)}", colonia=rng.choice(COLONIAS),
                telefono=f"55{rng.randint(10000000, 99999999)}", sexo=sexo_db, edad=edad, promotor=MARCADOR,
                clave_elector_enc=crypto.encrypt_clave(clave), clave_masked=crypto.mask_clave(clave),
                consentimiento=True, consentimiento_at=creado, aviso_version=notice.version,
                created_at=creado, created_by=act.id if act else None))
    # El equipo "lleva trabajando" desde el inicio de la operación: sin esto, la regla
    # O4 (inactivos) los descarta como "recién dados de alta" y nunca dispara.
    alta = datetime.combine(inicio, time(8, 0), tzinfo=timezone.utc)
    for u in {u.id: u for lista in act_por_seccion.values() for u in lista}.values():
        u.created_at = alta
    db.add_all(out)
    db.flush()
    return out


def generar_militantes(db: Session, campaign: Campaign, registros: list[Registro], rng: random.Random) -> list[Militante]:
    coord = db.execute(select(User).where(User.email == f"coordinador@{EMAIL_DOMAIN}")).scalar_one()
    ctx = _ctx(db, campaign, coord)
    notice = privacy_service.get_active_notice(db, ctx)
    primero = militante_service._next_folio(db, ctx)
    prefix, base = primero.rsplit("-", 1)
    out: list[Militante] = []
    paso = max(1, len(registros) // N_MILITANTES)
    for k, r in enumerate(registros[::paso][:N_MILITANTES]):
        u = rng.random()
        estado = "VALIDADO" if u < 0.70 else "REGISTRADO" if u < 0.95 else "OBSERVADO"
        curp = f"{r.nombre_completo[:4].upper():X<4}{r.created_at:%y%m%d}{'H' if r.sexo == 'M' else 'M'}MC{k % 100:02d}AB{k % 10}"
        out.append(Militante(
            organization_id=campaign.organization_id, campaign_id=campaign.id, activista_id=r.activista_id,
            nombre_completo=r.nombre_completo, sexo=r.sexo, seccion=r.seccion, telefono=r.telefono,
            colonia=r.colonia, municipio="Atizapán de Zaragoza", estado_domicilio="México",
            folio=f"{prefix}-{int(base) + k:05d}", fecha_afiliacion=r.created_at.date(),
            curp_enc=crypto.encrypt_clave(curp), curp_masked=f"****{curp[-4:]}",
            clave_elector_enc=r.clave_elector_enc, clave_masked=r.clave_masked, estado=estado,
            validado_por=coord.id if estado == "VALIDADO" else None,
            validado_at=r.created_at if estado == "VALIDADO" else None,
            consentimiento=True, consentimiento_at=r.created_at, aviso_version=notice.version,
            manifestacion_voluntad=True, promotor=MARCADOR, created_at=r.created_at, created_by=r.activista_id))
    db.add_all(out)
    db.flush()
    return out


# --- Parte 2: casos, minutas/acuerdos, agenda, planes, orquestador ---------------------------
from sqlalchemy import delete  # noqa: E402

from app.models.atencion import Caso, CasoEvento  # noqa: E402
from app.models.minuta import Acuerdo, Minuta  # noqa: E402
from app.models.operacion import AgendaItem, SeccionPlan  # noqa: E402
from app.services import caso_service  # noqa: E402
from app.services.operacion_service import suggest_meta  # noqa: E402

N_CASOS, N_MINUTAS, N_ACUERDOS, N_AGENDA_POR_FASE = 60, 12, 40, 10
CASOS_VENCIDOS, CASOS_TERMINALES = 24, 21
ACUERDOS_VENCIDOS = 10
_TITULOS_CASO = ["Falta de agua en la colonia", "Bache en calle principal", "Luminaria fundida",
                 "Solicitud de patrullaje", "Fuga de drenaje", "Poda de árbol peligroso",
                 "Recolección de basura irregular", "Apoyo para despensa", "Gestión de acta de nacimiento",
                 "Reparación de banqueta", "Semáforo descompuesto", "Apoyo médico para adulto mayor"]
_PROBLEMAS = ["Agua", "Seguridad", "Baches", "Alumbrado", "Basura", "Transporte", "Drenaje"]
_AGENDA = {30: ["Instalar casa de campaña", "Integrar comités seccionales", "Levantar diagnóstico por colonia",
                "Capacitar activistas en captura", "Definir metas semanales", "Abrir canal de atención ciudadana",
                "Mapear liderazgos vecinales", "Calendario de recorridos", "Kit de identidad de campaña", "Padrón de simpatizantes base"],
           60: ["Recorridos en secciones competitivas", "Foros temáticos por zona", "Brigadas de servicios",
                "Revisión de avance por líder", "Segunda ola de capacitación", "Alianzas con comerciantes",
                "Jornadas de afiliación", "Control de calidad de captura", "Plan de redes por zona", "Encuesta interna"],
           90: ["Consolidar estructura de casilla", "Simulacro de defensa del voto", "Cierre de brechas en rojo",
                "Eventos masivos por zona", "Auditoría de padrón capturado", "Plan de movilización",
                "Representantes generales", "Logística día D", "Mensaje de cierre", "Evaluación final de metas"]}


def generar_casos(db: Session, campaign: Campaign, rng: random.Random, hoy: date) -> list[Caso]:
    lideres, act_por_seccion = _estructura(db, campaign)
    coord = db.execute(select(User).where(User.email == f"coordinador@{EMAIL_DOMAIN}")).scalar_one()
    ctx = _ctx(db, campaign, coord)
    primero = caso_service._next_folio(db, ctx)
    prefix, base = primero.rsplit("-", 1)
    secciones = sorted(act_por_seccion, key=int)
    lider_de_seccion = {s: acts[0].lider_id for s, acts in act_por_seccion.items() if acts}
    out = []
    # Cuotas exactas (40 % vencidos / 35 % terminales / 25 % en curso), orden mezclado.
    slots = ["V"] * CASOS_VENCIDOS + ["T"] * CASOS_TERMINALES + ["C"] * (N_CASOS - CASOS_VENCIDOS - CASOS_TERMINALES)
    rng.shuffle(slots)
    for k in range(N_CASOS):
        sec = rng.choice(secciones)
        if slots[k] == "V":
            estado, fecha = rng.choice(["PENDIENTE", "EN_PROCESO"]), hoy - timedelta(days=rng.randint(1, 20))
        elif slots[k] == "T":
            estado, fecha = rng.choice(["ATENDIDO", "CERRADO"]), hoy - timedelta(days=rng.randint(1, 30))
        else:
            estado, fecha = "EN_PROCESO", hoy + timedelta(days=rng.randint(1, 10))
        creado = datetime.combine(hoy - timedelta(days=rng.randint(5, 60)), time(10, 0), tzinfo=timezone.utc)
        c = Caso(organization_id=campaign.organization_id, campaign_id=campaign.id,
                 folio=f"{prefix}-{int(base) + k:05d}", tipo=rng.choice(["PETICION", "QUEJA", "APOYO", "OTRO"]),
                 titulo=rng.choice(_TITULOS_CASO), descripcion="Reporte vecinal levantado en recorrido (demo).",
                 ciudadano_nombre=f"{rng.choice(_NOMBRES)} {rng.choice(_APELLIDOS)}",
                 seccion=sec, colonia=rng.choice(COLONIAS), asignado_a=lider_de_seccion.get(sec, lideres[0].id),
                 estado=estado, prioridad=rng.choice(["ALTA", "MEDIA", "BAJA"]), fecha_compromiso=fecha,
                 created_at=creado, created_by=coord.id)
        db.add(c)
        db.flush()
        db.add(CasoEvento(organization_id=campaign.organization_id, caso_id=c.id, tipo="CAMBIO_ESTADO",
                          estado_nuevo="PENDIENTE", actor_id=coord.id, created_at=creado))
        out.append(c)
    db.flush()
    return out


def generar_minutas(db: Session, campaign: Campaign, rng: random.Random, hoy: date) -> tuple[list[Minuta], list[Acuerdo]]:
    lideres, _ = _estructura(db, campaign)
    coord = db.execute(select(User).where(User.email == f"coordinador@{EMAIL_DOMAIN}")).scalar_one()
    asistentes = [{"user_id": coord.id, "nombre": coord.full_name}] + [{"user_id": l.id, "nombre": l.full_name} for l in lideres]
    minutas, acuerdos = [], []
    lunes = hoy - timedelta(days=hoy.weekday())
    for w in range(N_MINUTAS):
        fecha = lunes - timedelta(weeks=N_MINUTAS - 1 - w)
        m = Minuta(organization_id=campaign.organization_id, campaign_id=campaign.id,
                   titulo=f"Coordinación semanal · semana {w + 1}", fecha=fecha, lugar="Casa de campaña",
                   tipo="REUNION", asistentes=asistentes, estado="PUBLICADA",
                   cuerpo="Revisión de avance por zona, casos abiertos y logística (demo).", created_by=coord.id)
        db.add(m)
        db.flush()
        minutas.append(m)
    por_minuta = distribuir(N_ACUERDOS, {m.id: 1.0 for m in minutas})
    plan = [(m, i, m.fecha + timedelta(days=rng.randint(3, 21))) for m in minutas for i in range(por_minuta[m.id])]
    candidatos = [k for k, (_, _, lim) in enumerate(plan) if lim < hoy]
    pendientes = set(rng.sample(candidatos, ACUERDOS_VENCIDOS))  # cuota exacta de vencidos PENDIENTE
    for k, (m, i, limite) in enumerate(plan):
        if k in pendientes:
            estado = "PENDIENTE"
        else:
            estado = "CUMPLIDO" if limite < hoy else "EN_CURSO"
        a = Acuerdo(organization_id=campaign.organization_id, campaign_id=campaign.id, minuta_id=m.id,
                    texto=f"{rng.choice(['Entregar', 'Revisar', 'Convocar', 'Cerrar'])} {rng.choice(['padrón de zona', 'casos de agua', 'brigada', 'reporte de avance'])}",
                    orden=i, responsable_id=rng.choice(lideres).id, fecha_limite=limite, estado=estado,
                    created_by=coord.id)
        db.add(a)
        acuerdos.append(a)
    db.flush()
    return minutas, acuerdos


def generar_agenda(db: Session, campaign: Campaign, rng: random.Random) -> list[AgendaItem]:
    out = []
    for fase, titulos in _AGENDA.items():
        for i, t in enumerate(titulos):
            out.append(AgendaItem(organization_id=campaign.organization_id, campaign_id=campaign.id, fase=fase,
                                  titulo=t, orden=i, done=(fase == 30 and i < 8) or (fase == 60 and i < 4)))
    db.add_all(out)
    db.flush()
    return out


def generar_planes(db: Session, campaign: Campaign) -> list[SeccionPlan]:
    _, act_por_seccion = _estructura(db, campaign)
    facts = db.execute(select(SeccionElectoral).where(
        SeccionElectoral.municipio_code == campaign.municipio_code, SeccionElectoral.anio == 2024)).scalars().all()
    facts.sort(key=lambda f: int(f.seccion))
    rng = random.Random(1)
    out = []
    for f in facts:
        acts = act_por_seccion.get(f.seccion) or []
        out.append(SeccionPlan(organization_id=campaign.organization_id, campaign_id=campaign.id, seccion=f.seccion,
                               responsable_id=acts[0].lider_id if acts else None,
                               problema_dominante=rng.choice(_PROBLEMAS), meta_semanal=suggest_meta(f.prioridad),
                               prioridad_operativa=f.prioridad))
    db.add_all(out)
    db.flush()
    return out


def _campaign(db: Session) -> Optional[Campaign]:
    from app.models.organization import Organization
    from app.seeds.demo_atizapan import CAMPAIGN_NAME
    slug = os.getenv("SEED_DEMO_ATIZAPAN_ORG_SLUG", "atizapan")
    org = db.execute(select(Organization).where(Organization.slug == slug)).scalar_one_or_none()
    if org is None:
        return None
    return db.execute(select(Campaign).where(Campaign.organization_id == org.id,
                                             Campaign.name == CAMPAIGN_NAME)).scalar_one_or_none()


def seed_atizapan_operacion(db: Session, hoy: Optional[date] = None) -> bool:
    if os.getenv("SEED_DEMO_ATIZAPAN", "").lower() != "true":
        return False
    campaign = _campaign(db)
    if campaign is None or ya_sembrado(db, campaign):
        return False
    hoy = hoy or date.today()
    rng = random.Random(15013)
    regs = generar_registros(db, campaign, rng, hoy)
    generar_militantes(db, campaign, regs, rng)
    generar_casos(db, campaign, rng, hoy)
    generar_minutas(db, campaign, rng, hoy)
    generar_agenda(db, campaign, rng)
    generar_planes(db, campaign)
    db.commit()
    logger.info("Atizapán operación sintética sembrada: %d promovidos", len(regs))
    return True


def reset_operacion(db: Session, campaign: Campaign) -> dict[str, int]:
    """Borra, en la campaña dada: registros y militantes SOLO con marcador "demo-seed"; y TODOS los
    casos, eventos de caso, acuerdos, minutas, agenda y planes de la campaña (sin filtro de marcador,
    pensado para la campaña demo). Uso local o de rescate; nunca en el lifespan."""
    cid = campaign.id
    counts = {}
    caso_ids = [i for (i,) in db.execute(select(Caso.id).where(Caso.campaign_id == cid)).all()]
    db.execute(delete(CasoEvento).where(CasoEvento.caso_id.in_(caso_ids or ["-"])))
    for name, model, cond in (
        ("registros", Registro, (Registro.campaign_id == cid) & (Registro.promotor == MARCADOR)),
        ("militantes", Militante, (Militante.campaign_id == cid) & (Militante.promotor == MARCADOR)),
        ("casos", Caso, Caso.campaign_id == cid),
        ("acuerdos", Acuerdo, Acuerdo.campaign_id == cid),
        ("minutas", Minuta, Minuta.campaign_id == cid),
        ("agenda", AgendaItem, AgendaItem.campaign_id == cid),
        ("planes", SeccionPlan, SeccionPlan.campaign_id == cid),
    ):
        counts[name] = db.execute(delete(model).where(cond)).rowcount
    db.commit()
    return counts
