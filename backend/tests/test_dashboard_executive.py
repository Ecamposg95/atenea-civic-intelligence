"""Executive Command Center endpoint + idempotent election_date seed."""
from datetime import date

from sqlalchemy import delete, select

from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers
from app.models.campaign import Campaign, Contest
from app.models.catalog import Cargo
from app.models.organization import Organization
from app.seeds import demo_election_date


def _hdr(client, email):
    return {**auth_headers(client, email), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}


def test_executive_endpoint_shape_and_gating(client):
    assert client.get("/api/dashboard/executive").status_code == 401
    r = client.get("/api/dashboard/executive", headers=_hdr(client, "coord@alpha.gov"))
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("election_date", "promovidos", "afiliados", "casos", "cobertura",
                "tendencia", "por_seccion_top", "casos_por_estado", "alertas"):
        assert key in body, f"missing {key}"
    assert set(body["promovidos"]).issuperset({"total", "meta", "pct"})
    assert isinstance(body["tendencia"], list)


def test_election_date_seed_idempotent(monkeypatch):
    db = TestingSessionLocal()
    try:
        org = db.execute(select(Organization).where(Organization.slug == "alpha")).scalar_one()
        camp = Campaign(name="Seed Test Campaign", cycle=2027, organization_id=org.id)
        db.add(camp); db.commit()
        cid = camp.id
    finally:
        db.close()
    monkeypatch.setattr(demo_election_date, "_CAMPAIGN_ID", cid)
    try:
        db = TestingSessionLocal(); demo_election_date.seed_election_date(db); db.close()
        db = TestingSessionLocal(); demo_election_date.seed_election_date(db)  # 2nd run: no dup
        contests = db.execute(select(Contest).where(
            Contest.campaign_id == cid, Contest.election_date.is_not(None))).scalars().all()
        db.close()
        assert len(contests) == 1
        assert contests[0].election_date == date(2027, 6, 6)
    finally:
        db = TestingSessionLocal()
        db.execute(delete(Contest).where(Contest.campaign_id == cid))
        db.execute(delete(Campaign).where(Campaign.id == cid))
        db.commit(); db.close()


def test_executive_has_scrum_block(db_session, coordinador_ctx):
    from app.services import dashboard_service, scrum_service
    from app.schemas.scrum import SprintCreate, WorkItemCreate
    s = scrum_service.create_sprint(db_session, coordinador_ctx,
        SprintCreate(nombre="S", fecha_inicio="2026-07-08", fecha_fin="2026-07-22"))
    scrum_service.activar_sprint(db_session, coordinador_ctx, s.id)
    scrum_service.create_workitem(db_session, coordinador_ctx,
        WorkItemCreate(titulo="h", story_points=5, sprint_id=s.id))
    ex = dashboard_service.executive(db_session, coordinador_ctx)
    assert "scrum" in ex
    assert ex["scrum"]["sprint_activo"]["nombre"] == "S"
    assert ex["scrum"]["sprint_activo"]["comprometido"] == 5
    assert ex["scrum"]["por_columna"]["POR_HACER"] == 1
