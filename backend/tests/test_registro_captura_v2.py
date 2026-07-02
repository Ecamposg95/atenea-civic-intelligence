"""Captura v2 — nuevos campos + vista de equipo (activista_nombre, scope, coordinador read)."""
import pytest
from pydantic import ValidationError

from app.models.registro import Registro
from app.schemas.registro import RegistroCreate, RegistroRead


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
