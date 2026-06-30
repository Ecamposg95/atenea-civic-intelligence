"""Tests for the idempotent demo-activist bootstrap seed.

Uses the existing conftest SQLite session (tables already created).  A private
"demo-test" org is created once per module so demo-seed users never appear in
the alpha/beta orgs that tenancy tests count.  We monkeypatch
``app.bootstrap.SessionLocal`` so the helper writes into the same in-memory DB
as the rest of the test suite.
"""

import pytest
from sqlalchemy import select

from app.models.campaign import Campaign, CampaignMembership
from app.models.organization import Organization
from app.models.user import User, UserRole

# We import TestingSessionLocal from conftest via the normal conftest mechanism
# (it's available as a module-level name in the conftest, not as a fixture).
from tests.conftest import TestingSessionLocal

# ---------------------------------------------------------------------------
# Module-level org fixture: isolated from alpha/beta so tenancy counts stay
# at the values the tenancy tests expect.
# ---------------------------------------------------------------------------

DEMO_ORG_SLUG = "demo-seed-test"

# Ensure the org exists once for the whole module.
with TestingSessionLocal() as _db:
    _existing = _db.execute(
        select(Organization).where(Organization.slug == DEMO_ORG_SLUG)
    ).scalar_one_or_none()
    if _existing is None:
        _db.add(Organization(name="Demo Seed Test Org", slug=DEMO_ORG_SLUG))
        _db.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

LUCY_EMAIL = "lucy.seedtest@demo.agora.mx"
LIDER_EMAIL = "lider.seedtest@demo.agora.mx"
ACTIVISTA_EMAIL = "activista.seedtest@demo.agora.mx"
CAPTURISTA_EMAIL = "capturista.seedtest@demo.agora.mx"
LUCY_PW = "LucyPwd9!"
LIDER_PW = "LiderPwd9!"
ACTIVISTA_PW = "ActivistaPwd9!"
CAPTURISTA_PW = "CapturistaPwd9!"
CAMPAIGN_NAME = "Campaña Seed Test 2027"


def _call_seed(monkeypatch, *, with_capturista: bool = True):
    """Monkeypatch SessionLocal + envs, then call _seed_demo_activists."""
    import app.bootstrap as bs

    monkeypatch.setattr(bs, "SessionLocal", TestingSessionLocal)
    monkeypatch.setenv("SEED_LUCY_EMAIL", LUCY_EMAIL)
    monkeypatch.setenv("SEED_LUCY_PASSWORD", LUCY_PW)
    monkeypatch.setenv("SEED_LIDER_EMAIL", LIDER_EMAIL)
    monkeypatch.setenv("SEED_LIDER_PASSWORD", LIDER_PW)
    monkeypatch.setenv("SEED_ACTIVISTA_EMAIL", ACTIVISTA_EMAIL)
    monkeypatch.setenv("SEED_ACTIVISTA_PASSWORD", ACTIVISTA_PW)
    monkeypatch.setenv("SEED_ORG_SLUG", DEMO_ORG_SLUG)  # isolated org
    monkeypatch.setenv("SEED_DEMO_CAMPAIGN_NAME", CAMPAIGN_NAME)

    if with_capturista:
        monkeypatch.setenv("SEED_CAPTURISTA_EMAIL", CAPTURISTA_EMAIL)
        monkeypatch.setenv("SEED_CAPTURISTA_PASSWORD", CAPTURISTA_PW)
    else:
        monkeypatch.delenv("SEED_CAPTURISTA_PASSWORD", raising=False)

    bs._seed_demo_activists()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_demo_seed_lucy_is_coordinador(monkeypatch, seed_data):
    _call_seed(monkeypatch)

    with TestingSessionLocal() as db:
        lucy = db.execute(
            select(User).where(User.email == LUCY_EMAIL)
        ).scalar_one_or_none()

    assert lucy is not None
    assert lucy.role == UserRole.COORDINADOR
    assert lucy.lider_id is None
    assert lucy.coordinador_id is None
    assert lucy.is_active is True
    assert lucy.must_change_password is False


def test_demo_seed_lider_under_lucy(monkeypatch, seed_data):
    _call_seed(monkeypatch)

    with TestingSessionLocal() as db:
        lucy = db.execute(
            select(User).where(User.email == LUCY_EMAIL)
        ).scalar_one_or_none()
        lider = db.execute(
            select(User).where(User.email == LIDER_EMAIL)
        ).scalar_one_or_none()

    assert lider is not None
    assert lider.role == UserRole.LIDER
    assert lider.coordinador_id == lucy.id
    assert lider.lider_id is None


