"""TDD tests for RBAC v2 Tasks 4 & 5: role lists on captura/consola/export/reports
and default-deny gating on intelligence/reference/org routers.

RED phase: run before gating to confirm failures.
GREEN phase: run after gating to confirm all pass.
"""
from tests.conftest import auth_headers, ALPHA_CAMPAIGN_ID


def _h(client, email):
    """Auth headers WITH a campaign context (for capture/admin endpoints)."""
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID
    return h


def _ih(client, email):
    """Auth headers WITHOUT a campaign context (for intelligence/reference endpoints)."""
    return auth_headers(client, email)


def test_capturista_can_capture(client):
    r = client.post(
        "/api/registros",
        json={"nombre_completo": "Cap Uno", "consentimiento": True},
        headers=_h(client, "capturista@alpha.gov"),
    )
    assert r.status_code == 201, r.text
    client.delete(f"/api/registros/{r.json()['id']}", headers=_h(client, "capturista@alpha.gov"))


def test_coordinador_cannot_capture(client):
    r = client.post(
        "/api/registros",
        json={"nombre_completo": "X", "consentimiento": True},
        headers=_h(client, "coord@alpha.gov"),
    )
    assert r.status_code == 403, r.text


def test_coordinador_sees_admin_registros(client):
    assert client.get("/api/admin/registros", headers=_h(client, "coord@alpha.gov")).status_code == 200


def test_consulta_forbidden_on_admin_and_capture(client):
    assert client.get("/api/admin/registros", headers=_h(client, "consulta@alpha.gov")).status_code == 403
    assert (
        client.post(
            "/api/registros",
            json={"nombre_completo": "Y", "consentimiento": True},
            headers=_h(client, "consulta@alpha.gov"),
        ).status_code
        == 403
    )


# ---------------------------------------------------------------------------
# Task 5: default-deny gating on intelligence / reference / org routers
# ---------------------------------------------------------------------------

# Representative GET endpoints, one per router being gated.
_INTEL_ENDPOINTS = [
    "/api/analytics/overview",
    "/api/maps/areas",
    "/api/territory/children",
    "/api/intel/ieem/datasets",
]

_BLOCKED_ON_INTEL = [
    "activista1@alpha.gov",   # ACTIVISTA
    "capturista@alpha.gov",   # CAPTURISTA
    "consulta@alpha.gov",     # CONSULTA
]


def test_intelligence_blocks_activista_capturista_consulta(client):
    """Activista / capturista / consulta must receive 403 on intelligence endpoints.

    RED: these return 200 before gating (routers are open to any authed user).
    GREEN: return 403 after require_roles guard is added to each router.
    """
    for ep in _INTEL_ENDPOINTS:
        for email in _BLOCKED_ON_INTEL:
            code = client.get(ep, headers=_ih(client, email)).status_code
            assert code == 403, f"{ep} [{email}] expected 403, got {code}"


def test_intelligence_allows_viewer_and_above(client):
    """Viewer (and admin/lider/coordinador) must reach intelligence endpoints."""
    for ep in _INTEL_ENDPOINTS:
        for email in ("viewer@alpha.gov", "admin@alpha.gov", "lider@alpha.gov", "coord@alpha.gov"):
            code = client.get(ep, headers=_ih(client, email)).status_code
            assert code not in (401, 403), f"{ep} [{email}] expected access, got {code}"


def test_sources_blocks_viewer_capturista_consulta_activista(client):
    """Sources router requires ADMIN or ANALYST; lower roles must be blocked.

    RED: these return 200 before gating.
    GREEN: return 403 after require_roles(ADMIN, ANALYST) guard.
    """
    blocked = [
        "viewer@alpha.gov",       # VIEWER
        "capturista@alpha.gov",   # CAPTURISTA
        "consulta@alpha.gov",     # CONSULTA
        "activista1@alpha.gov",   # ACTIVISTA
    ]
    for email in blocked:
        code = client.get("/api/sources", headers=_ih(client, email)).status_code
        assert code == 403, f"/api/sources [{email}] expected 403, got {code}"


def test_sources_allows_admin(client):
    """Admin must reach sources endpoints after gating."""
    code = client.get("/api/sources", headers=_ih(client, "admin@alpha.gov")).status_code
    assert code not in (401, 403), f"/api/sources [admin] expected access, got {code}"


def test_organizations_admin_can_list_own_org(client):
    """ADMIN must be able to list organizations (sees own org only)."""
    code = client.get("/api/organizations", headers=_ih(client, "admin@alpha.gov")).status_code
    assert code == 200, f"/api/organizations [admin] expected 200, got {code}"


def test_organizations_viewer_blocked_from_list(client):
    """Viewer must be blocked from listing organizations.

    RED: currently returns 200 (no role gate).
    GREEN: returns 403 after require_roles(ADMIN) guard on GET /organizations.
    """
    code = client.get("/api/organizations", headers=_ih(client, "viewer@alpha.gov")).status_code
    assert code == 403, f"/api/organizations [viewer] expected 403, got {code}"


def test_organizations_create_blocked_for_non_superadmin(client):
    """Only superadmin may create organizations; admin must receive 403."""
    code = client.post(
        "/api/organizations",
        json={"name": "NewOrg", "slug": "new-org"},
        headers=_ih(client, "admin@alpha.gov"),
    ).status_code
    assert code == 403, f"/api/organizations POST [admin] expected 403, got {code}"


def test_organizations_superadmin_can_create(client):
    """Superadmin must be able to create organizations."""
    code = client.post(
        "/api/organizations",
        json={"name": "SuperOrg", "slug": "super-org"},
        headers=_ih(client, "super@atlas.gov"),
    ).status_code
    assert code == 201, f"/api/organizations POST [superadmin] expected 201, got {code}"


def test_catalogs_allows_broad_set_including_activista(client):
    """Catalogs reference data must be reachable by activista, capturista, and consulta.

    This confirms the broad-allow decision for capture-form dropdowns.
    """
    broad = [
        "activista1@alpha.gov",
        "capturista@alpha.gov",
        "consulta@alpha.gov",
        "viewer@alpha.gov",
        "admin@alpha.gov",
    ]
    for email in broad:
        code = client.get("/api/catalogs/cargos", headers=_ih(client, email)).status_code
        assert code not in (401, 403), f"/api/catalogs/cargos [{email}] expected access, got {code}"
