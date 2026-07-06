import pytest
from app.services import form_schema as fs


SCHEMA = {"secciones": [{"titulo": "Datos", "campos": [
    {"key": "nombre", "tipo": "text", "label": "Nombre", "requerido": True},
    {"key": "tel", "tipo": "phone", "label": "Tel", "sensible": True},
    {"key": "seccion", "tipo": "seccion", "label": "Sección"},
]}]}


def test_validate_schema_ok():
    fs.validate_schema(SCHEMA)  # no raise


def test_validate_schema_rejects_bad_type():
    bad = {"secciones": [{"titulo": "x", "campos": [{"key": "a", "tipo": "nope", "label": "A"}]}]}
    with pytest.raises(fs.SchemaInvalid):
        fs.validate_schema(bad)


def test_validate_answers_requires_required():
    with pytest.raises(fs.AnswersInvalid):
        fs.validate_answers(SCHEMA, {"tel": "555"})  # missing required nombre


def test_split_sensitive():
    pub, sens = fs.split_sensitive(SCHEMA, {"nombre": "Ana", "tel": "5551234567"})
    assert pub == {"nombre": "Ana"} and sens == {"tel": "5551234567"}
