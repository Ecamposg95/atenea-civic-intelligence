"""Shared pytest fixtures.

Tests run against an in-memory SQLite database (shared via StaticPool) with the
app's ``get_db`` dependency overridden. Only the non-geometry tables are created
so the suite needs no PostGIS — tenancy/auth/pagination behavior is unaffected.
"""

import os

from cryptography.fernet import Fernet

os.environ.setdefault("FERNET_KEY", Fernet.generate_key().decode())

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.main import app
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign, CampaignMembership, Contest
from app.models.catalog import Ambito, Cargo, Coalition, CoalitionParty, Party
from app.models.census import CensusMetric
from app.models.electoral_area import ElectoralArea
from app.models.ingestion import DataSource, IngestRun
from app.models.organization import Organization
from app.models.registro import Registro
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
        for email in ("lider@alpha.gov", "activista1@alpha.gov", "activista2@alpha.gov"):
            u = db.execute(select(User).where(User.email == email)).scalar_one()
            db.add(CampaignMembership(user_id=u.id, campaign_id=camp.id, role=u.role))
        beta_act = db.execute(select(User).where(User.email == "activista_beta@beta.gov")).scalar_one()
        db.add(CampaignMembership(user_id=beta_act.id, campaign_id=beta_camp.id, role=beta_act.role))
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
