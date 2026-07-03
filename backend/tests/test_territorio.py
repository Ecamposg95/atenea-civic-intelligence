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


from tests.conftest import auth_headers, ALPHA_CAMPAIGN_ID


def _superhdr(client):
    return auth_headers(client, "super@atlas.gov")


def test_only_superadmin_assigns_territory(client):
    from app.models.user import User
    muni_id = _seed_muni_with_secciones()
    coord_id = _user_id(client, "coord@alpha.gov")

    # admin (not superadmin) → 403
    r = client.put(f"/api/users/{coord_id}/territorio",
                   json={"area_id": muni_id}, headers=auth_headers(client, "admin@alpha.gov"))
    assert r.status_code == 403, r.text

    # superadmin → 200 and area shows on the user
    r = client.put(f"/api/users/{coord_id}/territorio",
                   json={"area_id": muni_id}, headers=_superhdr(client))
    assert r.status_code == 200, r.text
    assert r.json()["area_nombre"] == "San Mateo Atenco"

    # nonexistent area → 404
    r = client.put(f"/api/users/{coord_id}/territorio",
                   json={"area_id": "does-not-exist"}, headers=_superhdr(client))
    assert r.status_code == 404


def test_territory_search_and_perfil(client):
    _seed_muni_with_secciones()
    r = client.get("/api/territory/search", params={"q": "San Mateo"},
                   headers=auth_headers(client, "admin@alpha.gov"))
    assert r.status_code == 200
    assert any(a["name"] == "San Mateo Atenco" for a in r.json())


def _user_id(client, email):
    from sqlalchemy import select
    from app.models.user import User
    from tests.conftest import TestingSessionLocal
    db = TestingSessionLocal()
    try:
        return db.execute(select(User.id).where(User.email == email)).scalar_one()
    finally:
        db.close()