def test_demo_seed_activista_under_lider(monkeypatch, seed_data):
    _call_seed(monkeypatch)

    with TestingSessionLocal() as db:
        lider = db.execute(
            select(User).where(User.email == LIDER_EMAIL)
        ).scalar_one_or_none()
        activista = db.execute(
            select(User).where(User.email == ACTIVISTA_EMAIL)
        ).scalar_one_or_none()

    assert activista is not None
    assert activista.role == UserRole.ACTIVISTA
    assert activista.lider_id == lider.id
    assert activista.seccion == "0001"


def test_demo_seed_creates_capturista(monkeypatch, seed_data):
    _call_seed(monkeypatch, with_capturista=True)

    with TestingSessionLocal() as db:
        capturista = db.execute(
            select(User).where(User.email == CAPTURISTA_EMAIL)
        ).scalar_one_or_none()

    assert capturista is not None
    assert capturista.role == UserRole.CAPTURISTA
    assert capturista.lider_id is None
    assert capturista.coordinador_id is None


def test_demo_seed_skips_capturista_when_password_absent(monkeypatch, seed_data):
    """When SEED_CAPTURISTA_PASSWORD is absent, the capturista is not created."""
    _call_seed(monkeypatch, with_capturista=False)

    skip_email = "capturista.skip@demo.agora.mx"
    monkeypatch.setenv("SEED_CAPTURISTA_EMAIL", skip_email)

    with TestingSessionLocal() as db:
        row = db.execute(
            select(User).where(User.email == skip_email)
        ).scalar_one_or_none()

    assert row is None


def test_demo_seed_creates_campaign(monkeypatch, seed_data):
    _call_seed(monkeypatch)

    with TestingSessionLocal() as db:
        campaign = db.execute(
            select(Campaign).where(Campaign.name == CAMPAIGN_NAME)
        ).scalar_one_or_none()

    assert campaign is not None
    assert campaign.cycle == 2027


def test_demo_seed_creates_memberships(monkeypatch, seed_data):
    _call_seed(monkeypatch)

    with TestingSessionLocal() as db:
        lucy = db.execute(select(User).where(User.email == LUCY_EMAIL)).scalar_one_or_none()
        lider = db.execute(select(User).where(User.email == LIDER_EMAIL)).scalar_one_or_none()
        activista = db.execute(select(User).where(User.email == ACTIVISTA_EMAIL)).scalar_one_or_none()
        capturista = db.execute(select(User).where(User.email == CAPTURISTA_EMAIL)).scalar_one_or_none()
        campaign = db.execute(select(Campaign).where(Campaign.name == CAMPAIGN_NAME)).scalar_one_or_none()

        def _mem(user_id):
            return db.execute(
                select(CampaignMembership).where(
                    CampaignMembership.user_id == user_id,
                    CampaignMembership.campaign_id == campaign.id,
                )
            ).scalar_one_or_none()

        lucy_mem = _mem(lucy.id)
        lider_mem = _mem(lider.id)
        act_mem = _mem(activista.id)
        cap_mem = _mem(capturista.id)

    assert lucy_mem is not None and lucy_mem.role == UserRole.COORDINADOR
    assert lider_mem is not None and lider_mem.role == UserRole.LIDER
    assert act_mem is not None and act_mem.role == UserRole.ACTIVISTA
    assert cap_mem is not None and cap_mem.role == UserRole.CAPTURISTA


