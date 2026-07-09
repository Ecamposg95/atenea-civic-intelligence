import datetime as dt
import pytest
from pydantic import ValidationError
from app.models.minuta import Minuta, Acuerdo
from app.schemas.minuta import MinutaCreate, AcuerdoUpdate, MinutaRead


def test_minuta_and_acuerdo_persist(db_session):
    m = Minuta(
        organization_id="org-1", campaign_id="camp-1",
        titulo="Reunión de arranque", fecha=dt.date(2026, 7, 8),
        tipo="REUNION", estado="BORRADOR",
        asistentes=[{"nombre": "Lucy"}, {"user_id": "u-2", "nombre": "Juan"}],
        cuerpo="Notas de la reunión.",
    )
    db_session.add(m)
    db_session.flush()
    a = Acuerdo(
        organization_id="org-1", campaign_id="camp-1", minuta_id=m.id,
        texto="Levantar padrón de la sección 123", orden=0,
        estado="PENDIENTE", fecha_limite=dt.date(2026, 7, 15),
    )
    db_session.add(a)
    db_session.flush()
    assert m.id and a.minuta_id == m.id
    assert m.estado == "BORRADOR" and a.estado == "PENDIENTE"
    assert a.work_item_id is None


def test_minuta_create_validates_estado_and_tipo():
    m = MinutaCreate(titulo="Junta", fecha=dt.date(2026, 7, 8), tipo="REUNION")
    assert m.estado == "BORRADOR"
    with pytest.raises(ValidationError):
        MinutaCreate(titulo="x", fecha=dt.date(2026, 7, 8), tipo="INVALIDO")


def test_acuerdo_update_rejects_bad_estado():
    AcuerdoUpdate(estado="CUMPLIDO")
    with pytest.raises(ValidationError):
        AcuerdoUpdate(estado="ARCHIVADO")


def test_minuta_read_from_orm_with_nested_acuerdos(db_session):
    m = Minuta(organization_id="org-1", campaign_id="camp-1", titulo="T",
               fecha=dt.date(2026, 7, 8), tipo="REUNION", estado="BORRADOR",
               asistentes=[], cuerpo=None)
    db_session.add(m)
    db_session.flush()
    a = Acuerdo(organization_id="org-1", campaign_id="camp-1", minuta_id=m.id,
                texto="x", orden=0, estado="PENDIENTE")
    db_session.add(a)
    db_session.flush()
    m.acuerdos = [a]
    m.acuerdos_pendientes = 1
    out = MinutaRead.model_validate(m, from_attributes=True)
    assert out.id == m.id and len(out.acuerdos) == 1
    assert out.acuerdos[0].texto == "x"
