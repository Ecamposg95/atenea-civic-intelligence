"""Seed AZ-4: operación sintética de Atizapán (determinista, una sola vez, aislada)."""
import random
from collections import Counter
from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from app.core import crypto
from app.models.atencion import Caso, CasoEvento
from app.models.campaign import CampaignMembership
from app.models.minuta import Acuerdo, Minuta
from app.models.operacion import AgendaItem, SeccionPlan
from app.models.militante import Militante
from app.models.registro import Registro
from app.models.user import User, UserRole
from app.seeds import demo_atizapan_operacion as op
from app.seeds.demo_atizapan import EMAIL_DOMAIN, seed_atizapan_campaign
from app.seeds.demo_territory import seed_territory
from app.seeds.municipios import MUNICIPIOS
from tests.conftest import TestingSessionLocal

ORG = "atizapan-op-test"


def _purgar_usuarios_demo(db):
    """Los emails demo son únicos globalmente: usuarios de otra org (otro test) romperían la estructura."""
    ids = select(User.id).where(User.email.like(f"%@{EMAIL_DOMAIN}"))
    db.execute(CampaignMembership.__table__.delete().where(CampaignMembership.user_id.in_(ids)))
    db.execute(User.__table__.update().where(User.lider_id.in_(ids)).values(lider_id=None))
    db.execute(User.__table__.delete().where(User.email.like(f"%@{EMAIL_DOMAIN}")))
    db.commit()


@pytest.fixture
def campaign(monkeypatch):
    monkeypatch.setenv("SEED_DEMO_ATIZAPAN", "true")
    monkeypatch.setenv("SEED_DEMO_ATIZAPAN_PASSWORD", "Pwd9!Pwd9!")
    monkeypatch.setenv("SEED_DEMO_ATIZAPAN_ORG_SLUG", ORG)
    monkeypatch.delenv("SEED_DEMO_ATIZAPAN_ADMIN_EMAIL", raising=False)
    db = TestingSessionLocal()
    _purgar_usuarios_demo(db)
    seed_territory(db, MUNICIPIOS["15013"])
    camp = seed_atizapan_campaign(db)
    try:
        yield db, camp
    finally:
        db.rollback()
        caso_ids = [i for (i,) in db.execute(select(Caso.id).where(Caso.campaign_id == camp.id)).all()]
        if caso_ids:
            db.execute(CasoEvento.__table__.delete().where(CasoEvento.caso_id.in_(caso_ids)))
        for model in (Militante, Registro, Caso, Acuerdo, Minuta, AgendaItem, SeccionPlan):
            db.execute(model.__table__.delete().where(model.campaign_id == camp.id))
        db.commit()
        _purgar_usuarios_demo(db)
        db.close()


def test_distribuir_mayor_resto_suma_exacta():
    d = op.distribuir(10, {"a": 1.0, "b": 1.0, "c": 1.0})
    assert sum(d.values()) == 10 and max(d.values()) - min(d.values()) <= 1


def test_clave_ficticia_formato():
    c = op.clave_ficticia(random.Random(1), "GARCIA HERNANDEZ", date(1985, 3, 9), "H", 7)
    assert len(c) == 18 and c[6:12] == "850309" and c[12:14] == "15" and c[14] == "H" and c[15:] == "007"


def test_generar_registros_volumen_distribucion_y_caida(campaign):
    db, camp = campaign
    hoy = date(2026, 9, 30)
    regs = op.generar_registros(db, camp, random.Random(15013), hoy)
    db.commit()
    assert len(regs) == op.N_PROMOVIDOS
    assert all(r.promotor == op.MARCADOR and r.campaign_id == camp.id and r.organization_id == camp.organization_id for r in regs)
    assert all(r.clave_elector_enc and r.clave_masked and r.clave_masked.startswith("****-") for r in regs)
    claves = {crypto.decrypt_clave(r.clave_elector_enc) for r in regs}
    assert len(claves) == len(regs)  # sin repetidas
    activistas = {u.id for u in db.execute(select(User).where(User.role == UserRole.ACTIVISTA,
                                                              User.organization_id == camp.organization_id)).scalars()}
    assert {r.activista_id for r in regs} <= activistas
    # última semana ISO completa: las zonas 3 y 7 no capturan
    inicio_actual = hoy - timedelta(days=hoy.weekday())
    ult_ini, ult_fin = inicio_actual - timedelta(days=7), inicio_actual
    silenciosas = op.activistas_de_zonas(db, camp, op.ZONAS_SILENCIOSAS)
    en_ventana = [r for r in regs if ult_ini <= r.created_at.date() < ult_fin]
    assert en_ventana and not any(r.activista_id in silenciosas for r in en_ventana)
    # densidad: persuadibles pesan más que defender
    por_sec = Counter(r.seccion for r in regs)
    assert len(por_sec) >= 160  # casi todas las 174 secciones reciben captura


def test_generar_militantes_20pct_folios_unicos(campaign):
    db, camp = campaign
    regs = op.generar_registros(db, camp, random.Random(15013), date(2026, 9, 30))
    db.commit()
    mils = op.generar_militantes(db, camp, regs, random.Random(7))
    db.commit()
    assert len(mils) == op.N_MILITANTES
    folios = [m.folio for m in mils]
    assert len(set(folios)) == len(folios) and all(f.startswith("ATZ-") for f in folios)
    assert Counter(m.estado for m in mils)["VALIDADO"] > len(mils) * 0.6
    assert all(m.curp_enc and m.consentimiento and m.manifestacion_voluntad for m in mils)


