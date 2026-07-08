"""Operación territorial — plan por sección (electoral context + avance + meta
sugerida), agenda 30/60/90, y gating. Isolated via unique code 8881 + cleanup."""
import pytest
from sqlalchemy import delete, select

from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers
from app.models.operacion import AgendaItem, SeccionPlan
from app.models.organization import Organization
from app.models.registro import Registro
from app.models.seccion_electoral import SeccionElectoral
from app.services import operacion_service

_SEC = "8881"
_AGENDA_MARK = "TEST_AGENDA_ITEM"


def _hdr(client, email):
    return {**auth_headers(client, email), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}


def _seed():
    db = TestingSessionLocal()
    try:
        org_id = db.execute(select(Organization).where(Organization.slug == "alpha")).scalar_one().id
        if db.execute(select(SeccionElectoral).where(
                SeccionElectoral.seccion == _SEC, SeccionElectoral.anio == 2024)).scalar_one_or_none() is None:
            db.add(SeccionElectoral(
                seccion=_SEC, municipio="San Mateo Atenco", anio=2024,
                lista_nominal=3000, votos=2000, participacion=66.0,
                coalicion=900, morena=950, margen=50, prioridad="ALTA_PERSUADIBLE"))
        # two promovidos (Registro) in section 8881 for the alpha campaign → avance
        for i in range(2):
            db.add(Registro(
                organization_id=org_id, campaign_id=ALPHA_CAMPAIGN_ID,
                nombre_completo=f"Promovido {i}", seccion=_SEC, consentimiento=True))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    db = TestingSessionLocal()
    try:
        db.execute(delete(Registro).where(Registro.seccion == _SEC))
        db.execute(delete(SeccionElectoral).where(SeccionElectoral.seccion == _SEC))
        db.execute(delete(SeccionPlan).where(SeccionPlan.seccion == _SEC))
        db.execute(delete(AgendaItem).where(AgendaItem.titulo == _AGENDA_MARK))
        db.commit()
    finally:
        db.close()


def test_suggest_meta():
    assert operacion_service.suggest_meta("ALTA_PERSUADIBLE") == 30
    assert operacion_service.suggest_meta("RECUPERAR_OPOSICION") == 15
    assert operacion_service.suggest_meta(None) == 15


def _find(planes, sec):
    return next((p for p in planes if p["seccion"] == sec), None)


def test_planes_electoral_context_and_avance(client):
    _seed()
    r = client.get("/api/operacion/planes", headers=_hdr(client, "coord@alpha.gov"))
    assert r.status_code == 200, r.text
    row = _find(r.json(), _SEC)
    assert row is not None
    assert row["electoral"]["prioridad"] == "ALTA_PERSUADIBLE"
    assert row["electoral"]["persuadible"] is True  # |margen 50| <= 150
    assert row["plan"]["meta_sugerida"] == 30  # from priority
    assert row["plan"]["meta_semanal"] is None  # not set yet
    assert row["avance"]["promovidos"] == 2
    assert row["avance"]["meta"] == 30  # falls back to suggested
    assert row["avance"]["pct"] == round(2 / 30 * 100)


def test_upsert_plan_then_reflected(client):
    _seed()
    up = client.put(f"/api/operacion/planes/{_SEC}",
                    headers=_hdr(client, "coord@alpha.gov"),
                    json={"problema_dominante": "agua", "meta_semanal": 40, "liderazgo": "Sra. López"})
    assert up.status_code == 200, up.text
    row = _find(client.get("/api/operacion/planes", headers=_hdr(client, "coord@alpha.gov")).json(), _SEC)
    assert row["plan"]["problema_dominante"] == "agua"
    assert row["plan"]["meta_semanal"] == 40
    assert row["avance"]["meta"] == 40  # now uses the set meta
    assert row["avance"]["pct"] == 5    # 2/40


def test_plan_edit_gated_to_manager(client):
    # viewer can read but not edit
    assert client.get("/api/operacion/planes", headers=_hdr(client, "viewer@alpha.gov")).status_code == 200
    r = client.put(f"/api/operacion/planes/{_SEC}", headers=_hdr(client, "viewer@alpha.gov"),
                   json={"meta_semanal": 10})
    assert r.status_code == 403


def test_seguimiento_rollup_semaforo_and_trend(client):
    _seed()  # section 8881: 2 promovidos vs suggested meta 30 → rojo
    r = client.get("/api/operacion/seguimiento", headers=_hdr(client, "coord@alpha.gov"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["resumen"]["secciones"] >= 1
    assert body["resumen"]["en_riesgo"] >= 1
    sem = next((s for s in body["semaforo"] if s["seccion"] == _SEC), None)
    assert sem is not None and sem["status"] == "rojo" and sem["promovidos"] == 2
    # cumulative weekly trend (from the 2 seeded promovidos' created_at)
    assert isinstance(body["tendencia"], list) and body["tendencia"]
    assert body["tendencia"][-1]["promovidos"] >= 2
    # alerts carry the shortfall
    assert all("faltan" in a for a in body["alertas"])


def test_agenda_crud(client):
    created = client.post("/api/operacion/agenda", headers=_hdr(client, "coord@alpha.gov"),
                          json={"fase": 30, "titulo": _AGENDA_MARK, "descripcion": "Diagnóstico"})
    assert created.status_code == 201, created.text
    item_id = created.json()["id"]
    listed = client.get("/api/operacion/agenda", headers=_hdr(client, "coord@alpha.gov")).json()
    assert any(i["id"] == item_id and i["fase"] == 30 for i in listed)
    done = client.patch(f"/api/operacion/agenda/{item_id}", headers=_hdr(client, "coord@alpha.gov"),
                        json={"done": True})
    assert done.status_code == 200 and done.json()["done"] is True
