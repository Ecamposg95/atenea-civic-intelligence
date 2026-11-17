"""GET /municipio/{code}/mapa — sección polygons + metas + 2024 + avance (spec §7)."""
import pytest
from sqlalchemy import delete, select

from app.models.registro import Registro
from app.models.user import User
from tests.conftest import ALPHA_CAMPAIGN_ID, BETA_CAMPAIGN_ID, TestingSessionLocal, auth_headers


def _h(client, email="coord@alpha.gov"):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID
    return h


def _purge():
    db = TestingSessionLocal()
    try:
        db.execute(delete(Registro).where(Registro.promotor == "test-mapa"))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clean():
    _purge()
    yield
    _purge()


def _add(seccion, tipo=None, legacy=False, campaign=ALPHA_CAMPAIGN_ID, email="admin@alpha.gov"):
    db = TestingSessionLocal()
    try:
        u = db.execute(select(User).where(User.email == email)).scalar_one()
        db.add(Registro(organization_id=u.organization_id, campaign_id=campaign,
                        nombre_completo="X", seccion=seccion, tipo=tipo, legacy=legacy,
                        consentimiento=True, promotor="test-mapa"))
        db.commit()
    finally:
        db.close()


def _feat(body, seccion):
    return next(f for f in body["features"] if f["properties"]["seccion"] == seccion)


def test_mapa_features_y_totales(client):
    r = client.get("/api/municipio/15076/mapa", headers=_h(client))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 21
    t = body["totales"]
    assert (t["meta_lideres"], t["meta_activistas"], t["meta_promovidos"]) == (400, 4000, 28000)
    assert t["secciones"] == 22
    f = _feat(body, "4121")["properties"]
    assert f["barrio"] == "ÁLVARO OBREGÓN" and f["region"] == "R-1" and f["prioridad"] == "P2"
    assert f["meta_promovidos"] == 1330
    assert f["resultado_2024"]["margen"] == -115 and f["resultado_2024"]["etiqueta"] == "COMPETITIVA"
    assert _feat(body, "4121")["geometry"]["type"] in ("Polygon", "MultiPolygon")


def test_mapa_feature_combinada_6673_6674(client):
    body = client.get("/api/municipio/15076/mapa", headers=_h(client)).json()
    p = _feat(body, "6673/6674")["properties"]
    assert p["secciones"] == ["6673", "6674"]
    assert p["meta_lideres"] == 17 and p["meta_activistas"] == 170 and p["meta_promovidos"] == 1190
    assert p["region"] == "R-4" and p["prioridad"] == "P2"   # from 6674
    assert {d["seccion"]: d["prioridad"] for d in p["secciones_detalle"]} == {"6673": "P3", "6674": "P2"}
    assert p["resultado_2024"]["lista_nominal"] == 1335 + 2132
    assert p["resultado_2024"]["margen"] == (370 + 531) - (430 + 677)


def test_mapa_avance(client):
    _add("4121", "LIDER")
    _add("4121", "ACTIVISTA")
    _add("4121", "ACTIVISTA")
    _add("4121", "PROMOVIDO")
    _add("4121", None, legacy=True)
    _add("4121", "PROMOVIDO", legacy=True)   # legacy never counts as nuevo
    _add("6673", "PROMOVIDO")
    _add("6674", "PROMOVIDO")
    _add("4121", "PROMOVIDO", campaign=BETA_CAMPAIGN_ID, email="admin@beta.gov")  # other tenant
    body = client.get("/api/municipio/15076/mapa", headers=_h(client)).json()
    a = _feat(body, "4121")["properties"]["avance"]
    assert (a["lideres"], a["activistas"], a["promovidos"], a["viejos"]) == (1, 2, 1, 2)
    assert _feat(body, "6673/6674")["properties"]["avance"]["promovidos"] == 2
    t = body["totales"]
    assert (t["lideres"], t["activistas"], t["promovidos"], t["viejos"]) == (1, 2, 3, 2)


def test_mapa_404_y_roles(client):
    assert client.get("/api/municipio/99999/mapa", headers=_h(client)).status_code == 404
    for email, code in [("analyst@alpha.gov", 200), ("lider@alpha.gov", 200),
                        ("admin@alpha.gov", 200), ("viewer@alpha.gov", 403),
                        ("capturista@alpha.gov", 403)]:
        assert client.get("/api/municipio/15076/mapa", headers=_h(client, email)).status_code == code, email


def test_executive_cuenta_solo_nuevos_y_viejos_aparte(client):
    h = _h(client)
    before = client.get("/api/dashboard/executive", headers=h).json()["promovidos"]
    _add("4121", None, legacy=True)
    _add("4121", None, legacy=True)
    after = client.get("/api/dashboard/executive", headers=h).json()["promovidos"]
    assert after["total"] == before["total"]
    assert after["viejos"] == before["viejos"] + 2
