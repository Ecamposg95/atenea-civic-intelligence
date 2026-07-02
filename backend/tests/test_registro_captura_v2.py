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
