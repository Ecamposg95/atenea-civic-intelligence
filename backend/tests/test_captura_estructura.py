"""GET /captura/estructura — árbol del papel Líder → Activistas → Promovidos."""
import pytest

from tests.conftest import ALPHA_CAMPAIGN_ID, BETA_CAMPAIGN_ID, TestingSessionLocal, auth_headers
from tests.test_captura_sma import _hoja, _persona, _purge
from app.models.registro import Registro


@pytest.fixture(autouse=True)
def _clean():
    _purge()
    yield
    _purge()


def _h(client, email, campaign=ALPHA_CAMPAIGN_ID):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = campaign
    return h


def _lider(client, nombre, n_act, seccion="4121"):
    r = _hoja(client, {
        "tipo_hoja": "LIDER", "dry_run": False,
        "titular": _persona(nombre=nombre, paterno="LIDER", seccion=seccion),
        "filas": [_persona(nombre=f"{nombre}ACT{i}", paterno="ACTIVO") for i in range(n_act)],
    })
    assert r.status_code == 200, r.text
    return r.json()


def _familia(client, act_id, n, prefix="PROM"):
    r = _hoja(client, {"tipo_hoja": "FAMILIA", "dry_run": False, "titular": {"id": act_id},
                       "filas": [_persona(nombre=f"{prefix}{i}", paterno="PROMO") for i in range(n)]})
    assert r.status_code == 200, r.text


def _get(client, email="coord@alpha.gov", **params):
    return client.get("/api/captura/estructura", params=params, headers=_h(client, email))


def test_arbol_con_conteos_y_familias_completas(client):
    a = _lider(client, "ANA", 2)
    _familia(client, a["filas"][0]["id"], 7, prefix="COMPLETA")
    _familia(client, a["filas"][1]["id"], 3, prefix="INCOMPLETA")
    _lider(client, "BETO", 0, seccion="6673")

    r = _get(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["meta_activistas"] == 10 and body["meta_promovidos"] == 7
    assert body["total"] == 2
    assert [l["nombre_completo"] for l in body["items"]] == ["ANA LIDER LOPEZ", "BETO LIDER LOPEZ"]
    ana = body["items"][0]
    assert len(ana["activistas"]) == 2
    assert sorted(len(x["promovidos"]) for x in ana["activistas"]) == [3, 7]
    assert ana["total_promovidos"] == 10 and ana["familias_completas"] == 1
    assert body["resumen"] == {"lideres": 2, "activistas": 2, "promovidos": 10,
                               "familias_completas": 1, "lideres_completos": 0}


def test_nunca_expone_clave_ni_curp(client):
    a = _lider(client, "ANA", 1)
    _familia(client, a["filas"][0]["id"], 1)
    raw = _get(client).text
    for k in ("clave", "curp", "telefono"):
        assert k not in raw


def test_filtros_q_y_seccion(client):
    a = _lider(client, "ANA", 1)
    _familia(client, a["filas"][0]["id"], 2, prefix="ZOILA")
    _lider(client, "BETO", 1, seccion="6673")

    # q matches a promovido deep in ANA's tree
    body = _get(client, q="zoila").json()
    assert [l["nombre_completo"] for l in body["items"]] == ["ANA LIDER LOPEZ"]
    # q matches an activista
    assert _get(client, q="BETOACT0").json()["total"] == 1
    # seccion matches the líder's sección
    body = _get(client, seccion="6673").json()
    assert [l["nombre_completo"] for l in body["items"]] == ["BETO LIDER LOPEZ"]
    assert _get(client, q="NADIE").json()["total"] == 0


def test_paginado_por_lider(client):
    for n in ("ANA", "BETO", "CARLA"):
        _lider(client, n, 0)
    body = _get(client, limit=2, offset=0).json()
    assert body["total"] == 3 and len(body["items"]) == 2
    body = _get(client, limit=2, offset=2).json()
    assert [l["nombre_completo"] for l in body["items"]] == ["CARLA LIDER LOPEZ"]


def test_excluye_valores_viejos(client):
    _lider(client, "ANA", 0)
    db = TestingSessionLocal()
    try:
        any_reg = db.query(Registro).filter(Registro.tipo == "LIDER").first()
        db.add(Registro(organization_id=any_reg.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                        nombre_completo="VIEJO LIDER", tipo="LIDER", legacy=True,
                        consentimiento=True, client_uuid="legacy-lider-1"))
        db.commit()
    finally:
        db.close()
    names = [l["nombre_completo"] for l in _get(client).json()["items"]]
    assert names == ["ANA LIDER LOPEZ"]


def test_rbac(client):
    _lider(client, "ANA", 0)
    assert _get(client, "admin@alpha.gov").status_code == 200
    # LIDER may read, but only within the /promovidos scope (no territory → nothing)
    r = _get(client, "lider@alpha.gov")
    assert r.status_code == 200 and r.json()["total"] == 0
    for email in ("capturista@alpha.gov", "viewer@alpha.gov", "activista1@alpha.gov"):
        assert _get(client, email).status_code == 403, email


def test_aislamiento_tenant(client):
    _lider(client, "ANA", 0)
    r = client.get("/api/captura/estructura",
                   headers=_h(client, "admin@beta.gov", BETA_CAMPAIGN_ID))
    assert r.status_code == 200 and r.json()["total"] == 0


# ── /promovidos filters used by the unified Lista (tipo / padre) ─────────────

def test_promovidos_filtra_tipo_y_padre(client):
    a = _lider(client, "ANA", 2)
    act0 = a["filas"][0]["id"]
    _familia(client, act0, 3)
    h = _h(client, "coord@alpha.gov")

    r = client.get("/api/promovidos", params={"legacy": "nuevos", "tipo": "ACTIVISTA"}, headers=h)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 2 and all(i["tipo"] == "ACTIVISTA" for i in items)
    assert all(i["padre_nombre"] == "ANA LIDER LOPEZ" for i in items)

    r = client.get("/api/promovidos", params={"padre_id": act0}, headers=h)
    assert r.json()["total"] == 3

    r = client.get("/api/promovidos", params={"padre": "ana lider"}, headers=h)
    assert r.json()["total"] == 2  # ANA's direct children (her activistas)

    assert client.get("/api/promovidos", params={"tipo": "OTRO"}, headers=h).status_code == 422


def test_export_filtra_legacy_y_tipo(client):
    import csv
    import io

    a = _lider(client, "ANA", 1)
    _familia(client, a["filas"][0]["id"], 2)
    r = client.get("/api/registros/export",
                   params={"format": "csv", "legacy": "nuevos", "tipo": "PROMOVIDO"},
                   headers=_h(client, "admin@alpha.gov"))
    assert r.status_code == 200, r.text
    rows = list(csv.DictReader(io.StringIO(r.content.decode("utf-8"))))
    assert len(rows) == 2
    assert all(x["tipo"] == "PROMOVIDO" and x["valor_viejo"] == "No" for x in rows)
    assert all(x["cadena"] == "ANAACT0 ACTIVO LOPEZ" for x in rows)
    assert all(x["clave"].startswith("****-") for x in rows)
