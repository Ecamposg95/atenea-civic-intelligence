"""Authentication flow tests."""

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import hash_password
from app.models.organization import Organization
from app.models.user import User, UserRole
from tests.conftest import PASSWORD, TestingSessionLocal, auth_headers


def test_login_success(client: TestClient) -> None:
    resp = client.post(
        "/api/auth/login", json={"email": "admin@alpha.gov", "password": PASSWORD}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0


def test_login_invalid_credentials(client: TestClient) -> None:
    resp = client.post(
        "/api/auth/login", json={"email": "admin@alpha.gov", "password": "wrong"}
    )
    assert resp.status_code == 401
    # Standard error envelope (Golden Rule #8).
    assert resp.json()["error"]["status"] == 401


def test_login_validation_error_envelope(client: TestClient) -> None:
    resp = client.post("/api/auth/login", json={})
    assert resp.status_code == 422
    assert "error" in resp.json()


def test_me_returns_current_user(client: TestClient) -> None:
    headers = auth_headers(client, "admin@alpha.gov")
    resp = client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "admin@alpha.gov"
    assert body["role"] == "admin"
    assert isinstance(body["id"], str)


def test_me_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_login_by_phone(client: TestClient) -> None:
    resp = client.post("/api/auth/login", json={"identifier": "5550000001", "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    assert resp.json()["access_token"]


def test_login_by_email_via_identifier(client: TestClient) -> None:
    resp = client.post("/api/auth/login", json={"identifier": "admin@alpha.gov", "password": PASSWORD})
    assert resp.status_code == 200, resp.text


def test_login_duplicate_phone_no_500(client: TestClient) -> None:
    """Two users sharing the same phone number must never cause a 500.

    phone is not unique in the DB — authenticate_user uses .limit(1) with an
    ordered query instead of scalar_one_or_none() to stay crash-proof.
    """
    DUPE_PHONE = "5559876543"
    db = TestingSessionLocal()
    added_ids: list[str] = []
    try:
        org_a = db.execute(select(Organization).where(Organization.slug == "alpha")).scalar_one()
        for suffix in ("a", "b"):
            u = User(
                email=f"phone_dupe_{suffix}@alpha.gov",
                full_name=f"Phone Dupe {suffix}",
                hashed_password=hash_password(PASSWORD),
                role=UserRole.ACTIVISTA,
                organization_id=org_a.id,
                phone=DUPE_PHONE,
            )
            db.add(u)
            db.flush()
            added_ids.append(str(u.id))
        db.commit()

        resp = client.post("/api/auth/login", json={"identifier": DUPE_PHONE, "password": PASSWORD})
        # Must NOT be 500: either 200 (first ordered match) or 401 are acceptable.
        assert resp.status_code in (200, 401), (
            f"Expected 200 or 401 for duplicate-phone login, got {resp.status_code}: {resp.text}"
        )
    finally:
        for uid in added_ids:
            u = db.get(User, uid)
            if u:
                db.delete(u)
        db.commit()
        db.close()
