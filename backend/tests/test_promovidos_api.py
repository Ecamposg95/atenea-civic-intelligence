"""GET /promovidos — scope territorial + enriquecimiento electoral."""
from sqlalchemy import select
from tests.conftest import auth_headers, ALPHA_CAMPAIGN_ID, TestingSessionLocal
from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.seccion_electoral import SeccionElectoral
from app.models.registro import Registro
from app.models.user import User


def _h(client, email):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID
    return h


def _setup_territory_and_promovido():
    db = TestingSessionLocal()
    try:
        muni = ElectoralArea(name="San Mateo Atenco", code="15076",
                             level=AreaLevel.MUNICIPIO, organization_id=None)
        db.add(muni); db.flush()
        db.add(ElectoralArea(name="Sección 4121", code="4121", level=AreaLevel.SECCION,
                             organization_id=None, municipio_id=muni.id, parent_id=muni.id))
        db.add(SeccionElectoral(seccion="4121", municipio="San Mateo Atenco", anio=2024,
                                participacion=66.9, margen=-115, prioridad="COMPETITIVA"))
        coord = db.execute(select(User).where(User.email == "coord@alpha.gov")).scalar_one()
        coord.area_id = muni.id
        db.add(Registro(organization_id=coord.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                        activista_id=None, nombre_completo="Promovido Uno", seccion="4121",
                        promotor="ALAN", consentimiento=True, client_uuid="prom-1"))
        # a promovido OUTSIDE her territory (should be filtered out)
        db.add(Registro(organization_id=coord.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                        activista_id=None, nombre_completo="Fuera", seccion="9999",
                        promotor="ALAN", consentimiento=True, client_uuid="prom-2"))
        db.commit()
    finally:
        db.close()


def test_promovidos_scoped_and_enriched(client):
    _setup_territory_and_promovido()
    r = client.get("/api/promovidos", headers=_h(client, "coord@alpha.gov"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_territory"] is True
    names = [i["nombre_completo"] for i in body["items"]]
    # COORDINADOR is campaign-wide (no territory gate) → sees both the in-territory
    # promovido AND the one in another sección.
    assert "Promovido Uno" in names and "Fuera" in names
    row = next(i for i in body["items"] if i["nombre_completo"] == "Promovido Uno")
    assert row["prioridad"] == "COMPETITIVA" and row["margen"] == -115
    assert "clave_elector" not in row  # Golden Rule #9


def test_promovidos_empty_without_territory(client):
    db = TestingSessionLocal()
    try:
        lider = db.execute(select(User).where(User.email == "lider@alpha.gov")).scalar_one()
        lider.area_id = None
        db.commit()
    finally:
        db.close()
    r = client.get("/api/promovidos", headers=_h(client, "lider@alpha.gov"))
    assert r.status_code == 200
    assert r.json()["has_territory"] is False
    assert r.json()["items"] == []


def test_promovidos_admin_bypasses_territory(client):
    # Relies on promovido rows already seeded by test_promovidos_scoped_and_enriched
    # (module-scoped SQLite DB — see conftest.py); do not re-invoke the setup
    # helper here, it would violate the seccion_electoral/client_uuid unique
    # constraints on a second insert.
    db = TestingSessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == "admin@alpha.gov")).scalar_one()
        assert admin.area_id is None
    finally:
        db.close()
    r = client.get("/api/promovidos", headers=_h(client, "admin@alpha.gov"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_territory"] is True
    names = [i["nombre_completo"] for i in body["items"]]
    assert "Promovido Uno" in names and "Fuera" in names  # admin: no territory filter
