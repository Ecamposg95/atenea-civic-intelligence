import datetime as dt
import pytest
from pydantic import ValidationError
from app.models.minuta import Minuta, Acuerdo
from app.schemas.minuta import MinutaCreate, AcuerdoUpdate, MinutaRead, MinutaUpdate
from app.services import minuta_service
from tests.conftest import _militante_ctx, TestingSessionLocal


# ── Service fixtures ───────────────────────────────────────────────────────────
# `coordinador_ctx` is provided by conftest.py (shared with test_casos.py /
# test_militantes.py). `lider_ctx` does not exist yet anywhere, so it is built
# here with the same `_militante_ctx(db, email)` helper conftest uses — same
# pattern, same seeded user (lider@alpha.gov), same db_session.
@pytest.fixture
def lider_ctx(db_session):
    return _militante_ctx(db_session, "lider@alpha.gov")


def _purge_minutas():
    db = TestingSessionLocal()
    try:
        db.query(Acuerdo).delete()
        db.query(Minuta).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clean_minutas():
    # The shared db_session fixture only purges militante rows, so this module
    # purges minutas/acuerdos itself to keep total-count assertions isolated.
    _purge_minutas()
    yield
    _purge_minutas()


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


# ── Service: create/list/get/update/delete + scoping + publish lock ──────────

def test_create_minuta_with_acuerdos_inherits_scope(db_session, coordinador_ctx):
    data = MinutaCreate(
        titulo="Arranque", fecha="2026-07-08", tipo="REUNION",
        asistentes=[{"nombre": "Lucy"}],
        acuerdos=[{"texto": "Padrón sección 123", "fecha_limite": "2026-07-15"}],
    )
    m = minuta_service.create_minuta(db_session, coordinador_ctx, data)
    assert m.organization_id == coordinador_ctx.organization_id
    assert m.campaign_id == coordinador_ctx.campaign_id
    rows, total = minuta_service.list_minutas(db_session, coordinador_ctx)
    assert total == 1 and rows[0].id == m.id
    # acuerdo heredó scope de la minuta
    ac = db_session.query(Acuerdo).filter_by(minuta_id=m.id).one()
    assert ac.organization_id == m.organization_id and ac.campaign_id == m.campaign_id


def test_publish_locks_body_for_non_coordinator(db_session, coordinador_ctx, lider_ctx):
    # coordinador crea y publica
    m = minuta_service.create_minuta(
        db_session, coordinador_ctx,
        MinutaCreate(titulo="Acta", fecha="2026-07-08"))
    minuta_service.update_minuta(db_session, coordinador_ctx, m.id,
                                 MinutaUpdate(estado="PUBLICADA"))
    # lider intenta editar cuerpo de acta publicada → bloqueado
    with pytest.raises(minuta_service.PublishedLockError):
        minuta_service.update_minuta(db_session, lider_ctx, m.id,
                                     MinutaUpdate(cuerpo="cambio ilegal"))


def test_publish_lock_allows_coordinator_and_allows_estado_change_for_others(
        db_session, coordinador_ctx, lider_ctx):
    m = minuta_service.create_minuta(
        db_session, coordinador_ctx,
        MinutaCreate(titulo="Acta", fecha="2026-07-08"))
    minuta_service.update_minuta(db_session, coordinador_ctx, m.id,
                                 MinutaUpdate(estado="PUBLICADA"))
    # coordinador can still edit narrative fields after publishing
    updated = minuta_service.update_minuta(db_session, coordinador_ctx, m.id,
                                           MinutaUpdate(titulo="Acta editada"))
    assert updated.titulo == "Acta editada"
    # non-coordinator editing a NON-narrative field (estado) on a PUBLICADA
    # minuta is not locked — only titulo/fecha/lugar/cuerpo/tipo are.
    lider_owned = minuta_service.create_minuta(
        db_session, lider_ctx, MinutaCreate(titulo="Junta líder", fecha="2026-07-08"))
    minuta_service.update_minuta(db_session, coordinador_ctx, lider_owned.id,
                                 MinutaUpdate(estado="PUBLICADA"))
    reopened = minuta_service.update_minuta(db_session, lider_ctx, lider_owned.id,
                                            MinutaUpdate(estado="BORRADOR"))
    assert reopened.estado == "BORRADOR"


def test_list_and_get_scoped_by_role(db_session, coordinador_ctx, lider_ctx, activista_ctx):
    m_lider = minuta_service.create_minuta(
        db_session, lider_ctx, MinutaCreate(titulo="Junta líder", fecha="2026-07-08"))
    m_activista = minuta_service.create_minuta(
        db_session, activista_ctx, MinutaCreate(titulo="Nota activista", fecha="2026-07-08"))

    # COORDINADOR sees the whole campaign.
    rows, total = minuta_service.list_minutas(db_session, coordinador_ctx)
    assert total == 2
    assert minuta_service.get_minuta(db_session, coordinador_ctx, m_activista.id) is not None

    # LIDER sees own + supervised activista's minutas (activista1 reports to lider).
    rows, total = minuta_service.list_minutas(db_session, lider_ctx)
    ids = {r.id for r in rows}
    assert total == 2 and ids == {m_lider.id, m_activista.id}

    # ACTIVISTA sees only its own.
    rows, total = minuta_service.list_minutas(db_session, activista_ctx)
    assert total == 1 and rows[0].id == m_activista.id
    assert minuta_service.get_minuta(db_session, activista_ctx, m_lider.id) is None


def test_delete_minuta_soft_deletes_and_excludes_from_list(db_session, coordinador_ctx):
    m = minuta_service.create_minuta(
        db_session, coordinador_ctx, MinutaCreate(titulo="Borrar", fecha="2026-07-08"))
    assert minuta_service.delete_minuta(db_session, coordinador_ctx, m.id) is True
    assert m.deleted_at is not None
    rows, total = minuta_service.list_minutas(db_session, coordinador_ctx)
    assert total == 0
    assert minuta_service.get_minuta(db_session, coordinador_ctx, m.id) is None
    # deleting again (already gone) is a no-op false
    assert minuta_service.delete_minuta(db_session, coordinador_ctx, m.id) is False


def test_enrich_acuerdos_sets_responsable_nombre_and_pendientes_count(
        db_session, coordinador_ctx):
    data = MinutaCreate(
        titulo="Con acuerdos", fecha="2026-07-08",
        acuerdos=[
            {"texto": "Uno", "responsable_id": coordinador_ctx.user.id},
            {"texto": "Dos"},
        ],
    )
    m = minuta_service.create_minuta(db_session, coordinador_ctx, data)
    assert m.acuerdos_pendientes == 2
    names = {a.responsable_nombre for a in m.acuerdos if a.responsable_id}
    assert coordinador_ctx.user.full_name in names
