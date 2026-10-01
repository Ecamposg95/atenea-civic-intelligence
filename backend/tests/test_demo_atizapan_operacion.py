"""Seed AZ-4: operación sintética de Atizapán (determinista, una sola vez, aislada)."""
import random
from collections import Counter
from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from app.core import crypto
from app.models.campaign import CampaignMembership
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
        for model in (Militante, Registro):
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
