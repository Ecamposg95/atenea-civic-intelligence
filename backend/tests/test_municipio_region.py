"""GET /municipio/region — resumen comparativo de la región de la campaña activa."""
import pytest
from sqlalchemy import delete, select

from app.models.campaign import Campaign
from app.models.census import CensusMetric
from app.seeds.demo_municipio_intel import seed_intel
from app.seeds.municipios import MUNICIPIOS
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers

REGION_CODES = ["15076"]


@pytest.fixture
def region_seeded():
    db = TestingSessionLocal()
    try:
        for code in REGION_CODES:
            seed_intel(db, MUNICIPIOS[code])
        yield
        db.execute(delete(CensusMetric).where(CensusMetric.territory_code.in_(REGION_CODES)))
        camp = db.get(Campaign, ALPHA_CAMPAIGN_ID)
        camp.municipio_code = None
        db.commit()
    finally:
        db.close()


def _set_muni(code):
    db = TestingSessionLocal()
    try:
        db.get(Campaign, ALPHA_CAMPAIGN_ID).municipio_code = code
        db.commit()
    finally:
        db.close()


def test_region_sma_solo_sma(client, region_seeded):
    _set_muni("15076")
    r = client.get("/api/municipio/region", headers={**auth_headers(client, "coord@alpha.gov"),
                                                    "X-Campaign-Id": ALPHA_CAMPAIGN_ID})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["region"] == "Valle de Toluca"
    assert [m["code"] for m in body["municipios"]] == ["15076"]
    assert body["municipios"][0]["es_campana"] is True


def test_region_errores(client, region_seeded):
    h = auth_headers(client, "coord@alpha.gov")
    assert client.get("/api/municipio/region", headers=h).status_code == 400
    _set_muni(None)
    assert client.get("/api/municipio/region", headers={**h, "X-Campaign-Id": ALPHA_CAMPAIGN_ID}).status_code == 404
    _set_muni("15076")
    assert client.get("/api/municipio/region", headers={**auth_headers(client, "activista1@alpha.gov"),
                                                       "X-Campaign-Id": ALPHA_CAMPAIGN_ID}).status_code == 403


def test_catalogo_municipios(client):
    r = client.get("/api/municipio/catalogo", headers=auth_headers(client, "admin@alpha.gov"))
    assert r.status_code == 200
    body = r.json()
    assert [m["code"] for m in body] == ["15076"]
    assert all(m["name"] and m["region"] for m in body)


def test_catalogo_requiere_auth(client):
    assert client.get("/api/municipio/catalogo").status_code == 401
