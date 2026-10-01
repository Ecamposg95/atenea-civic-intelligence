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
