import datetime as dt
import pytest
from pydantic import ValidationError
from app.models.scrum import Sprint, WorkItem, WorkItemTask
from app.schemas.scrum import WorkItemCreate, SprintCreate, SprintUpdate
from app.services import scrum_service


def test_scrum_entities_persist(db_session):
    s = Sprint(organization_id="org-1", campaign_id="camp-1", nombre="Sprint 1",
               fecha_inicio=dt.date(2026, 7, 8), fecha_fin=dt.date(2026, 7, 22),
               estado="PLANIFICACION")
    db_session.add(s); db_session.flush()
    wi = WorkItem(organization_id="org-1", campaign_id="camp-1", titulo="Historia A",
                  tipo="HISTORIA", story_points=5, estado="POR_HACER", prioridad="MEDIA",
                  orden=0, sprint_id=s.id)
    db_session.add(wi); db_session.flush()
    t = WorkItemTask(organization_id="org-1", campaign_id="camp-1", work_item_id=wi.id,
                     texto="subtarea", done=False, orden=0)
    db_session.add(t); db_session.flush()
    assert wi.sprint_id == s.id and wi.completed_at is None
    assert wi.origin_acuerdo_id is None and t.work_item_id == wi.id


def test_workitem_rejects_non_fibonacci_points():
    WorkItemCreate(titulo="H", story_points=8)          # ok
    WorkItemCreate(titulo="H2", story_points=None)       # ok (sin estimar)
    with pytest.raises(ValidationError):
        WorkItemCreate(titulo="bad", story_points=4)     # 4 no es Fibonacci


def test_sprint_create_defaults_estado():
    s = SprintCreate(nombre="S1", fecha_inicio="2026-07-08", fecha_fin="2026-07-22")
    assert s.estado == "PLANIFICACION"


def test_only_one_active_sprint(db_session, coordinador_ctx):
    s1 = scrum_service.create_sprint(db_session, coordinador_ctx,
        SprintCreate(nombre="S1", fecha_inicio="2026-07-08", fecha_fin="2026-07-22"))
    s2 = scrum_service.create_sprint(db_session, coordinador_ctx,
        SprintCreate(nombre="S2", fecha_inicio="2026-07-23", fecha_fin="2026-08-06"))
    scrum_service.activar_sprint(db_session, coordinador_ctx, s1.id)
    with pytest.raises(scrum_service.SprintActivoExiste):
        scrum_service.activar_sprint(db_session, coordinador_ctx, s2.id)
    assert scrum_service.active_sprint(db_session, coordinador_ctx).id == s1.id
    scrum_service.cerrar_sprint(db_session, coordinador_ctx, s1.id)
    assert scrum_service.active_sprint(db_session, coordinador_ctx) is None


def test_create_sprint_rejects_second_activo(db_session, coordinador_ctx):
    scrum_service.create_sprint(db_session, coordinador_ctx,
        SprintCreate(nombre="S1", fecha_inicio="2026-07-08", fecha_fin="2026-07-22",
                     estado="ACTIVO"))
    with pytest.raises(scrum_service.SprintActivoExiste):
        scrum_service.create_sprint(db_session, coordinador_ctx,
            SprintCreate(nombre="S2", fecha_inicio="2026-07-23", fecha_fin="2026-08-06",
                         estado="ACTIVO"))


def test_update_sprint_rejects_second_activo(db_session, coordinador_ctx):
    s1 = scrum_service.create_sprint(db_session, coordinador_ctx,
        SprintCreate(nombre="S1", fecha_inicio="2026-07-08", fecha_fin="2026-07-22",
                     estado="ACTIVO"))
    s2 = scrum_service.create_sprint(db_session, coordinador_ctx,
        SprintCreate(nombre="S2", fecha_inicio="2026-07-23", fecha_fin="2026-08-06"))
    with pytest.raises(scrum_service.SprintActivoExiste):
        scrum_service.update_sprint(db_session, coordinador_ctx, s2.id,
            SprintUpdate(estado="ACTIVO"))
    assert scrum_service.active_sprint(db_session, coordinador_ctx).id == s1.id


def test_create_sprint_activo_succeeds_when_none_active(db_session, coordinador_ctx):
    s = scrum_service.create_sprint(db_session, coordinador_ctx,
        SprintCreate(nombre="S1", fecha_inicio="2026-07-08", fecha_fin="2026-07-22",
                     estado="ACTIVO"))
    assert s.estado == "ACTIVO"
    assert scrum_service.active_sprint(db_session, coordinador_ctx).id == s.id
