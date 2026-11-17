"""Rollout blockers: new users reach the campaign, case-insensitive login,
per-client login rate limit behind the proxy."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from tests.conftest import TestingSessionLocal as SessionLocal
from app.main import app
from app.models.campaign import CampaignMembership
from app.models.user import User
from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers


_CREATED = ("cap.rollout@alpha.gov", "rol.rollout@alpha.gov", "orphan.rollout@alpha.gov",
            "mixto.case@alpha.gov")


@pytest.fixture(autouse=True, scope="module")
def _cleanup_rollout_users():
    """Other suites count Alpha users; leave the shared test DB as found."""
    yield

    with SessionLocal() as db:
        ids = db.execute(select(User.id).where(User.email.in_(_CREATED))).scalars().all()
        if ids:
            db.execute(delete(CampaignMembership).where(CampaignMembership.user_id.in_(ids)))
            db.execute(delete(User).where(User.id.in_(ids)))
            db.commit()


def _create_and_activate(client: TestClient, email: str, role: str) -> dict:
    admin = auth_headers(client, "admin@alpha.gov")
    created = client.post(
        "/api/users", headers=admin,
        json={"email": email, "full_name": "Nuevo Rollout", "role": role},
    )
    assert created.status_code == 201, created.text
    temp = created.json()["temporary_password"]
    tok = client.post("/api/auth/login", json={"email": email, "password": temp}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    r = client.post("/api/users/me/change-password", headers=h,
                    json={"current_password": temp, "new_password": "Nueva12345!"})
    assert r.status_code == 204, r.text
    return created.json()["user"]


def test_new_capturista_lands_in_campaign_and_can_capture(client: TestClient) -> None:
    _create_and_activate(client, "cap.rollout@alpha.gov", "capturista")
    h = auth_headers(client, "cap.rollout@alpha.gov", "Nueva12345!")
    mine = client.get("/api/campaigns/mine", headers=h)
    assert mine.status_code == 200
    assert ALPHA_CAMPAIGN_ID in [c["id"] for c in mine.json()]
    cat = client.get("/api/captura/catalogo", headers={**h, "X-Campaign-Id": ALPHA_CAMPAIGN_ID})
    assert cat.status_code == 200, cat.text


def test_role_change_syncs_membership_role(client: TestClient) -> None:
    user = _create_and_activate(client, "rol.rollout@alpha.gov", "capturista")
    admin = auth_headers(client, "admin@alpha.gov")
    r = client.patch(f"/api/users/{user['id']}", headers=admin, json={"role": "coordinador"})
    assert r.status_code == 200, r.text
    with SessionLocal() as db:
        mem = db.execute(select(CampaignMembership).where(
            CampaignMembership.user_id == user["id"],
            CampaignMembership.campaign_id == ALPHA_CAMPAIGN_ID,
        )).scalar_one()
        assert mem.role.value == "coordinador"


def test_backfill_gives_orphan_user_a_membership(client: TestClient) -> None:
    from app.services.users_service import backfill_campaign_memberships

    user = _create_and_activate(client, "orphan.rollout@alpha.gov", "capturista")
    with SessionLocal() as db:
        for m in db.execute(select(CampaignMembership).where(
                CampaignMembership.user_id == user["id"])).scalars():
            db.delete(m)
        db.commit()
        assert backfill_campaign_memberships(db) >= 1
        assert db.execute(select(CampaignMembership).where(
            CampaignMembership.user_id == user["id"],
            CampaignMembership.campaign_id == ALPHA_CAMPAIGN_ID,
        )).scalar_one_or_none() is not None
        # Idempotent.
        before = db.execute(select(CampaignMembership)).scalars().all()
        backfill_campaign_memberships(db)
        assert len(db.execute(select(CampaignMembership)).scalars().all()) == len(before)


def test_login_is_case_and_space_insensitive(client: TestClient) -> None:
    for ident in ("Admin@Alpha.gov", "  admin@alpha.gov  ", "ADMIN@ALPHA.GOV"):
        r = client.post("/api/auth/login", json={"email": ident, "password": "password123"})
        assert r.status_code == 200, (ident, r.text)


def test_create_user_normalizes_email_and_blocks_case_duplicates(client: TestClient) -> None:
    admin = auth_headers(client, "admin@alpha.gov")
    r = client.post("/api/users", headers=admin,
                    json={"email": "  Mixto.Case@Alpha.gov ", "full_name": "Mixto", "role": "capturista"})
    assert r.status_code == 201, r.text
    assert r.json()["user"]["email"] == "mixto.case@alpha.gov"
    dup = client.post("/api/users", headers=admin,
                      json={"email": "MIXTO.CASE@alpha.gov", "full_name": "Dup", "role": "capturista"})
    assert dup.status_code == 409


def test_login_rate_limit_is_per_client_behind_proxy(monkeypatch) -> None:
    from app.core.rate_limiting import limiter

    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
    limiter.reset()
    c = TestClient(app, raise_server_exceptions=False)
    bad = {"identifier": "admin@alpha.gov", "password": "mala-clave"}
    # Client A exhausts its bucket (the edge appends A's IP right-most;
    # a spoofed left-most hop must not matter).
    hit = False
    for i in range(25):
        r = c.post("/api/auth/login", json=bad,
                   headers={"X-Forwarded-For": f"9.9.9.{i}, 200.1.1.1"})
        if r.status_code == 429:
            hit = True
            break
    assert hit, "client A should be rate limited"
    # Client B (different edge-seen IP) is unaffected.
    ok = c.post("/api/auth/login", json={"identifier": "admin@alpha.gov", "password": "password123"},
                headers={"X-Forwarded-For": "200.2.2.2"})
    assert ok.status_code == 200, ok.text
    limiter.reset()


def test_user_emails_lowercase_lookup_matches_existing_rows(client: TestClient) -> None:
    # Rows stored before normalization (mixed case) still log in.
    with SessionLocal() as db:
        u = db.execute(select(User).where(User.email == "viewer@alpha.gov")).scalar_one()
        u.email = "Viewer@Alpha.gov"
        db.commit()
    try:
        r = client.post("/api/auth/login", json={"email": "viewer@alpha.gov", "password": "password123"})
        assert r.status_code == 200, r.text
    finally:
        with SessionLocal() as db:
            u = db.execute(select(User).where(User.email == "Viewer@Alpha.gov")).scalar_one()
            u.email = "viewer@alpha.gov"
            db.commit()
