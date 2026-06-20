# backend/tests/test_sp0b2b_datasets_point.py
import types, json
from app.ingestion.datasets import DATASETS, _point_geometry
from app.models.electoral_area import AreaLevel


def _ctx(org=None):
    return types.SimpleNamespace(organization_id=org, campaign_id=None,
                                 user=types.SimpleNamespace(id="t"))


def _run():
    return types.SimpleNamespace(id="run-1")


def test_point_geometry_sqlite_is_json_text():
    g = _point_geometry(-99.1, 19.4, db=None)  # no db → sqlite branch
    assert json.loads(g) == {"lon": -99.1, "lat": 19.4}
    assert _point_geometry(None, None, db=None) is None


def test_denue_mapper():
    spec = DATASETS["denue"]
    row = {"clave": "D1", "nombre": "Tienda", "actividad": "461110",
           "territory_code": "15001", "lon": -99.1, "lat": 19.4}
    out = spec.row_mapper(row, _ctx(), _run(), {})
    assert out["clave"] == "D1" and out["territory_code"] == "15001"
    assert out["lat"] == 19.4 and out["lon"] == -99.1
    assert out["geometry"] is not None and out["organization_id"] is None


def test_casillas_mapper_builds_electoral_area():
    spec = DATASETS["casillas"]
    row = {"code": "C-15001-B1", "name": "Básica 1", "lon": -99.1, "lat": 19.4}
    out = spec.row_mapper(row, _ctx(), _run(), {})
    assert out["level"] == AreaLevel.CASILLA
    assert out["code"] == "C-15001-B1" and out["organization_id"] is None
    assert out["geometry"] is not None


def test_casillas_scope_is_global_casilla():
    spec = DATASETS["casillas"]
    clauses = spec.scope_filter(spec.model, _ctx(), {})
    assert clauses
