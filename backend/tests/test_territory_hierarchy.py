from app.models.electoral_area import AreaLevel, ElectoralArea
from tests.conftest import TestingSessionLocal


def test_arealevel_has_electoral_levels():
    vals = {l.value for l in AreaLevel}
    assert {"estado", "municipio", "distrito_federal", "distrito_local", "seccion", "casilla"} <= vals


def test_seccion_redundant_fks_and_nullable_tenant():
    cols = {c.name for c in ElectoralArea.__table__.columns}
    assert {"parent_id", "estado_id", "municipio_id", "distrito_federal_id", "distrito_local_id", "seccion_id"} <= cols
    assert ElectoralArea.__table__.c.organization_id.nullable is True


def test_global_reference_area_has_null_tenant():
    db = TestingSessionLocal()
    try:
        estado = ElectoralArea(name="México", level=AreaLevel.ESTADO, organization_id=None)
        db.add(estado); db.flush()
        seccion = ElectoralArea(name="0001", level=AreaLevel.SECCION, organization_id=None, estado_id=estado.id, parent_id=estado.id)
        db.add(seccion); db.flush()
        assert seccion.estado_id == estado.id
        db.rollback()
    finally:
        db.close()
