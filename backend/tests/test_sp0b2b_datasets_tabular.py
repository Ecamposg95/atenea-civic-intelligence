import types
from app.ingestion.datasets import DATASETS


def _ctx(org=None):
    return types.SimpleNamespace(organization_id=org, campaign_id=None,
                                 user=types.SimpleNamespace(id="t"))


def _run():
    return types.SimpleNamespace(id="run-1")


def test_resultados_mapper_maps_row():
    spec = DATASETS["resultados"]
    row = {"nivel": "municipio", "clave": "15001", "partido": "MORENA", "votos": 1234}
    out = spec.row_mapper(row, _ctx(), _run(), {"anio": 2021, "eleccion": "ayuntamiento"})
    assert out["anio"] == 2021 and out["eleccion"] == "ayuntamiento"
    assert out["territory_code"] == "15001" and out["partido"] == "MORENA"
    assert out["votos"] == 1234 and out["organization_id"] is None
    assert out["ingest_run_id"] == "run-1"


def test_resultados_requires_anio_and_eleccion():
    spec = DATASETS["resultados"]
    row = {"nivel": "municipio", "clave": "15001", "partido": "X", "votos": 1}
    import pytest
    with pytest.raises(ValueError):
        spec.row_mapper(row, _ctx(), _run(), {"eleccion": "ayuntamiento"})
    with pytest.raises(ValueError):
        spec.row_mapper(row, _ctx(), _run(), {"anio": 2021})


def test_socio_mapper_maps_row():
    spec = DATASETS["socio"]
    row = {"nivel": "municipio", "clave": "15001", "indicador": "marginacion", "valor": 0.42}
    out = spec.row_mapper(row, _ctx(), _run(), {"anio": 2020})
    assert out["indicador"] == "marginacion" and out["valor"] == 0.42
    assert out["territory_code"] == "15001" and out["anio"] == 2020


def test_resultados_scope_requires_keys():
    spec = DATASETS["resultados"]
    clauses = spec.scope_filter(spec.model, _ctx(), {"anio": 2021, "eleccion": "ayuntamiento", "nivel": "municipio"})
    assert clauses  # non-empty
