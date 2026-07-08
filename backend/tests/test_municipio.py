"""Municipal intelligence panorama — study data shaping + endpoint gating.

Isolation note: the test DB is session-scoped and shared, so this module seeds
under codes no other test uses (secciones 9991/9992) and cleans up everything it
inserts in an autouse teardown, leaving shared state untouched for other tests.
"""
import pytest
from sqlalchemy import delete, select

from tests.conftest import TestingSessionLocal, auth_headers
from app.models.census import CensusMetric
from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.seccion_electoral import SeccionElectoral
from app.seeds.demo_municipio_intel import seed_municipio_intel
from app.services import municipio_service

_MUNI = "15076"
_TEST_SECCIONES = ["9991", "9992"]


def _seed_study():
    db = TestingSessionLocal()
    try:
        if db.execute(select(ElectoralArea).where(ElectoralArea.code == _MUNI)).scalar_one_or_none() is None:
            db.add(ElectoralArea(name="San Mateo Atenco", code=_MUNI,
                                 level=AreaLevel.MUNICIPIO, organization_id=None))
        for code, morena, coal, margen in [("9991", 1023, 908, -500), ("9992", 200, 1133, 500)]:
            if db.execute(select(SeccionElectoral).where(
                SeccionElectoral.seccion == code, SeccionElectoral.anio == 2024)).scalar_one_or_none() is None:
                db.add(SeccionElectoral(
                    seccion=code, municipio="San Mateo Atenco", anio=2024,
                    lista_nominal=3954, votos=2647, participacion=66.9,
                    coalicion=coal, morena=morena, margen=margen, prioridad="COMPETITIVA"))
        db.commit()
        seed_municipio_intel(db)
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    db = TestingSessionLocal()
    try:
        db.execute(delete(CensusMetric).where(CensusMetric.territory_code == _MUNI))
        db.execute(delete(SeccionElectoral).where(SeccionElectoral.seccion.in_(_TEST_SECCIONES)))
        db.commit()
    finally:
        db.close()


def test_panorama_service_shapes_study_data():
    _seed_study()
    db = TestingSessionLocal()
    try:
        p = municipio_service.panorama(db, _MUNI)
    finally:
        db.close()
    assert p is not None
    assert p["municipio"]["name"] == "San Mateo Atenco"
    assert p["socio"]["poblacion"] == 97418
    # electoral history: 4 years present, ascending
    assert [h["anio"] for h in p["historico"]] == [2015, 2018, 2021, 2024]
    assert p["historico"][-1]["margen_votos"] == 874
    # party breakdown sorted desc, MORENA leads
    assert p["voto2024"][0]["partido"] == "MORENA"
    assert p["voto2024"][0]["votos"] == 19254
    # section resumen from census
    assert p["secciones_resumen"]["total"] == 22
    assert p["secciones_resumen"]["persuadibles"] == 11
    # our test sections are present and ordered by margen asc (9991:-500 before 9992:500)
    codes = [s["seccion"] for s in p["secciones"] if s["seccion"] in _TEST_SECCIONES]
    assert codes == ["9991", "9992"]


def test_panorama_seed_is_idempotent():
    _seed_study()
    _seed_study()  # second run must not duplicate metrics
    db = TestingSessionLocal()
    try:
        rows = db.execute(select(CensusMetric).where(
            CensusMetric.territory_code == _MUNI,
            CensusMetric.indicador == "poblacion")).scalars().all()
    finally:
        db.close()
    assert len(rows) == 1  # single poblacion row, not duplicated


def test_panorama_endpoint_gated_and_ok(client):
    _seed_study()
    assert client.get("/api/municipio/15076/panorama").status_code == 401
    r = client.get("/api/municipio/15076/panorama",
                   headers=auth_headers(client, "coord@alpha.gov"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["socio"]["poblacion"] == 97418
    assert body["secciones_resumen"]["morena"] == 12


def test_panorama_unknown_municipio_404(client):
    r = client.get("/api/municipio/99999/panorama",
                   headers=auth_headers(client, "coord@alpha.gov"))
    assert r.status_code == 404