def test_ya_sembrado_marcador(campaign):
    db, camp = campaign
    assert op.ya_sembrado(db, camp) is False
    op.generar_registros(db, camp, random.Random(1), date(2026, 9, 30)); db.commit()
    assert op.ya_sembrado(db, camp) is True


def test_clave_unica_resuelve_colisiones():
    seen: set[str] = set()
    rng = random.Random(1)
    a = op.clave_unica(rng, "GARCIA HERNANDEZ", date(1985, 3, 9), "H", 7, seen)
    b = op.clave_unica(rng, "GARCIA HERNANDEZ", date(1985, 3, 9), "H", 1007, seen)  # mismo n % 1000
    assert a != b and len(b) == 18 and seen == {a, b}


def test_casos_sla_vencidos_y_estados(campaign):
    db, camp = campaign
    hoy = date(2026, 9, 30)
    casos = op.generar_casos(db, camp, random.Random(3), hoy)
    db.commit()
    assert len(casos) == op.N_CASOS
    vencidos = [c for c in casos if c.fecha_compromiso and c.fecha_compromiso < hoy and c.estado not in ("ATENDIDO", "CERRADO")]
    assert len(vencidos) >= op.N_CASOS * 0.35
    assert len(vencidos) == op.CASOS_VENCIDOS == 24
    assert len({c.folio for c in casos}) == len(casos)
    assert all(c.tipo in ("PETICION", "QUEJA", "APOYO", "OTRO") and c.seccion and c.asignado_a for c in casos)
    n_ev = db.execute(select(func.count()).select_from(CasoEvento).where(
        CasoEvento.caso_id.in_([c.id for c in casos]))).scalar_one()
    assert n_ev == len(casos)


def test_minutas_acuerdos_vencidos(campaign):
    db, camp = campaign
    hoy = date(2026, 9, 30)
    minutas, acuerdos = op.generar_minutas(db, camp, random.Random(5), hoy)
    db.commit()
    assert len(minutas) == op.N_MINUTAS and len(acuerdos) == op.N_ACUERDOS
    assert all(m.estado == "PUBLICADA" and len(m.asistentes) >= 9 for m in minutas)
    vencidos = [a for a in acuerdos if a.fecha_limite and a.fecha_limite < hoy and a.estado == "PENDIENTE"]
    assert len(vencidos) >= op.N_ACUERDOS * 0.2
    assert len(vencidos) == op.ACUERDOS_VENCIDOS == 10
    assert all(a.responsable_id for a in acuerdos)


def test_agenda_y_planes(campaign):
    db, camp = campaign
    agenda = op.generar_agenda(db, camp, random.Random(9)); planes = op.generar_planes(db, camp)
    db.commit()
    assert Counter(a.fase for a in agenda) == {30: 10, 60: 10, 90: 10}
    assert sum(1 for a in agenda if a.done) == 12
    assert len(planes) == 174 and all(p.responsable_id and p.meta_semanal for p in planes)


def test_orquestador_una_sola_vez_y_reset(campaign, monkeypatch):
    db, camp = campaign
    assert op.seed_atizapan_operacion(db, hoy=date(2026, 9, 30)) is True
    assert op.seed_atizapan_operacion(db, hoy=date(2026, 9, 30)) is False
    n_reg = db.execute(select(func.count()).select_from(Registro).where(Registro.campaign_id == camp.id)).scalar_one()
    assert n_reg == op.N_PROMOVIDOS
    # aislamiento: nada en la campaña Alpha
    from tests.conftest import ALPHA_CAMPAIGN_ID
    assert db.execute(select(func.count()).select_from(Registro).where(
        Registro.campaign_id == ALPHA_CAMPAIGN_ID, Registro.promotor == op.MARCADOR)).scalar_one() == 0
    hoy = date(2026, 9, 30)
    casos = db.execute(select(Caso).where(Caso.campaign_id == camp.id)).scalars().all()
    assert sum(1 for c in casos if c.fecha_compromiso < hoy and c.estado not in ("ATENDIDO", "CERRADO")) == 24
    acs = db.execute(select(Acuerdo).where(Acuerdo.campaign_id == camp.id)).scalars().all()
    assert sum(1 for a in acs if a.fecha_limite < hoy and a.estado == "PENDIENTE") == 10
    borrado = op.reset_operacion(db, camp)
    assert borrado["registros"] == op.N_PROMOVIDOS and borrado["casos"] == op.N_CASOS
    assert op.ya_sembrado(db, camp) is False
    for model in (Caso, Minuta, Acuerdo, AgendaItem, SeccionPlan, Militante):
        assert db.execute(select(func.count()).select_from(model).where(model.campaign_id == camp.id)).scalar_one() == 0


def test_generar_registros_retrodata_alta_del_equipo(campaign):
    """Regresión: sin retrodatar, O4 descarta a todo el equipo como 'recién dado de alta'."""
    db, camp = campaign
    hoy = date(2026, 9, 30)
    regs = op.generar_registros(db, camp, random.Random(15013), hoy)
    primera: dict[str, object] = {}
    for r in regs:
        if r.activista_id and (r.activista_id not in primera or r.created_at < primera[r.activista_id]):
            primera[r.activista_id] = r.created_at
    assert primera
    for uid, first in primera.items():
        alta = db.get(User, uid).created_at.replace(tzinfo=None)
        assert alta <= first.replace(tzinfo=None)
        assert alta.date() < hoy - timedelta(days=7)
