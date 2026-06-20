import pytest
from app.models.election_result import ElectionResult
from app.models.socio import SocioMetric
from app.models.economic_unit import EconomicUnit
from tests.conftest import TestingSessionLocal


def test_models_persist_and_read():
    db = TestingSessionLocal()
    try:
        db.add(ElectionResult(anio=2021, nivel="municipio", territory_code="15001",
                              eleccion="ayuntamiento", partido="MORENA", votos=1234))
        db.add(SocioMetric(anio=2020, nivel="municipio", territory_code="15001",
                           indicador="marginacion", valor=0.42))
        db.add(EconomicUnit(clave="DENUE-1", nombre="Tienda", territory_code="15001",
                            lat=19.4, lon=-99.1))
        db.commit()
        assert db.query(ElectionResult).count() == 1
        assert float(db.query(SocioMetric).filter_by(indicador="marginacion").one().valor) == pytest.approx(0.42)
        assert db.query(EconomicUnit).one().clave == "DENUE-1"
    finally:
        db.rollback()
        db.close()
