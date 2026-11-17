"""Advanced users CRUD: RBAC, lifecycle, forced password change, isolation."""

from fastapi.testclient import TestClient

from app.models.user import User
from tests.conftest import auth_headers


def _org_id(client: TestClient, email: str) -> str:
    return client.get("/api/auth/me", headers=auth_headers(client, email)).json()[
        "organization_id"
    ]


def test_admin_creates_user_with_temp_password(client: TestClient) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    resp = client.post(
        "/api/users",
        headers=h,
        json={"email": "nuevo@alpha.gov", "full_name": "Nuevo", "role": "analyst"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["temporary_password"]
    assert body["user"]["must_change_password"] is True
    assert body["user"]["organization_id"] == _org_id(client, "admin@alpha.gov")
    assert body["user"]["role"] == "analyst"


def test_viewer_cannot_create_user(client: TestClient) -> None:
    h = auth_headers(client, "viewer@alpha.gov")
    resp = client.post(
        "/api/users",
        headers=h,
        json={"email": "x@alpha.gov", "full_name": "X", "role": "viewer"},
    )
    assert resp.status_code == 403


def test_admin_cannot_grant_superadmin(client: TestClient) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    resp = client.post(
        "/api/users",
        headers=h,
        json={"email": "sa@alpha.gov", "full_name": "SA", "role": "superadmin"},
    )
    assert resp.status_code == 403


def test_duplicate_email_conflict(client: TestClient) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    resp = client.post(
        "/api/users",
        headers=h,
        json={"email": "admin@alpha.gov", "full_name": "Dup", "role": "viewer"},
    )
    assert resp.status_code == 409


def test_forced_password_change_flow(client: TestClient) -> None:
    admin = auth_headers(client, "admin@alpha.gov")
    email = "forced@alpha.gov"
    created = client.post(
        "/api/users",
        headers=admin,
        json={"email": email, "full_name": "Forced", "role": "viewer"},
    ).json()
    temp = created["temporary_password"]

    token = client.post(
        "/api/auth/login", json={"email": email, "password": temp}
    ).json()["access_token"]
    nh = {"Authorization": f"Bearer {token}"}

    # Tenant features are blocked until the password is changed.
    blocked = client.get("/api/analytics/overview", headers=nh)
    assert blocked.status_code == 428

    changed = client.post(
        "/api/users/me/change-password",
        headers=nh,
        json={"current_password": temp, "new_password": "BrandNew123"},
    )
    assert changed.status_code == 204

    # Now tenant features are reachable.
    assert client.get("/api/analytics/overview", headers=nh).status_code == 200


def test_user_lifecycle(client: TestClient) -> None:
    admin = auth_headers(client, "admin@alpha.gov")
    uid = client.post(
        "/api/users",
        headers=admin,
        json={"email": "life@alpha.gov", "full_name": "Life", "role": "analyst"},
    ).json()["user"]["id"]

    updated = client.patch(
        f"/api/users/{uid}",
        headers=admin,
        json={"full_name": "Life Updated", "phone": "+52 555 111"},
    ).json()
    assert updated["full_name"] == "Life Updated"
    assert updated["phone"] == "+52 555 111"

    assert client.post(f"/api/users/{uid}/deactivate", headers=admin).json()["is_active"] is False
    assert client.post(f"/api/users/{uid}/activate", headers=admin).json()["is_active"] is True

    assert client.delete(f"/api/users/{uid}", headers=admin).status_code == 204
    ids = [u["id"] for u in client.get("/api/users", headers=admin).json()["items"]]
    assert uid not in ids
    ids_all = [
        u["id"]
        for u in client.get("/api/users?include_deleted=true", headers=admin).json()["items"]
    ]
    assert uid in ids_all

    restored = client.post(f"/api/users/{uid}/restore", headers=admin)
    assert restored.status_code == 200
    assert restored.json()["is_active"] is True


def test_admin_reset_password(client: TestClient) -> None:
    admin = auth_headers(client, "admin@alpha.gov")
    uid = client.post(
        "/api/users",
        headers=admin,
        json={"email": "reset@alpha.gov", "full_name": "Reset", "role": "viewer"},
    ).json()["user"]["id"]
    resp = client.post(f"/api/users/{uid}/reset-password", headers=admin)
    assert resp.status_code == 200
    assert resp.json()["temporary_password"]
    assert resp.json()["user_id"] == uid


def test_cross_tenant_get_is_404(client: TestClient) -> None:
    alpha = auth_headers(client, "admin@alpha.gov")
    beta_me = client.get("/api/auth/me", headers=auth_headers(client, "admin@beta.gov")).json()
    resp = client.get(f"/api/users/{beta_me['id']}", headers=alpha)
    assert resp.status_code == 404


def test_admin_cannot_delete_self(client: TestClient) -> None:
    admin = auth_headers(client, "admin@alpha.gov")
    me = client.get("/api/auth/me", headers=admin).json()
    assert client.delete(f"/api/users/{me['id']}", headers=admin).status_code == 403


def test_search_and_filter(client: TestClient) -> None:
    admin = auth_headers(client, "admin@alpha.gov")
    by_role = client.get("/api/users?role=viewer", headers=admin).json()
    assert all(u["role"] == "viewer" for u in by_role["items"])
    search = client.get("/api/users?q=admin@alpha", headers=admin).json()
    assert any(u["email"] == "admin@alpha.gov" for u in search["items"])


def test_create_activista_with_lider_and_seccion(client: TestClient) -> None:
    from sqlalchemy import select

    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    lider_id = db.execute(
        select(User.id).where(User.email == "lider@alpha.gov")
    ).scalar_one()
    db.close()
    h = auth_headers(client, "admin@alpha.gov")
    resp = client.post(
        "/api/users",
        json={
            "email": "nuevo.activista@alpha.gov",
            "full_name": "Nuevo Act",
            "role": "activista",
            "lider_id": lider_id,
            "seccion": "0007",
        },
        headers=h,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["user"]["lider_id"] == lider_id
    assert resp.json()["user"]["seccion"] == "0007"


def test_update_user_can_clear_seccion(client: TestClient) -> None:
    """PATCH with seccion=null must clear the field (model_fields_set semantics)."""
    from sqlalchemy import select

    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    # activista1@alpha.gov is seeded with seccion="0001"
    act_id = db.execute(
        select(User.id).where(User.email == "activista1@alpha.gov")
    ).scalar_one()
    db.close()

    h = auth_headers(client, "admin@alpha.gov")

    # Confirm baseline seccion is set
    before = client.get(f"/api/users/{act_id}", headers=h).json()
    assert before["seccion"] == "0001"

    # Explicitly clear it
    resp = client.patch(f"/api/users/{act_id}", headers=h, json={"seccion": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["seccion"] is None

    # Restore so other tests aren't affected
    client.patch(f"/api/users/{act_id}", headers=h, json={"seccion": "0001"})


def test_update_user_omit_seccion_leaves_it_unchanged(client: TestClient) -> None:
    """PATCH without seccion key must NOT touch the existing value."""
    from sqlalchemy import select

    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    act_id = db.execute(
        select(User.id).where(User.email == "activista1@alpha.gov")
    ).scalar_one()
    db.close()

    h = auth_headers(client, "admin@alpha.gov")
    before = client.get(f"/api/users/{act_id}", headers=h).json()
    existing_seccion = before["seccion"]

    # Patch only full_name, omit seccion
    resp = client.patch(f"/api/users/{act_id}", headers=h, json={"full_name": "Alpha Activista 1"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["seccion"] == existing_seccion


def test_coordinador_creates_lider_in_substructure(client: TestClient) -> None:
    """COORDINADOR can create a LIDER wired to their own sub-structure (201)."""
    from sqlalchemy import select

    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    coord_id = db.execute(
        select(User.id).where(User.email == "coord@alpha.gov")
    ).scalar_one()
    db.close()

    h = auth_headers(client, "coord@alpha.gov")
    r = client.post(
        "/api/users",
        json={
            "email": "newlider@alpha.gov",
            "full_name": "NL",
            "password": "password123",
            "role": "lider",
            "coordinador_id": coord_id,
        },
        headers=h,
    )
    assert r.status_code in (200, 201), r.text


def test_coordinador_cannot_create_admin(client: TestClient) -> None:
    """COORDINADOR cannot create an ADMIN (only SA can) — 403."""
    h = auth_headers(client, "coord@alpha.gov")
    r = client.post(
        "/api/users",
        json={"email": "bad@alpha.gov", "full_name": "Bad", "password": "password123", "role": "admin"},
        headers=h,
    )
    assert r.status_code == 403, r.text


def test_coordinador_cannot_create_lider_outside_substructure(client: TestClient) -> None:
    """COORDINADOR cannot create a LIDER whose coordinador_id != actor.id — 403."""
    h = auth_headers(client, "coord@alpha.gov")
    r = client.post(
        "/api/users",
        json={
            "email": "wronglider@alpha.gov",
            "full_name": "WL",
            "password": "password123",
            "role": "lider",
            "coordinador_id": "00000000-dead-beef-dead-000000000000",
        },
        headers=h,
    )
    assert r.status_code == 403, r.text


def test_lider_creates_activista_under_itself(client: TestClient) -> None:
    """LIDER can create an ACTIVISTA with lider_id == actor.id (201)."""
    from sqlalchemy import select

    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    lider_id = db.execute(
        select(User.id).where(User.email == "lider@alpha.gov")
    ).scalar_one()
    db.close()

    h = auth_headers(client, "lider@alpha.gov")
    r = client.post(
        "/api/users",
        json={
            "email": "newactivista@alpha.gov",
            "full_name": "NA",
            "password": "password123",
            "role": "activista",
            "lider_id": lider_id,
        },
        headers=h,
    )
    assert r.status_code in (200, 201), r.text


def test_lider_cannot_create_lider(client: TestClient) -> None:
    """LIDER cannot create another LIDER — 403."""
    h = auth_headers(client, "lider@alpha.gov")
    r = client.post(
        "/api/users",
        json={"email": "x@alpha.gov", "full_name": "X", "password": "password123", "role": "lider"},
        headers=h,
    )
    assert r.status_code == 403, r.text


def test_admin_can_create_admin_in_own_org(client: TestClient) -> None:
    """ADMIN may grant ADMIN within its own tenant (org comes from the JWT)."""
    h = auth_headers(client, "admin@alpha.gov")
    r = client.post(
        "/api/users",
        json={
            "email": "newadmin@alpha.gov",
            "full_name": "NA",
            "role": "admin",
            # Ignored for non-superadmins (Golden Rule #2).
            "organization_id": _org_id(client, "admin@beta.gov"),
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    assert r.json()["user"]["organization_id"] == _org_id(client, "admin@alpha.gov")


def test_coordinador_cannot_promote_to_admin(client: TestClient) -> None:
    h = auth_headers(client, "coord@alpha.gov")
    me = client.get("/api/auth/me", headers=h).json()
    r = client.post(
        "/api/users",
        json={"email": "c2@alpha.gov", "full_name": "C2", "role": "admin",
              "coordinador_id": me["id"]},
        headers=h,
    )
    assert r.status_code == 403, r.text


def test_lider_id_must_be_a_lider(client: TestClient) -> None:
    from sqlalchemy import select

    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    not_lider = db.execute(
        select(User.id).where(User.email == "viewer@alpha.gov")
    ).scalar_one()
    db.close()
    h = auth_headers(client, "admin@alpha.gov")
    resp = client.post(
        "/api/users",
        json={
            "email": "x@alpha.gov",
            "full_name": "X",
            "role": "activista",
            "lider_id": not_lider,
        },
        headers=h,
    )
    assert resp.status_code == 400, resp.text


def test_coordinador_and_lider_can_list_users(client: TestClient) -> None:
    """COORDINADOR/LIDER may list users (assignee selectors); still tenant-scoped.
    Reading a single user by id remains ADMIN-only."""
    for email in ("coord@alpha.gov", "lider@alpha.gov"):
        h = auth_headers(client, email)
        resp = client.get("/api/users", headers=h)
        assert resp.status_code == 200, (email, resp.text)
        assert all(u["organization_id"] == _org_id(client, email)
                   for u in resp.json()["items"])
    # get-by-id stays admin-only for a coordinador
    coord = auth_headers(client, "coord@alpha.gov")
    some_id = client.get("/api/users", headers=coord).json()["items"][0]["id"]
    assert client.get(f"/api/users/{some_id}", headers=coord).status_code == 403


# --- Admin CRUD completeness (spec 2026-11-17 §12) --------------------------
def _audit_actions(entity_id: str) -> list[str]:
    from sqlalchemy import select

    from app.models.audit_log import AuditLog
    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    try:
        return list(
            db.execute(
                select(AuditLog.action).where(AuditLog.entity_id == entity_id)
            ).scalars()
        )
    finally:
        db.close()


def _superadmin_in_alpha() -> str:
    """A superadmin that happens to live in the alpha org (worst case for leaks)."""
    from sqlalchemy import select

    from app.core.security import hash_password
    from app.models.organization import Organization
    from app.models.user import UserRole
    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    try:
        existing = db.execute(
            select(User.id).where(User.email == "sa-in-alpha@atlas.gov")
        ).scalar_one_or_none()
        if existing:
            return existing
        org_id = db.execute(
            select(Organization.id).where(Organization.slug == "alpha")
        ).scalar_one()
        sa = User(email="sa-in-alpha@atlas.gov", full_name="SA Alpha",
                  hashed_password=hash_password("password123"),
                  role=UserRole.SUPERADMIN, organization_id=org_id)
        db.add(sa)
        db.commit()
        return sa.id
    finally:
        db.close()


def test_admin_can_create_every_field_role(client: TestClient) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    for i, role in enumerate(
        ["coordinador", "lider", "activista", "capturista", "analyst", "viewer", "consulta"]
    ):
        r = client.post(
            "/api/users",
            headers=h,
            json={"email": f"r{i}@alpha.gov", "full_name": f"R {i}", "role": role,
                  "seccion": "4321", "phone": "5512345678"},
        )
        assert r.status_code == 201, (role, r.text)
        u = r.json()["user"]
        assert u["role"] == role and u["seccion"] == "4321" and u["phone"] == "5512345678"


def test_admin_cannot_promote_to_superadmin(client: TestClient) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    uid = client.post(
        "/api/users", headers=h,
        json={"email": "promo@alpha.gov", "full_name": "P", "role": "viewer"},
    ).json()["user"]["id"]
    r = client.patch(f"/api/users/{uid}", headers=h, json={"role": "superadmin"})
    assert r.status_code == 403, r.text


def test_admin_cannot_touch_or_list_superadmin(client: TestClient) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    sa_id = _superadmin_in_alpha()
    try:
        _assert_superadmin_untouchable(client, h, sa_id)
    finally:
        _drop_user(sa_id)


def _drop_user(user_id: str) -> None:
    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    try:
        u = db.get(User, user_id)
        if u is not None:
            db.delete(u)
            db.commit()
    finally:
        db.close()


def _assert_superadmin_untouchable(client: TestClient, h: dict, sa_id: str) -> None:
    listed = client.get("/api/users?limit=200", headers=h).json()["items"]
    assert all(u["role"] != "superadmin" for u in listed)
    assert sa_id not in [u["id"] for u in listed]
    for method, path in [
        ("patch", f"/api/users/{sa_id}"),
        ("post", f"/api/users/{sa_id}/deactivate"),
        ("post", f"/api/users/{sa_id}/reset-password"),
        ("delete", f"/api/users/{sa_id}"),
    ]:
        kwargs = {"json": {"full_name": "Hacked"}} if method == "patch" else {}
        r = getattr(client, method)(path, headers=h, **kwargs)
        assert r.status_code == 403, (path, r.status_code)


def test_deleted_only_filter(client: TestClient) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    uid = client.post(
        "/api/users", headers=h,
        json={"email": "gone@alpha.gov", "full_name": "Gone", "role": "viewer"},
    ).json()["user"]["id"]
    assert client.delete(f"/api/users/{uid}", headers=h).status_code == 204
    body = client.get("/api/users?deleted_only=true", headers=h).json()
    assert [u["id"] for u in body["items"]] == [uid]
    assert body["total"] == 1
    assert body["items"][0]["deleted_at"] is not None
    assert uid not in [u["id"] for u in client.get("/api/users", headers=h).json()["items"]]


def test_list_pagination_and_active_filter(client: TestClient) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    for i in range(3):
        client.post("/api/users", headers=h,
                    json={"email": f"pg{i}@alpha.gov", "full_name": f"Pg {i}", "role": "viewer"})
    page = client.get("/api/users?q=pg&limit=2&offset=0&sort=email", headers=h).json()
    assert page["total"] == 3 and len(page["items"]) == 2 and page["limit"] == 2
    page2 = client.get("/api/users?q=pg&limit=2&offset=2&sort=email", headers=h).json()
    assert len(page2["items"]) == 1
    uid = page["items"][0]["id"]
    client.post(f"/api/users/{uid}/deactivate", headers=h)
    inactive = client.get("/api/users?q=pg&is_active=false", headers=h).json()["items"]
    assert [u["id"] for u in inactive] == [uid]


def test_admin_sets_lider_and_coordinador(client: TestClient) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    coord_id = client.get("/api/auth/me", headers=auth_headers(client, "coord@alpha.gov")).json()["id"]
    lider_id = client.get("/api/auth/me", headers=auth_headers(client, "lider@alpha.gov")).json()["id"]
    lider = client.post("/api/users", headers=h, json={
        "email": "l2@alpha.gov", "full_name": "L2", "role": "lider",
        "coordinador_id": coord_id,
    })
    assert lider.status_code == 201, lider.text
    act = client.post("/api/users", headers=h, json={
        "email": "a2@alpha.gov", "full_name": "A2", "role": "activista",
        "lider_id": lider_id, "seccion": "100",
    }).json()["user"]
    moved = client.patch(f"/api/users/{act['id']}", headers=h,
                         json={"lider_id": lider.json()["user"]["id"]})
    assert moved.status_code == 200 and moved.json()["lider_id"] == lider.json()["user"]["id"]
    # coordinador_id must point at a COORDINADOR
    bad = client.patch(f"/api/users/{act['id']}", headers=h, json={"coordinador_id": lider_id})
    assert bad.status_code == 400, bad.text


def test_reset_password_forces_change_and_every_mutation_is_audited(
    client: TestClient,
) -> None:
    h = auth_headers(client, "admin@alpha.gov")
    uid = client.post("/api/users", headers=h, json={
        "email": "aud@alpha.gov", "full_name": "Aud", "role": "capturista",
    }).json()["user"]["id"]
    client.patch(f"/api/users/{uid}", headers=h, json={"role": "analyst", "seccion": None})
    client.post(f"/api/users/{uid}/deactivate", headers=h)
    client.post(f"/api/users/{uid}/activate", headers=h)
    reset = client.post(f"/api/users/{uid}/reset-password", headers=h).json()
    client.delete(f"/api/users/{uid}", headers=h)
    client.post(f"/api/users/{uid}/restore", headers=h)

    # temp password works and the user is forced to change it
    token = client.post("/api/auth/login", json={
        "email": "aud@alpha.gov", "password": reset["temporary_password"],
    }).json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["must_change_password"] is True

    actions = _audit_actions(uid)
    for a in ("user.create", "user.update", "user.deactivate", "user.activate",
              "user.reset_password", "user.delete", "user.restore"):
        assert a in actions, (a, actions)
