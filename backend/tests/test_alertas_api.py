"""GET /api/alertas — RBAC, campaña requerida, T1/O1 de punta a punta, resumen,
orden y ausencia de PII ciudadana."""
from datetime import date, timedelta

import pytest
from sqlalchemy import delete, select

from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers
from app.models.atencion import Caso
from app.models.organization import Organization
from app.models.registro import Registro
from app.models.seccion_electoral import SeccionElectoral

_T1, _O1 = "8891", "8892"
_SECRETO_CASO = "Ciudadana Secreta Alertas"
_SECRETO_REG = "Promovido Secreto Alertas"
_RANGO = {"critica": 0, "alta": 1, "media": 2}


def _hdr(client, email):
    return {**auth_headers(client, email), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}


@pytest.fixture(autouse=True)
def _seed():
    db = TestingSessionLocal()
    try:
        org_id = db.execute(select(Organization).where(Organization.slug == "alpha")).scalar_one().id
        db.add_all([
            SeccionElectoral(seccion=_T1, municipio="San Mateo Atenco", anio=2024,
                             margen=50, participacion=64.0, prioridad="ALTA_PERSUADIBLE"),
            SeccionElectoral(seccion=_O1, municipio="San Mateo Atenco", anio=2024,
                             margen=900, participacion=63.0, prioridad="RECUPERAR_OPOSICION"),
            Registro(organization_id=org_id, campaign_id=ALPHA_CAMPAIGN_ID,
                     nombre_completo=_SECRETO_REG, seccion=_T1, consentimiento=True),
            Caso(organization_id=org_id, campaign_id=ALPHA_CAMPAIGN_ID, folio="AC-TEST-PII",
                 tipo="QUEJA", titulo="Caso alertas", ciudadano_nombre=_SECRETO_CASO,
                 estado="PENDIENTE", fecha_compromiso=date.today() - timedelta(days=5)),
        ])
        db.commit()
    finally:
        db.close()
    yield
    db = TestingSessionLocal()
    try:
        db.execute(delete(SeccionElectoral).where(SeccionElectoral.seccion.in_([_T1, _O1])))
        db.execute(delete(Registro).where(Registro.nombre_completo == _SECRETO_REG))
        db.execute(delete(Caso).where(Caso.folio == "AC-TEST-PII"))
        db.commit()
    finally:
        db.close()


def test_requiere_campana(client):
    r = client.get("/api/alertas", headers=auth_headers(client, "coord@alpha.gov"))
    assert r.status_code == 400


@pytest.mark.parametrize("email", ["coord@alpha.gov", "admin@alpha.gov", "super@atlas.gov"])
def test_roles_permitidos(client, email):
    assert client.get("/api/alertas", headers=_hdr(client, email)).status_code == 200


@pytest.mark.parametrize("email", [
    "lider@alpha.gov", "activista1@alpha.gov", "capturista@alpha.gov",
    "consulta@alpha.gov", "analyst@alpha.gov", "viewer@alpha.gov",
])
def test_roles_denegados(client, email):
    assert client.get("/api/alertas", headers=_hdr(client, email)).status_code == 403


def test_t1_y_o1_de_punta_a_punta(client):
    body = client.get("/api/alertas", headers=_hdr(client, "coord@alpha.gov")).json()
    claves = {a["clave"]: a for a in body["items"]}
    assert claves[f"T1:{_T1}"]["severidad"] == "critica"
    assert claves[f"O1:{_O1}"]["severidad"] == "alta"
    assert f"O1:{_T1}" not in claves and f"T1:{_O1}" not in claves
    celdas = {c["seccion"]: c["severidad_max"] for c in body["secciones"]}
    assert celdas[_T1] == "critica" and celdas[_O1] == "alta"
    assert "peso" not in claves[f"T1:{_T1}"]


def test_resumen_cuadra_y_orden(client):
    body = client.get("/api/alertas", headers=_hdr(client, "coord@alpha.gov")).json()
    items, res = body["items"], body["resumen"]
    for sev in ("critica", "alta", "media"):
        assert res[sev] == sum(1 for a in items if a["severidad"] == sev)
    for cat in ("territorial", "operativa"):
        assert res[cat] == sum(1 for a in items if a["categoria"] == cat)
    assert res["secciones_total"] == len(body["secciones"])
    assert res["secciones_afectadas"] == sum(1 for c in body["secciones"] if c["severidad_max"])
    rangos = [_RANGO[a["severidad"]] for a in items]
    assert rangos == sorted(rangos)
    assert body["evaluado_en"]


def test_sin_pii_ciudadana(client):
    r = client.get("/api/alertas", headers=_hdr(client, "coord@alpha.gov"))
    assert r.status_code == 200
    assert any(a["regla"] == "O3" for a in r.json()["items"])
    assert _SECRETO_CASO not in r.text and _SECRETO_REG not in r.text
