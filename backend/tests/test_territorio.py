"""Territorio + promovidos — modelos, scope, asignación, tabla."""
from app.models.user import User
from app.models.registro import Registro
from app.models.seccion_electoral import SeccionElectoral


def test_models_have_new_columns():
    assert "area_id" in User.__table__.columns
    assert "promotor" in Registro.__table__.columns
    cols = set(SeccionElectoral.__table__.columns.keys())
    assert {"seccion", "municipio", "anio", "lista_nominal", "votos",
            "participacion", "coalicion", "morena", "margen", "prioridad"}.issubset(cols)
