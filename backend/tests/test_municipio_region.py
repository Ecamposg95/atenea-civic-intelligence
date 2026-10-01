"""GET /municipio/region — resumen comparativo de la región de la campaña activa."""
import pytest
from sqlalchemy import delete, select

from app.models.campaign import Campaign
from app.models.census import CensusMetric
from app.seeds.demo_municipio_intel import seed_intel
from app.seeds.municipios import MUNICIPIOS, municipios_de_region
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers

REGION_CODES = [m.code for m in municipios_de_region("atizapan")]


@pytest.fixture
def region_seeded():
    db = TestingSessionLocal()
    try:
        for code in REGION_CODES + ["15076"]:
            seed_intel(db, MUNICIPIOS[code])
        yield
        db.execute(delete(CensusMetric).where(CensusMetric.territory_code.in_(REGION_CODES + ["15076"])))
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


def test_region_atizapan_7_municipios_campana_primero(client, region_seeded):
    _set_muni("15013")
    r = client.get("/api/municipio/region", headers={**auth_headers(client, "coord@alpha.gov"),
                                                    "X-Campaign-Id": ALPHA_CAMPAIGN_ID})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["region"] == "Atizapán y periferia"
    assert len(body["municipios"]) == 7
    first = body["municipios"][0]
    assert first["code"] == "15013" and first["es_campana"] is True
    assert first["lista_nominal_2024"] == 422224
    assert first["secciones_total"] == 174 and first["poblacion"] == 523674
    # resto ordenado por lista nominal desc
    rest = [m["lista_nominal_2024"] for m in body["municipios"][1:]]
    assert rest == sorted(rest, reverse=True)


def test_region_sma_solo_sma(client, region_seeded):
    _set_muni("15076")
    r = client.get("/api/municipio/region", headers={**auth_headers(client, "coord@alpha.gov"),
                                                    "X-Campaign-Id": ALPHA_CAMPAIGN_ID})
    assert [m["code"] for m in r.json()["municipios"]] == ["15076"]


def test_region_errores(client, region_seeded):
    h = auth_headers(client, "coord@alpha.gov")
    assert client.get("/api/municipio/region", headers=h).status_code == 400
    _set_muni(None)
    assert client.get("/api/municipio/region", headers={**h, "X-Campaign-Id": ALPHA_CAMPAIGN_ID}).status_code == 404
    _set_muni("15013")
    assert client.get("/api/municipio/region", headers={**auth_headers(client, "activista1@alpha.gov"),
                                                       "X-Campaign-Id": ALPHA_CAMPAIGN_ID}).status_code == 403


def test_catalogo_municipios(client):
    r = client.get("/api/municipio/catalogo", headers=auth_headers(client, "admin@alpha.gov"))
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 8
    assert body[0]["code"] == "15076"
    assert "15013" in [m["code"] for m in body]
    assert all(m["name"] and m["region"] for m in body)


def test_catalogo_requiere_auth(client):
    assert client.get("/api/municipio/catalogo").status_code == 401
