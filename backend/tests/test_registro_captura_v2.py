"""Captura v2 — nuevos campos + vista de equipo (activista_nombre, scope, coordinador read)."""
import pytest
from pydantic import ValidationError

from app.models.registro import Registro
from app.schemas.registro import RegistroCreate, RegistroRead
from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers


def _hdr(client, email, campaign_id=ALPHA_CAMPAIGN_ID):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = campaign_id
    return h


def test_registro_model_has_captura_v2_columns():
    cols = set(Registro.__table__.columns.keys())
    assert {"sexo", "edad", "estructura", "observacion"}.issubset(cols)


def test_registro_create_accepts_new_fields():
    m = RegistroCreate(
        nombre_completo="Ana Ruiz", consentimiento=True,
        sexo="F", edad=34, estructura="Red Norte", observacion="Interesada en salud",
    )
    assert m.sexo == "F" and m.edad == 34
    assert m.estructura == "Red Norte" and m.observacion == "Interesada en salud"


def test_registro_create_rejects_bad_sexo():
    with pytest.raises(ValidationError):
        RegistroCreate(nombre_completo="X Y", consentimiento=True, sexo="X")


@pytest.mark.parametrize("edad", [-1, 121])
def test_registro_create_rejects_edad_out_of_range(edad):
    with pytest.raises(ValidationError):
        RegistroCreate(nombre_completo="X Y", consentimiento=True, edad=edad)


def test_registro_read_has_activista_nombre_default_none():
    fields = RegistroRead.model_fields
    assert "activista_nombre" in fields
    assert {"sexo", "edad", "estructura", "observacion"}.issubset(fields)


def test_create_persists_new_fields(client):
    h = _hdr(client, "activista1@alpha.gov")
    resp = client.post("/api/registros", json={
        "nombre_completo": "Ana Ruiz", "consentimiento": True,
        "sexo": "F", "edad": 34, "estructura": "Red Norte",
        "observacion": "Interesada en salud",
    }, headers=h)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["sexo"] == "F" and body["edad"] == 34
    assert body["estructura"] == "Red Norte"
    assert body["observacion"] == "Interesada en salud"
    client.delete(f"/api/registros/{body['id']}", headers=h)


def test_lider_sees_team_with_activista_nombre(client):
    ha1 = _hdr(client, "activista1@alpha.gov")
    r = client.post("/api/registros", json={
        "nombre_completo": "Persona de A1", "consentimiento": True}, headers=ha1)
    rid = r.json()["id"]

    hl = _hdr(client, "lider@alpha.gov")
    lst = client.get("/api/registros/mios", headers=hl)
    assert lst.status_code == 200, lst.text
    row = next(x for x in lst.json()["items"] if x["id"] == rid)
    assert row["activista_nombre"] == "Alpha Activista 1"

    client.delete(f"/api/registros/{rid}", headers=ha1)


def test_scope_mine_excludes_team(client):
    ha1 = _hdr(client, "activista1@alpha.gov")
    r = client.post("/api/registros", json={
        "nombre_completo": "Solo de A1", "consentimiento": True}, headers=ha1)
    rid = r.json()["id"]

    hl = _hdr(client, "lider@alpha.gov")
    team = client.get("/api/registros/mios", params={"scope": "team"}, headers=hl)
    mine = client.get("/api/registros/mios", params={"scope": "mine"}, headers=hl)
    team_ids = {x["id"] for x in team.json()["items"]}
    mine_ids = {x["id"] for x in mine.json()["items"]}
    assert rid in team_ids          # el líder ve al activista en 'team'
    assert rid not in mine_ids      # pero no en 'mine' (no es suyo)

    client.delete(f"/api/registros/{rid}", headers=ha1)


def test_coordinador_can_read_and_write(client):
    hc = _hdr(client, "coord@alpha.gov")
    # lectura permitida (200)
    assert client.get("/api/registros/mios", headers=hc).status_code == 200
    # escritura permitida (201) — el coordinador ahora captura (digitaliza papel)
    assert client.post("/api/registros", json={
        "nombre_completo": "Coord captura", "consentimiento": True},
        headers=hc).status_code == 201
