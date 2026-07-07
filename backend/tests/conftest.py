"""Shared pytest fixtures.

Tests run against an in-memory SQLite database (shared via StaticPool) with the
app's ``get_db`` dependency overridden. Only the non-geometry tables are created
so the suite needs no PostGIS — tenancy/auth/pagination behavior is unaffected.
"""

import os

from cryptography.fernet import Fernet

# Must be set before any app import so ElectoralArea uses Text (not PostGIS
# Geometry) and geoalchemy2's RecoverGeometryColumn hook never fires on SQLite.
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("FERNET_KEY", Fernet.generate_key().decode())
# Disable login rate limiting in tests.  The key function in
# app/core/rate_limiting.py reads this env var at *request* time and returns a
# unique UUID key when it is falsy, so no two requests share a bucket.
# The focused 429 test overrides this to "true" via monkeypatch.setenv.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.main import app
from app.models.arco import ArcoRequest
from app.models.atencion import Caso, CasoEvento, FormDefinition, FormResponse
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign, CampaignMembership, Contest
from app.models.catalog import Ambito, Cargo, Coalition, CoalitionParty, Party
from app.models.census import CensusMetric
from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.ingestion import DataSource, IngestRun
from app.models.organization import Organization
from app.models.privacy import PrivacyAcceptance, PrivacyNotice
from app.models.militante import Militante
from app.models.registro import Registro
from app.models.seccion_electoral import SeccionElectoral
from app.models.user import User, UserRole

ALPHA_CAMPAIGN_ID = "11111111-1111-1111-1111-111111111111"
BETA_CAMPAIGN_ID = "22222222-2222-2222-2222-222222222222"

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
)

# Create only the PostGIS-free tables needed for these tests. ElectoralArea's
# geometry column degrades to Text on SQLite, so its table is create_all-safe.
Base.metadata.create_all(
    engine,
    tables=[
        Organization.__table__,
        User.__table__,
        AuditLog.__table__,
        ArcoRequest.__table__,
        ElectoralArea.__table__,
        Cargo.__table__,
        Party.__table__,
        Coalition.__table__,
        CoalitionParty.__table__,
        Campaign.__table__,
        Contest.__table__,
        CampaignMembership.__table__,
        DataSource.__table__,
        IngestRun.__table__,
        CensusMetric.__table__,
        Registro.__table__,
        Militante.__table__,
        PrivacyNotice.__table__,
        PrivacyAcceptance.__table__,
        SeccionElectoral.__table__,
        FormDefinition.__table__,
        FormResponse.__table__,
        Caso.__table__,
        CasoEvento.__table__,
    ],
)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db

PASSWORD = "password123"


@pytest.fixture(scope="session", autouse=True)
def seed_data():
    """Seed two tenants with users to exercise tenant isolation."""
    db = TestingSessionLocal()
    try:
        org_a = Organization(name="Alpha Institute", slug="alpha")
        org_b = Organization(name="Beta Institute", slug="beta")
        db.add_all([org_a, org_b])
        db.flush()

        db.add_all(
            [
                User(
                    email="admin@alpha.gov",
                    full_name="Alpha Admin",
                    hashed_password=hash_password(PASSWORD),
                    role=UserRole.ADMIN,
                    organization_id=org_a.id,
                ),
                User(
                    email="viewer@alpha.gov",
                    full_name="Alpha Viewer",
                    hashed_password=hash_password(PASSWORD),
                    role=UserRole.VIEWER,
                    organization_id=org_a.id,
                ),
                User(
                    email="admin@beta.gov",
                    full_name="Beta Admin",
                    hashed_password=hash_password(PASSWORD),
                    role=UserRole.ADMIN,
                    organization_id=org_b.id,
                ),
            ]
        )
        lider = User(
            email="lider@alpha.gov", full_name="Alpha Líder",
            hashed_password=hash_password(PASSWORD), role=UserRole.LIDER,
            organization_id=org_a.id, seccion="0001",
        )
        db.add(lider)
        db.flush()
        db.add_all([
            User(email="activista1@alpha.gov", full_name="Alpha Activista 1",
                 hashed_password=hash_password(PASSWORD), role=UserRole.ACTIVISTA,
                 organization_id=org_a.id, lider_id=lider.id, phone="5550000001", seccion="0001"),
            User(email="activista2@alpha.gov", full_name="Alpha Activista 2",
                 hashed_password=hash_password(PASSWORD), role=UserRole.ACTIVISTA,
                 organization_id=org_a.id, lider_id=lider.id, seccion="0002"),
            User(email="super@atlas.gov", full_name="Platform Superadmin",
                 hashed_password=hash_password(PASSWORD), role=UserRole.SUPERADMIN,
                 organization_id=None),
            User(email="activista_beta@beta.gov", full_name="Beta Activista",
                 hashed_password=hash_password(PASSWORD), role=UserRole.ACTIVISTA,
                 organization_id=org_b.id, seccion="9001"),
        ])
        # Add COORDINADOR; wire the existing LIDER under this coordinator.
        coord = User(email="coord@alpha.gov", full_name="Alpha Coordinador",
                     hashed_password=hash_password(PASSWORD), role=UserRole.COORDINADOR,
                     organization_id=org_a.id)
        db.add(coord)
        db.flush()
        lider_u = db.execute(select(User).where(User.email == "lider@alpha.gov")).scalar_one()
        lider_u.coordinador_id = coord.id
        db.add_all([
            User(email="capturista@alpha.gov", full_name="Alpha Capturista",
                 hashed_password=hash_password(PASSWORD), role=UserRole.CAPTURISTA,
                 organization_id=org_a.id),
            User(email="consulta@alpha.gov", full_name="Alpha Consulta",
                 hashed_password=hash_password(PASSWORD), role=UserRole.CONSULTA,
                 organization_id=org_a.id),
            User(email="analyst@alpha.gov", full_name="Alpha Analyst",
                 hashed_password=hash_password(PASSWORD), role=UserRole.ANALYST,
                 organization_id=org_a.id),
        ])
        db.commit()

        # Seed an Alpha campaign with admin membership so campaign tests have data.
        alpha_admin = db.execute(select(User).where(User.email == "admin@alpha.gov")).scalar_one()
        camp = Campaign(
            id=ALPHA_CAMPAIGN_ID,
            name="Alpha 2027",
            cycle=2027,
            organization_id=org_a.id,
        )
        db.add(camp)
        db.flush()
        db.add(CampaignMembership(user_id=alpha_admin.id, campaign_id=camp.id, role=UserRole.ADMIN))
        db.add(Cargo(key="gubernatura", label="Gubernatura", ambito=Ambito.ESTATAL, territory_level="estado"))
        beta_camp = Campaign(id=BETA_CAMPAIGN_ID, name="Beta 2027", cycle=2027, organization_id=org_b.id)
        db.add(beta_camp)
        db.flush()
        for email in (
            "lider@alpha.gov", "activista1@alpha.gov", "activista2@alpha.gov",
            "viewer@alpha.gov", "coord@alpha.gov", "capturista@alpha.gov",
            "consulta@alpha.gov", "analyst@alpha.gov",
        ):
            u = db.execute(select(User).where(User.email == email)).scalar_one()
            db.add(CampaignMembership(user_id=u.id, campaign_id=camp.id, role=u.role))
        beta_act = db.execute(select(User).where(User.email == "activista_beta@beta.gov")).scalar_one()
        db.add(CampaignMembership(user_id=beta_act.id, campaign_id=beta_camp.id, role=beta_act.role))
        beta_admin_user = db.execute(select(User).where(User.email == "admin@beta.gov")).scalar_one()
        db.add(CampaignMembership(user_id=beta_admin_user.id, campaign_id=beta_camp.id, role=beta_admin_user.role))
        db.commit()

        # Seed the global platform aviso de privacidad v1 (organization_id=None).
        from sqlalchemy import select as _select

        existing_notice = db.execute(
            _select(PrivacyNotice).where(
                PrivacyNotice.organization_id.is_(None),
                PrivacyNotice.version == "v1",
            )
        ).scalar_one_or_none()
        if existing_notice is None:
            db.add(
                PrivacyNotice(
                    organization_id=None,
                    version="v1",
                    is_active=True,
                    body=(
                        "Aviso de Privacidad — versión 1.0\n\n"
                        "De conformidad con la Ley Federal de Protección de Datos "
                        "Personales en Posesión de los Particulares, sus datos personales "
                        "son recabados con fines de participación cívica y organización "
                        "electoral. El titular puede ejercer derechos ARCO ante el "
                        "responsable del tratamiento."
                    ),
                )
            )
            db.commit()
    finally:
        db.close()
    yield


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


