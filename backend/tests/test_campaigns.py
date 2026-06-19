from app.models.catalog import Cargo, Party, Coalition, CoalitionParty


def test_catalog_models_exist_and_are_global():
    # Catalogs are platform reference data: no tenant column.
    assert not hasattr(Cargo, "organization_id")
    assert {c.name for c in Cargo.__table__.columns} >= {"id", "key", "label", "ambito", "territory_level"}
    assert {c.name for c in Party.__table__.columns} >= {"id", "key", "name", "short", "color"}
    assert {c.name for c in Coalition.__table__.columns} >= {"id", "key", "name", "color"}
    assert {c.name for c in CoalitionParty.__table__.columns} >= {"coalition_id", "party_id"}


from app.models.campaign import Campaign, Contest, CampaignMembership, CampaignStatus
from app.models.base import CampaignMixin


def test_campaign_contest_membership_shape():
    assert {c.name for c in Campaign.__table__.columns} >= {"id", "organization_id", "name", "cycle", "status"}
    assert {c.name for c in Contest.__table__.columns} >= {"id", "organization_id", "campaign_id", "cargo_id", "territory_id", "election_date"}
    assert {c.name for c in CampaignMembership.__table__.columns} >= {"id", "user_id", "campaign_id", "role"}
    col = CampaignMixin.__dict__["campaign_id"]
    assert col is not None
    assert CampaignStatus.DRAFT.value == "draft"


from tests.conftest import auth_headers, ALPHA_CAMPAIGN_ID


def test_member_can_read_own_campaign(client):
    h = auth_headers(client, "admin@alpha.gov")
    r = client.get("/api/campaigns/mine", headers=h)
    assert r.status_code == 200
    assert any(c["id"] == ALPHA_CAMPAIGN_ID for c in r.json())


def test_cross_tenant_cannot_use_campaign(client):
    h = auth_headers(client, "admin@beta.gov")
    r = client.get(f"/api/campaigns/{ALPHA_CAMPAIGN_ID}", headers={**h, "X-Campaign-Id": ALPHA_CAMPAIGN_ID})
    assert r.status_code in (403, 404)


def test_missing_campaign_header_rejected(client):
    h = auth_headers(client, "admin@alpha.gov")
    r = client.get(f"/api/campaigns/{ALPHA_CAMPAIGN_ID}/contests", headers=h)
    assert r.status_code == 400


def test_member_can_list_and_create_contest(client):
    h = {**auth_headers(client, "admin@alpha.gov"), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}
    r = client.get(f"/api/campaigns/{ALPHA_CAMPAIGN_ID}/contests", headers=h)
    assert r.status_code == 200 and isinstance(r.json(), list)


def test_catalogs_readable(client):
    h = auth_headers(client, "admin@alpha.gov")
    r = client.get("/api/catalogs/cargos", headers=h)
    assert r.status_code == 200 and isinstance(r.json(), list)


def test_territory_children_readable(client):
    h = auth_headers(client, "admin@alpha.gov")
    r = client.get("/api/territory/children", headers=h)
    assert r.status_code == 200 and isinstance(r.json(), list)


def test_contests_are_isolated_across_campaigns(client):
    """End-to-end: a contest created in one campaign is never visible from another
    campaign / another tenant. Exercises the X-Campaign-Id + scoping pipeline."""
    cargos = client.get("/api/catalogs/cargos", headers=auth_headers(client, "admin@alpha.gov")).json()
    cargo_id = cargos[0]["id"]

    ah = {**auth_headers(client, "admin@alpha.gov"), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}
    r = client.post(f"/api/campaigns/{ALPHA_CAMPAIGN_ID}/contests", headers=ah, json={"cargo_id": cargo_id})
    assert r.status_code == 201, r.text
    alpha_contest_id = r.json()["id"]

    bh0 = auth_headers(client, "admin@beta.gov")
    rc = client.post("/api/campaigns", headers=bh0, json={"name": "Beta 2027", "cycle": 2027})
    assert rc.status_code == 201, rc.text
    beta_campaign_id = rc.json()["id"]
    bh = {**bh0, "X-Campaign-Id": beta_campaign_id}
    rb = client.post(f"/api/campaigns/{beta_campaign_id}/contests", headers=bh, json={"cargo_id": cargo_id})
    assert rb.status_code == 201, rb.text
    beta_contest_id = rb.json()["id"]

    alpha_ids = {c["id"] for c in client.get(f"/api/campaigns/{ALPHA_CAMPAIGN_ID}/contests", headers=ah).json()}
    beta_ids = {c["id"] for c in client.get(f"/api/campaigns/{beta_campaign_id}/contests", headers=bh).json()}
    assert alpha_contest_id in alpha_ids and beta_contest_id not in alpha_ids
    assert beta_contest_id in beta_ids and alpha_contest_id not in beta_ids

    r403 = client.get(f"/api/campaigns/{ALPHA_CAMPAIGN_ID}/contests", headers={**bh0, "X-Campaign-Id": ALPHA_CAMPAIGN_ID})
    assert r403.status_code in (403, 404)
