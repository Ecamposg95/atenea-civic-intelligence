"""Reglas de Alertas con BD: O3 casos SLA, O4 activistas inactivos, O5 acuerdos
vencidos — y aislamiento entre campañas. Los conteos se prueban por delta porque
la BD de pruebas es compartida entre archivos."""
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, select

from tests.conftest import ALPHA_CAMPAIGN_ID, BETA_CAMPAIGN_ID, PASSWORD, TestingSessionLocal
from app.core.security import hash_password
from app.dependencies import CampaignContext
from app.models.atencion import Caso
from app.models.campaign import CampaignMembership
from app.models.minuta import Acuerdo, Minuta
from app.models.registro import Registro
from app.models.user import User, UserRole
from app.services import alerta_service as svc

_MARK = "TEST_ALERTAS"
_HOY = datetime.now(timezone.utc).date()


def _now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _ctx(db, email: str, campaign_id: str) -> CampaignContext:
    u = db.execute(select(User).where(User.email == email)).scalar_one()
    return CampaignContext(user=u, organization_id=u.organization_id, role=u.role,
                           campaign_id=campaign_id)


@pytest.fixture
def db():
    s = TestingSessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        ids = [u.id for u in s.execute(select(User).where(User.email.like("%alertas%"))).scalars()]
        s.execute(delete(Registro).where(Registro.nombre_completo.like(f"{_MARK}%")))
        s.execute(delete(Caso).where(Caso.titulo.like(f"{_MARK}%")))
        s.execute(delete(Acuerdo).where(Acuerdo.texto.like(f"{_MARK}%")))
        s.execute(delete(Minuta).where(Minuta.titulo.like(f"{_MARK}%")))
        if ids:
            s.execute(delete(CampaignMembership).where(CampaignMembership.user_id.in_(ids)))
            s.execute(delete(User).where(User.id.in_(ids)))
        s.commit()
        s.close()


def _caso(ctx, folio, fecha, estado="PENDIENTE", campaign_id=ALPHA_CAMPAIGN_ID):
    return Caso(organization_id=ctx.organization_id, campaign_id=campaign_id, folio=folio,
                tipo="QUEJA", titulo=f"{_MARK} caso", estado=estado, fecha_compromiso=fecha)


def _o3_valor(db, ctx) -> int:
    out = svc.regla_casos(db, ctx, _HOY)
    return int(out[0]["valor"]) if out else 0


def test_o3_cuenta_solo_casos_abiertos_vencidos(db):
    ctx = _ctx(db, "coord@alpha.gov", ALPHA_CAMPAIGN_ID)
    antes = _o3_valor(db, ctx)
    ayer, manana = _HOY - timedelta(days=1), _HOY + timedelta(days=1)
    db.add_all([
        _caso(ctx, "AC-TEST-A1", ayer),
        _caso(ctx, "AC-TEST-A2", ayer),
        _caso(ctx, "AC-TEST-A3", ayer, estado="CERRADO"),   # terminal → no cuenta
        _caso(ctx, "AC-TEST-A4", manana),                   # no vencido
        _caso(ctx, "AC-TEST-A5", None),                     # sin compromiso
    ])
    db.commit()
    out = svc.regla_casos(db, ctx, _HOY)
    assert out and out[0]["clave"] == "O3:campaña"
    assert out[0]["valor"] == antes + 2
    assert out[0]["severidad"] == "alta" and out[0]["enlace"] == "/atencion/casos"


def test_o5_cuenta_solo_acuerdos_abiertos_vencidos(db):
    ctx = _ctx(db, "coord@alpha.gov", ALPHA_CAMPAIGN_ID)
    antes_out = svc.regla_acuerdos(db, ctx, _HOY)
    antes = int(antes_out[0]["valor"]) if antes_out else 0
    m = Minuta(organization_id=ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
               titulo=f"{_MARK} minuta", fecha=_HOY)
    db.add(m); db.flush()
    ayer = _HOY - timedelta(days=1)
    db.add_all([
        Acuerdo(organization_id=ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                minuta_id=m.id, texto=f"{_MARK} 1", fecha_limite=ayer, estado="PENDIENTE"),
        Acuerdo(organization_id=ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                minuta_id=m.id, texto=f"{_MARK} 2", fecha_limite=ayer, estado="EN_CURSO"),
        Acuerdo(organization_id=ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                minuta_id=m.id, texto=f"{_MARK} 3", fecha_limite=ayer, estado="CUMPLIDO"),
    ])
    db.commit()
    out = svc.regla_acuerdos(db, ctx, _HOY)
    assert out and out[0]["clave"] == "O5:campaña" and out[0]["valor"] == antes + 2
    assert out[0]["severidad"] == "media" and out[0]["enlace"] == "/acuerdos"


def _activista(db, email, dias_alta, activo=True, campaign_id=ALPHA_CAMPAIGN_ID):
    alpha_org = db.execute(select(User).where(User.email == "coord@alpha.gov")).scalar_one().organization_id
    u = User(email=email, full_name=email.split("@")[0], hashed_password=hash_password(PASSWORD),
             role=UserRole.ACTIVISTA, organization_id=alpha_org, is_active=activo,
             created_at=_now_naive() - timedelta(days=dias_alta))
    db.add(u); db.flush()
    db.add(CampaignMembership(user_id=u.id, campaign_id=campaign_id, role=UserRole.ACTIVISTA))
    return u


def _registro(db, u, dias_atras):
    db.add(Registro(organization_id=u.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                    nombre_completo=f"{_MARK} promovido", consentimiento=True,
                    activista_id=u.id, created_at=_now_naive() - timedelta(days=dias_atras)))


def test_o4_activista_inactivo(db):
    ctx = _ctx(db, "coord@alpha.gov", ALPHA_CAMPAIGN_ID)
    inactivo = _activista(db, "inactivo.alertas@alertas.test", 30)
    _registro(db, inactivo, 9)
    activo = _activista(db, "activo.alertas@alertas.test", 30)
    _registro(db, activo, 2)
    nunca = _activista(db, "nunca.alertas@alertas.test", 20)          # sin registros
    nuevo = _activista(db, "nuevo.alertas@alertas.test", 1)           # recién dado de alta
    baja = _activista(db, "baja.alertas@alertas.test", 30, activo=False)
    db.commit()
    claves = {a["clave"]: a for a in svc.regla_inactivos(db, ctx, _HOY)}
    assert f"O4:{inactivo.id}" in claves
    assert claves[f"O4:{inactivo.id}"]["valor"] == 9
    assert "hace 9 días" in claves[f"O4:{inactivo.id}"]["titulo"]
    assert f"O4:{nunca.id}" in claves
    assert "desde su alta" in claves[f"O4:{nunca.id}"]["titulo"]
    for u in (activo, nuevo, baja):
        assert f"O4:{u.id}" not in claves
    assert claves[f"O4:{inactivo.id}"]["enlace"] == "/admin/estructura"


def test_aislamiento_entre_campanas(db):
    beta = _ctx(db, "admin@beta.gov", BETA_CAMPAIGN_ID)
    alpha = _ctx(db, "coord@alpha.gov", ALPHA_CAMPAIGN_ID)
    antes = _o3_valor(db, beta)
    db.add(_caso(alpha, "AC-TEST-ISO", _HOY - timedelta(days=3)))
    u = _activista(db, "iso.alertas@alertas.test", 30)
    db.commit()
    assert _o3_valor(db, beta) == antes
    assert f"O4:{u.id}" not in {a["clave"] for a in svc.regla_inactivos(db, beta, _HOY)}
