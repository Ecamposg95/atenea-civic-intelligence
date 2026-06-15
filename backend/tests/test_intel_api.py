import app.routers.intel as intel_router
from app.integrations.ine.base import IneSourceError

from .conftest import auth_headers


def test_intel_requires_auth(client):
    assert client.get("/api/intel/worldbank/indicators").status_code == 401


def test_worldbank_indicators_list(client):
    headers = auth_headers(client, "admin@alpha.gov")
    r = client.get("/api/intel/worldbank/indicators", headers=headers)
    assert r.status_code == 200
    assert any(i["code"] == "SP.POP.TOTL" for i in r.json()["items"])


def test_ieem_dataset_success(client, monkeypatch):
    headers = auth_headers(client, "admin@alpha.gov")
    monkeypatch.setattr(
        intel_router.ieem, "fetch_dataset",
        lambda key, **kw: {"key": key, "label": "X", "columns": ["A"], "rows": [{"A": "1"}], "count": 1, "source": "IEEM", "url": "u"},
    )
    r = client.get("/api/intel/ieem/municipios", headers=headers)
    assert r.status_code == 200
    assert r.json()["count"] == 1


def test_upstream_failure_returns_502(client, monkeypatch):
    headers = auth_headers(client, "admin@alpha.gov")
    def boom(code, **kw):
        raise IneSourceError("down")
    monkeypatch.setattr(intel_router.worldbank, "fetch_indicator", boom)
    intel_router.CACHE.clear()
    r = client.get("/api/intel/worldbank/indicator/SP.POP.TOTL", headers=headers)
    assert r.status_code == 502
    assert "error" in r.json()
