"""Seed AZ-3: org 'atizapan', re-domicilio del admin, campaña y estructura (51 usuarios)."""
import pytest
from sqlalchemy import func, select

from app.core.security import hash_password, verify_password
from app.models.campaign import Campaign, CampaignMembership, Contest
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.seeds.demo_atizapan import EMAIL_DOMAIN, seed_atizapan_campaign, zonas
from app.seeds.demo_territory import seed_territory
from app.seeds.municipios import MUNICIPIOS
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal

ORG = "atizapan-test"
ADMIN_EMAIL = "arturo.test@atlastech.mx"
PW = "AtizapanPwd9!"


def _env(monkeypatch, admin_email=ADMIN_EMAIL):
    monkeypatch.setenv("SEED_DEMO_ATIZAPAN", "true")
    monkeypatch.setenv("SEED_DEMO_ATIZAPAN_PASSWORD", PW)
    monkeypatch.setenv("SEED_DEMO_ATIZAPAN_ORG_SLUG", ORG)
    if admin_email:
        monkeypatch.setenv("SEED_DEMO_ATIZAPAN_ADMIN_EMAIL", admin_email)
    else:
        monkeypatch.delenv("SEED_DEMO_ATIZAPAN_ADMIN_EMAIL", raising=False)


@pytest.fixture
def db():
    s = TestingSessionLocal()
    seed_territory(s, MUNICIPIOS["15013"])
    try:
        yield s
    finally:
        s.close()


def test_zonas_reparte_contiguo():
    z = zonas([str(i) for i in range(1, 175)], 8)
    assert len(z) == 8 and sum(len(x) for x in z) == 174
    assert z[0][0] == "1" and z[-1][-1] == "174"
    assert max(len(x) for x in z) - min(len(x) for x in z) <= 1


def test_gate_apagado_no_hace_nada(monkeypatch, db):
    monkeypatch.delenv("SEED_DEMO_ATIZAPAN", raising=False)
    assert seed_atizapan_campaign(db) is None
    assert db.execute(select(Organization).where(Organization.slug == ORG)).scalar_one_or_none() is None


def test_seed_crea_org_campana_y_estructura(monkeypatch, db):
    _env(monkeypatch, admin_email=None)
    camp = seed_atizapan_campaign(db)
    org = db.execute(select(Organization).where(Organization.slug == ORG)).scalar_one()
    assert camp.organization_id == org.id
    assert camp.municipio_code == "15013" and camp.candidato == "Luis Montaño" and camp.partido == "Morena-PVEM-PT"
    users = db.execute(select(User).where(User.organization_id == org.id)).scalars().all()
    roles = {r: sum(1 for u in users if u.role == r) for r in UserRole}
    assert roles[UserRole.COORDINADOR] == 1 and roles[UserRole.LIDER] == 8
    assert roles[UserRole.ACTIVISTA] == 40 and roles[UserRole.CAPTURISTA] == 2
    coord = next(u for u in users if u.role == UserRole.COORDINADOR)
    assert coord.email == f"coordinador@{EMAIL_DOMAIN}" and coord.area is not None and coord.area.code == "15013"
    lideres = [u for u in users if u.role == UserRole.LIDER]
    assert all(l.coordinador_id == coord.id for l in lideres)
    activistas = [u for u in users if u.role == UserRole.ACTIVISTA]
    assert all(a.lider_id in {l.id for l in lideres} and a.seccion for a in activistas)
    assert len({a.seccion for a in activistas}) == 40
    n_mem = db.execute(select(func.count()).select_from(CampaignMembership).where(
        CampaignMembership.campaign_id == camp.id)).scalar_one()
    assert n_mem == 51
    contest = db.execute(select(Contest).where(Contest.campaign_id == camp.id)).scalar_one()
    assert str(contest.election_date) == "2027-06-06" and contest.territory_id is not None
    assert verify_password(PW, coord.hashed_password)


def test_seed_idempotente(monkeypatch, db):
    _env(monkeypatch, admin_email=None)
    seed_atizapan_campaign(db)
    seed_atizapan_campaign(db)
    org = db.execute(select(Organization).where(Organization.slug == ORG)).scalar_one()
    n = db.execute(select(func.count()).select_from(User).where(User.organization_id == org.id)).scalar_one()
    assert n == 51
    assert db.execute(select(func.count()).select_from(Campaign).where(
        Campaign.organization_id == org.id)).scalar_one() == 1


def test_rehome_superadmin_de_otra_org(monkeypatch, db):
    alpha = db.execute(select(Organization).where(Organization.slug == "alpha")).scalar_one()
    u = User(email=ADMIN_EMAIL, full_name="Arturo Test", role=UserRole.SUPERADMIN,
             organization_id=alpha.id, hashed_password=hash_password("Otra9!"))
    db.add(u); db.flush()
    db.add(CampaignMembership(user_id=u.id, campaign_id=ALPHA_CAMPAIGN_ID, role=UserRole.ADMIN)); db.commit()
    _env(monkeypatch)
    camp = seed_atizapan_campaign(db)
    db.refresh(u)
    org = db.execute(select(Organization).where(Organization.slug == ORG)).scalar_one()
    assert u.organization_id == org.id and u.role == UserRole.ADMIN
    assert verify_password("Otra9!", u.hashed_password)  # conserva contraseña
    ajenas = db.execute(select(CampaignMembership).where(
        CampaignMembership.user_id == u.id, CampaignMembership.campaign_id == ALPHA_CAMPAIGN_ID)).scalars().all()
    assert ajenas == []
    propia = db.execute(select(CampaignMembership).where(
        CampaignMembership.user_id == u.id, CampaignMembership.campaign_id == camp.id)).scalar_one()
    assert propia.role == UserRole.ADMIN


def test_rehome_ya_en_org_no_cambia_y_usuario_inexistente_se_crea(monkeypatch, db):
    _env(monkeypatch, admin_email="nuevo.admin@atlastech.mx")
    seed_atizapan_campaign(db)
    nuevo = db.execute(select(User).where(User.email == "nuevo.admin@atlastech.mx")).scalar_one()
    assert nuevo.role == UserRole.ADMIN and nuevo.must_change_password is True
    before = (nuevo.organization_id, nuevo.hashed_password)
    seed_atizapan_campaign(db)
    db.refresh(nuevo)
    assert (nuevo.organization_id, nuevo.hashed_password) == before