def auth_headers(client: TestClient, email: str, password: str = PASSWORD) -> dict:
    """Log in and return an Authorization header dict."""
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ── Militante service fixtures (SPA militantes) ───────────────────────────────
# CampaignContext builders for the seeded Alpha users, plus a per-test DB session
# that cleans up militante rows so count-based assertions stay isolated.
from app.dependencies import CampaignContext  # noqa: E402


def _militante_ctx(db, email: str) -> CampaignContext:
    """Build a CampaignContext for a seeded Alpha user against the Alpha campaign."""
    user = db.execute(select(User).where(User.email == email)).scalar_one()
    return CampaignContext(
        user=user,
        organization_id=user.organization_id,
        role=user.role,
        campaign_id=ALPHA_CAMPAIGN_ID,
    )


@pytest.fixture
def db_session():
    """A TestingSessionLocal session that purges militante rows on teardown.

    Militantes and their privacy-acceptance rows are deleted after each test so
    folio counters and total-count assertions do not leak between tests.
    """
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.query(Militante).delete()
        db.query(PrivacyAcceptance).delete()
        db.commit()
        db.close()


@pytest.fixture
def activista_ctx(db_session) -> CampaignContext:
    """Seeded ACTIVISTA (activista1@alpha.gov), líder→coordinador wired in seed."""
    return _militante_ctx(db_session, "activista1@alpha.gov")


@pytest.fixture
def otro_activista_ctx(db_session) -> CampaignContext:
    """A DIFFERENT ACTIVISTA (activista2@alpha.gov) in the same campaign."""
    return _militante_ctx(db_session, "activista2@alpha.gov")


@pytest.fixture
def coordinador_ctx(db_session) -> CampaignContext:
    """Seeded COORDINADOR (coord@alpha.gov) with territory covering sección 4127.

    The coordinator owns activista1/activista2 through the seeded hierarchy
    (activista.lider_id -> lider.coordinador_id == coord.id) so role scoping
    resolves; assigning a SECCION-level area with code "4127" makes the territory
    gate (list/panorama) admit the militantes captured with seccion="4127".
    """
    coord = db_session.execute(
        select(User).where(User.email == "coord@alpha.gov")
    ).scalar_one()
    area = db_session.execute(
        select(ElectoralArea).where(
            ElectoralArea.code == "4127", ElectoralArea.level == AreaLevel.SECCION
        )
    ).scalar_one_or_none()
    if area is None:
        area = ElectoralArea(
            name="Sección 4127", code="4127", level=AreaLevel.SECCION,
            organization_id=coord.organization_id,
        )
        db_session.add(area)
        db_session.flush()
    if coord.area_id != area.id:
        coord.area_id = area.id
    db_session.commit()
    return _militante_ctx(db_session, "coord@alpha.gov")