def test_demo_seed_idempotent(monkeypatch, seed_data):
    """Calling _seed_demo_activists twice must not duplicate rows or raise."""
    _call_seed(monkeypatch)
    _call_seed(monkeypatch)  # second call — must be a no-op

    with TestingSessionLocal() as db:
        lucy_count = len(db.execute(select(User).where(User.email == LUCY_EMAIL)).all())
        lider_count = len(db.execute(select(User).where(User.email == LIDER_EMAIL)).all())
        act_count = len(db.execute(select(User).where(User.email == ACTIVISTA_EMAIL)).all())
        cap_count = len(db.execute(select(User).where(User.email == CAPTURISTA_EMAIL)).all())
        camp_count = len(db.execute(select(Campaign).where(Campaign.name == CAMPAIGN_NAME)).all())

        lucy = db.execute(select(User).where(User.email == LUCY_EMAIL)).scalar_one()
        lider = db.execute(select(User).where(User.email == LIDER_EMAIL)).scalar_one()
        act = db.execute(select(User).where(User.email == ACTIVISTA_EMAIL)).scalar_one()
        cap = db.execute(select(User).where(User.email == CAPTURISTA_EMAIL)).scalar_one()
        camp = db.execute(select(Campaign).where(Campaign.name == CAMPAIGN_NAME)).scalar_one()
        mem_count = len(
            db.execute(
                select(CampaignMembership).where(
                    CampaignMembership.campaign_id == camp.id,
                    CampaignMembership.user_id.in_([lucy.id, lider.id, act.id, cap.id]),
                )
            ).all()
        )

    assert lucy_count == 1, "lucy duplicated"
    assert lider_count == 1, "lider duplicated"
    assert act_count == 1, "activista duplicated"
    assert cap_count == 1, "capturista duplicated"
    assert camp_count == 1, "campaign duplicated"
    assert mem_count == 4, "memberships duplicated"


def test_demo_seed_promotes_existing_lucy_lider_to_coordinador(monkeypatch, seed_data):
    """Pre-existing lucy as LIDER must be promoted to COORDINADOR on seed run."""
    import app.bootstrap as bs

    monkeypatch.setattr(bs, "SessionLocal", TestingSessionLocal)

    transition_email = "lucy.transition@demo.agora.mx"

    # Pre-insert lucy as LIDER (legacy state).
    with TestingSessionLocal() as db:
        org = db.execute(
            select(Organization).where(Organization.slug == DEMO_ORG_SLUG)
        ).scalar_one()
        legacy_lucy = User(
            email=transition_email,
            full_name="Lucy Legacy Lider",
            role=UserRole.LIDER,
            organization_id=org.id,
            hashed_password="x",
            is_active=True,
            must_change_password=False,
        )
        db.add(legacy_lucy)
        db.commit()

    # Run seed with lucy pointing at the transition email.
    monkeypatch.setenv("SEED_LUCY_EMAIL", transition_email)
    monkeypatch.setenv("SEED_LUCY_PASSWORD", LUCY_PW)
    monkeypatch.setenv("SEED_LIDER_EMAIL", "lider.transition@demo.agora.mx")
    monkeypatch.setenv("SEED_LIDER_PASSWORD", LIDER_PW)
    monkeypatch.setenv("SEED_ACTIVISTA_EMAIL", "activista.transition@demo.agora.mx")
    monkeypatch.setenv("SEED_ACTIVISTA_PASSWORD", ACTIVISTA_PW)
    monkeypatch.setenv("SEED_ORG_SLUG", DEMO_ORG_SLUG)
    monkeypatch.setenv("SEED_DEMO_CAMPAIGN_NAME", "Campaña Transition Test 2027")
    monkeypatch.delenv("SEED_CAPTURISTA_PASSWORD", raising=False)

    bs._seed_demo_activists()

    with TestingSessionLocal() as db:
        lucy = db.execute(
            select(User).where(User.email == transition_email)
        ).scalar_one_or_none()

    assert lucy is not None
    assert lucy.role == UserRole.COORDINADOR, f"Expected COORDINADOR, got {lucy.role}"
    assert lucy.lider_id is None
    assert lucy.coordinador_id is None


def test_demo_seed_skips_when_passwords_absent(monkeypatch, seed_data):
    """When passwords are not set, the helper must skip without creating rows."""
    import app.bootstrap as bs

    monkeypatch.setattr(bs, "SessionLocal", TestingSessionLocal)
    monkeypatch.setenv("SEED_ORG_SLUG", "alpha")
    # Deliberately NOT setting SEED_LUCY_PASSWORD / SEED_ACTIVISTA_PASSWORD.
    monkeypatch.delenv("SEED_LUCY_PASSWORD", raising=False)
    monkeypatch.delenv("SEED_ACTIVISTA_PASSWORD", raising=False)
    lucy_email_skip = "lucy.skip@demo.agora.mx"
    monkeypatch.setenv("SEED_LUCY_EMAIL", lucy_email_skip)

    bs._seed_demo_activists()

    with TestingSessionLocal() as db:
        row = db.execute(
            select(User).where(User.email == lucy_email_skip)
        ).scalar_one_or_none()

    assert row is None, "demo seed must be skipped when passwords absent"
