"""Seed AZ-3 (idempotente, gateado): organización 'Atizapán 2027', re-domicilio del admin
demo (Arturo), campaña 'Atizapán de Zaragoza 2027 · Luis Montaño' y estructura
(1 coordinador, 8 líderes por zona, 40 activistas por sección, 2 capturistas).

Env:
  SEED_DEMO_ATIZAPAN=true            gate
  SEED_DEMO_ATIZAPAN_PASSWORD        contraseña común (obligatoria; sin ella → skip)
  SEED_DEMO_ATIZAPAN_ORG_SLUG        default 'atizapan'
  SEED_DEMO_ATIZAPAN_ADMIN_EMAIL     opcional: usuario a re-domiciliar como ADMIN de la org
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.campaign import Campaign, CampaignMembership, CampaignStatus
from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.organization import Organization
from app.models.seccion_electoral import SeccionElectoral
from app.models.user import User, UserRole
from app.seeds.demo_election_date import seed_election_date
from app.services.audit_service import record_audit

logger = logging.getLogger(__name__)

MUNI_CODE = "15013"
CAMPAIGN_NAME = "Atizapán de Zaragoza 2027"
CANDIDATO = "Luis Montaño"
PARTIDO = "Morena-PVEM-PT"
EMAIL_DOMAIN = "demo.atizapan.mx"
N_LIDERES, ACTIVISTAS_POR_LIDER, N_CAPTURISTAS = 8, 5, 2
_PRIORIDAD_ORDEN = {"ALTA_PERSUADIBLE": 0, "COMPETITIVA": 1, "RECUPERAR_OPOSICION": 2, "DEFENDER_EXPANDIR": 3}

_NOMBRES = ["Ana", "Luis", "María", "José", "Carmen", "Jorge", "Patricia", "Miguel", "Laura", "Ricardo",
            "Gabriela", "Fernando", "Adriana", "Héctor", "Verónica", "Raúl", "Claudia", "Sergio",
            "Alejandra", "Arturo", "Rocío", "Daniel", "Norma", "Óscar", "Leticia", "Javier", "Mónica",
            "Enrique", "Beatriz", "Rodrigo", "Guadalupe", "Francisco", "Silvia", "Andrés", "Elena",
            "Manuel", "Teresa", "Pablo", "Lorena", "Víctor", "Diana", "Roberto", "Karla", "Alberto",
            "Susana", "Ernesto", "Paola", "Gerardo", "Marisol", "Iván", "Cecilia"]
_APELLIDOS = ["García", "Hernández", "Martínez", "López", "González", "Pérez", "Rodríguez", "Sánchez",
              "Ramírez", "Cruz", "Flores", "Gómez", "Morales", "Vázquez", "Reyes", "Jiménez", "Torres",
              "Díaz", "Gutiérrez", "Ruiz", "Mendoza", "Aguilar", "Ortiz", "Castillo", "Romero",
              "Álvarez", "Chávez", "Rivera", "Juárez", "Medina", "Vargas", "Castro", "Ramos", "Guzmán",
              "Salazar", "Rojas", "Herrera", "Domínguez", "Luna", "Ibarra"]


def _nombre(i: int) -> str:
    return f"{_NOMBRES[i % len(_NOMBRES)]} {_APELLIDOS[i % len(_APELLIDOS)]} {_APELLIDOS[(i * 7 + 3) % len(_APELLIDOS)]}"


def zonas(secciones: list[str], n: int = N_LIDERES) -> list[list[str]]:
    """n bloques contiguos (por orden numérico) con tamaños que difieren a lo más en 1."""
    ordenadas = sorted(secciones, key=int)
    base, extra = divmod(len(ordenadas), n)
    out, i = [], 0
    for k in range(n):
        size = base + (1 if k < extra else 0)
        out.append(ordenadas[i:i + size])
        i += size
    return out


def _user(db: Session, email: str, **kw) -> tuple[User, bool]:
    u = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if u is not None:
        return u, False
    u = User(email=email, is_active=True, must_change_password=False, **kw)
    db.add(u)
    db.flush()
    return u, True


def _membership(db: Session, user: User, campaign: Campaign, role: UserRole) -> None:
    if db.execute(select(CampaignMembership).where(
            CampaignMembership.user_id == user.id, CampaignMembership.campaign_id == campaign.id)).scalar_one_or_none() is None:
        db.add(CampaignMembership(user_id=user.id, campaign_id=campaign.id, role=role))


def _rehome_admin(db: Session, org: Organization, campaign: Campaign, email: str, password_hash: str) -> None:
    u = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if u is None:
        u = User(email=email, full_name="Administrador Atizapán 2027", role=UserRole.ADMIN,
                 organization_id=org.id, hashed_password=password_hash, is_active=True,
                 must_change_password=True)
        db.add(u)
        db.flush()
        logger.info("Seeded admin %s in org %s", email, org.slug)
    elif u.organization_id != org.id:
        prev_org, prev_role = u.organization_id, u.role
        u.organization_id = org.id
        u.role = UserRole.ADMIN
        u.lider_id = None
        u.coordinador_id = None
        u.area_id = None
        ajenas = select(CampaignMembership.id).join(Campaign, Campaign.id == CampaignMembership.campaign_id).where(
            CampaignMembership.user_id == u.id, Campaign.organization_id != org.id)
        db.execute(delete(CampaignMembership).where(CampaignMembership.id.in_(ajenas)))
        record_audit(db, action="user.rehome", actor_id=None, organization_id=org.id,
                     entity_type="user", entity_id=u.id,
                     meta={"from_org": prev_org, "from_role": prev_role.value, "to_role": "admin"})
        logger.warning("Re-homed %s → org %s as ADMIN", email, org.slug)
    _membership(db, u, campaign, UserRole.ADMIN)


def seed_atizapan_campaign(db: Session) -> Optional[Campaign]:
    if os.getenv("SEED_DEMO_ATIZAPAN", "").lower() != "true":
        return None
    password = os.getenv("SEED_DEMO_ATIZAPAN_PASSWORD")
    if not password:
        logger.info("SEED_DEMO_ATIZAPAN_PASSWORD not set — skipping Atizapán seed")
        return None
    slug = os.getenv("SEED_DEMO_ATIZAPAN_ORG_SLUG", "atizapan")
    pw_hash = hash_password(password)

    org = db.execute(select(Organization).where(Organization.slug == slug)).scalar_one_or_none()
    if org is None:
        org = Organization(name="Atizapán 2027", slug=slug)
        db.add(org)
        db.flush()

    campaign = db.execute(select(Campaign).where(
        Campaign.organization_id == org.id, Campaign.name == CAMPAIGN_NAME)).scalar_one_or_none()
    if campaign is None:
        campaign = Campaign(name=CAMPAIGN_NAME, cycle=2027, status=CampaignStatus.ACTIVE,
                            organization_id=org.id, municipio_code=MUNI_CODE, candidato=CANDIDATO,
                            partido=PARTIDO, meta_afiliacion=8000)
        db.add(campaign)
        db.flush()

    muni = db.execute(select(ElectoralArea).where(
        ElectoralArea.code == MUNI_CODE, ElectoralArea.level == AreaLevel.MUNICIPIO)).scalar_one_or_none()
    facts = db.execute(select(SeccionElectoral).where(
        SeccionElectoral.municipio_code == MUNI_CODE, SeccionElectoral.anio == 2024)).scalars().all()
    if muni is None or not facts:
        logger.warning("Atizapán territory not seeded (SEED_DEMO_TERRITORY?) — skipping users")
        db.commit()
        return campaign
    prioridad = {f.seccion: f.prioridad for f in facts}

    coord, _ = _user(db, f"coordinador@{EMAIL_DOMAIN}", full_name=f"{_nombre(0)} — Coordinación de campaña",
                     role=UserRole.COORDINADOR, organization_id=org.id, hashed_password=pw_hash)
    if coord.area_id != muni.id:
        coord.area_id = muni.id
    _membership(db, coord, campaign, UserRole.COORDINADOR)

    idx = 1
    for z, bloque in enumerate(zonas(list(prioridad)), start=1):
        lider, _ = _user(db, f"lider{z:02d}@{EMAIL_DOMAIN}", full_name=f"{_nombre(idx)} — Líder zona {z}",
                         role=UserRole.LIDER, organization_id=org.id, coordinador_id=coord.id,
                         hashed_password=pw_hash)
        if lider.coordinador_id != coord.id:
            lider.coordinador_id = coord.id
        _membership(db, lider, campaign, UserRole.LIDER)
        idx += 1
        elegidas = sorted(bloque, key=lambda s: (_PRIORIDAD_ORDEN.get(prioridad[s], 9), int(s)))[:ACTIVISTAS_POR_LIDER]
        for k, sec in enumerate(elegidas, start=1):
            n = (z - 1) * ACTIVISTAS_POR_LIDER + k
            act, _ = _user(db, f"activista{n:02d}@{EMAIL_DOMAIN}", full_name=f"{_nombre(idx)} — Activista sección {sec}",
                           role=UserRole.ACTIVISTA, organization_id=org.id, lider_id=lider.id,
                           seccion=sec, hashed_password=pw_hash)
            if act.lider_id != lider.id:
                act.lider_id = lider.id
            _membership(db, act, campaign, UserRole.ACTIVISTA)
            idx += 1
    for c in range(1, N_CAPTURISTAS + 1):
        cap, _ = _user(db, f"capturista{c:02d}@{EMAIL_DOMAIN}", full_name=f"{_nombre(idx)} — Capturista",
                       role=UserRole.CAPTURISTA, organization_id=org.id, hashed_password=pw_hash)
        _membership(db, cap, campaign, UserRole.CAPTURISTA)
        idx += 1

    admin_email = os.getenv("SEED_DEMO_ATIZAPAN_ADMIN_EMAIL")
    if admin_email:
        _rehome_admin(db, org, campaign, admin_email.strip().lower(), pw_hash)

    db.commit()
    seed_election_date(db)  # contest 2027-06-06 + territory_id (idempotente)
    logger.info("Atizapán seed OK: org=%s campaign=%s", slug, campaign.id)
    return campaign
