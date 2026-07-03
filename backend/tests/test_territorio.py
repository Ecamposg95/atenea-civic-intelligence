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


def test_seccion_electoral_table_is_created():
    from tests.conftest import TestingSessionLocal
    from app.models.seccion_electoral import SeccionElectoral
    db = TestingSessionLocal()
    try:
        db.add(SeccionElectoral(seccion="0001", anio=2024, margen=10, prioridad="COMPETITIVA"))
        db.commit()
        from sqlalchemy import select
        row = db.execute(select(SeccionElectoral).where(SeccionElectoral.seccion == "0001")).scalar_one()
        assert row.anio == 2024 and row.prioridad == "COMPETITIVA"
    finally:
        db.close()


from sqlalchemy import select
from tests.conftest import TestingSessionLocal
from app.models.electoral_area import ElectoralArea, AreaLevel
from app.services import territory_service


def _seed_muni_with_secciones():
    db = TestingSessionLocal()
    try:
        muni = ElectoralArea(name="San Mateo Atenco", code="15076",
                             level=AreaLevel.MUNICIPIO, organization_id=None)
        db.add(muni); db.flush()
        s1 = ElectoralArea(name="Sección 4121", code="4121", level=AreaLevel.SECCION,
                           organization_id=None, municipio_id=muni.id, parent_id=muni.id)
        s2 = ElectoralArea(name="Sección 4122", code="4122", level=AreaLevel.SECCION,
                           organization_id=None, municipio_id=muni.id, parent_id=muni.id)
        db.add_all([s1, s2]); db.commit()
        return muni.id
    finally:
        db.close()


def test_scope_secciones_for_municipio():
    from app.models.user import User
    muni_id = _seed_muni_with_secciones()
    db = TestingSessionLocal()
    try:
        user = db.execute(select(User).where(User.email == "coord@alpha.gov")).scalar_one()
        user.area_id = muni_id
        db.commit()
        secs = territory_service.scope_secciones(db, user)
        assert secs == {"4121", "4122"}
    finally:
        db.close()


def test_scope_secciones_empty_without_area():
    from app.models.user import User
    db = TestingSessionLocal()
    try:
        user = db.execute(select(User).where(User.email == "lider@alpha.gov")).scalar_one()
        user.area_id = None
        db.commit()
        assert territory_service.scope_secciones(db, user) == set()
    finally:
        db.close()
