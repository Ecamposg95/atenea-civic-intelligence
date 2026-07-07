"""Caso service tests — folio, territorial auto-routing, lifecycle, bitácora,
panorama. Reuses conftest fixtures (coordinador_ctx/activista_ctx/db_session).

The shared ``db_session`` fixture purges militante rows but not casos, so this
module cleans casos/eventos/form rows itself to keep folio + count assertions
isolated between tests.
"""
import pytest

from app.core.security import hash_password
from app.models.atencion import Caso, CasoEvento, FormDefinition, FormResponse
from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.user import User, UserRole
from app.services import caso_service
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal


def _purge_casos():
    db = TestingSessionLocal()
    try:
        db.query(CasoEvento).delete()
        db.query(Caso).delete()
        db.query(FormResponse).delete()
        db.query(FormDefinition).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clean_casos():
    # Purge before AND after: other modules (e.g. test_atencion_model) seed a
    # caso with folio AC-2026-00001 in the Alpha campaign and never clean up,
    # which would bump this module's MAX-based folio counter.
    _purge_casos()
    yield
    _purge_casos()


def _base_data(**over):
    data = {"tipo": "PETICION", "titulo": "Bache", "descripcion": "esquina",
            "seccion": "4127", "colonia": "Centro"}
    data.update(over)
    return data


# ── Step 1: create → folio, auto-routing, SLA ─────────────────────────────────
def test_crear_directo_autorouting_and_folio(coordinador_ctx, db_session):
    caso = caso_service.crear_directo(db_session, coordinador_ctx, _base_data())
    assert caso.folio.startswith("AC-")
    assert caso.folio.endswith("00001")
    assert caso.estado == "PENDIENTE"
    assert caso.fecha_compromiso is not None
    # coordinador_ctx owns the SECCION-4127 area → routing target is the coordinator.
    assert caso.asignado_a == coordinador_ctx.user.id
    # opening bitácora event written
    ev = db_session.query(CasoEvento).filter(CasoEvento.caso_id == caso.id).all()
    assert any(e.tipo == "CAMBIO_ESTADO" and e.estado_nuevo == "PENDIENTE" for e in ev)


def test_folio_increments_and_contacto_encrypted(coordinador_ctx, db_session):
    c1 = caso_service.crear_directo(db_session, coordinador_ctx, _base_data(contacto="5551234567"))
    c2 = caso_service.crear_directo(db_session, coordinador_ctx, _base_data())
    assert c1.folio.endswith("00001")
    assert c2.folio.endswith("00002")
    # contacto encrypted + masked, never cleartext
    assert c1.contacto_enc is not None
    assert c1.contacto_masked == "****-4567"
    assert b"5551234567" not in (c1.contacto_enc or b"")


def test_autorouting_fallback_none_for_unknown_seccion(coordinador_ctx, db_session):
    caso = caso_service.crear_directo(db_session, coordinador_ctx, _base_data(seccion="9999"))
    assert caso.asignado_a is None  # no user's territory covers 9999 → coordinator queue


# ── crear_desde_respuesta ─────────────────────────────────────────────────────
def test_crear_desde_respuesta_maps_and_links(coordinador_ctx, db_session):
    form = FormDefinition(
        organization_id=coordinador_ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
        nombre="Reporte", tipo="QUEJA", slug="reporte", canal="PUBLICO",
        schema={"fields": []})
    db_session.add(form)
    db_session.flush()
    resp = FormResponse(
        organization_id=coordinador_ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
        form_definition_id=form.id,
        answers={"nombre": "Juan", "telefono": "5559998888", "seccion": "4127",
                 "colonia": "Reforma", "descripcion": "Fuga de agua en la calle"},
        channel="PUBLICO", moderacion="PENDIENTE", nombre_emisor="Juan")
    db_session.add(resp)
    db_session.flush()

    caso = caso_service.crear_desde_respuesta(db_session, coordinador_ctx, resp, form)
    assert caso.tipo == "QUEJA"
    assert caso.ciudadano_nombre == "Juan"
    assert caso.colonia == "Reforma"
    assert caso.seccion == "4127"
    assert caso.titulo == "Fuga de agua en la calle"[:60]
    assert caso.channel == "PUBLICO"
    assert caso.moderacion == "PENDIENTE"
    assert caso.origin_response_id == resp.id
    assert caso.contacto_masked == "****-8888"
    # bidirectional link
    db_session.refresh(resp)
    assert resp.caso_id == caso.id


def test_crear_desde_respuesta_exact_mapping_no_substring_bleed(coordinador_ctx, db_session):
    """A `detalle` field maps to descripcion and, with NO phone field present,
    must NOT bleed into contacto (regression: substring match let `tel` swallow
    `detalle`, corrupting PII + the mask)."""
    form = FormDefinition(
        organization_id=coordinador_ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
        nombre="Reporte", tipo="PETICION", slug="reporte-detalle", canal="PUBLICO",
        schema={"fields": []})
    db_session.add(form)
    db_session.flush()
    resp = FormResponse(
        organization_id=coordinador_ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
        form_definition_id=form.id,
        answers={"nombre": "Lola", "seccion": "4127", "detalle": "Poste caído en la esquina"},
        channel="INTERNO", moderacion="VERIFICADO")
    db_session.add(resp)
    db_session.flush()

    caso = caso_service.crear_desde_respuesta(db_session, coordinador_ctx, resp, form)
    assert caso.descripcion == "Poste caído en la esquina"
    assert caso.contacto_enc is None
    assert caso.contacto_masked is None


# ── Auto-routing specificity ──────────────────────────────────────────────────
def test_resolve_responsable_prefers_most_specific_territory(activista_ctx, db_session):
    """Among users whose territory covers the sección, the SMALLEST territory
    wins (an activista pinned to one sección over a coordinator covering a
    municipio), independent of row order."""
    org = activista_ctx.organization_id
    muni = ElectoralArea(name="Muni AC", code="MAC", level=AreaLevel.MUNICIPIO,
                         organization_id=org)
    db_session.add(muni)
    db_session.flush()
    s_narrow = ElectoralArea(name="S7777", code="7777", level=AreaLevel.SECCION,
                             organization_id=org, municipio_id=muni.id)
    s_other = ElectoralArea(name="S7778", code="7778", level=AreaLevel.SECCION,
                            organization_id=org, municipio_id=muni.id)
    db_session.add_all([s_narrow, s_other])
    db_session.flush()

    broad = User(email="broad-ac@alpha.gov", full_name="Broad AC",
                 hashed_password=hash_password("x"), role=UserRole.COORDINADOR,
                 organization_id=org, area_id=muni.id)
    narrow = User(email="narrow-ac@alpha.gov", full_name="Narrow AC",
                  hashed_password=hash_password("x"), role=UserRole.ACTIVISTA,
                  organization_id=org, area_id=s_narrow.id)
    db_session.add_all([broad, narrow])
    db_session.commit()
    try:
        assert caso_service._resolve_responsable(db_session, activista_ctx, "7777") == narrow.id
    finally:
        db_session.query(User).filter(User.id.in_([broad.id, narrow.id])).delete(
            synchronize_session=False)
        db_session.query(ElectoralArea).filter(
            ElectoralArea.id.in_([muni.id, s_narrow.id, s_other.id])).delete(
            synchronize_session=False)
        db_session.commit()


# ── Scoping ───────────────────────────────────────────────────────────────────
def test_coordinador_sees_hierarchy_team_caso(coordinador_ctx, activista_ctx, db_session):
    """A caso auto-routed to a SUBORDINATE activista (not created_by/assigned to
    the coordinator) but inside the coordinator's territory is visible to the
    coordinator on list + get (oversight of the team's in-territory work)."""
    caso = Caso(
        organization_id=coordinador_ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
        folio="AC-2026-09001", tipo="PETICION", titulo="Equipo",
        seccion="4127", estado="PENDIENTE",
        asignado_a=activista_ctx.user.id, created_by=activista_ctx.user.id)
    db_session.add(caso)
    db_session.commit()
    db_session.refresh(caso)

    rows, total, _ = caso_service.list_casos(db_session, coordinador_ctx)
    assert any(r.id == caso.id for r in rows)
    assert caso_service.get_caso(db_session, coordinador_ctx, caso.id) is not None



def test_list_scoped_activista_cannot_see_others(coordinador_ctx, activista_ctx, db_session):
    caso_service.crear_directo(db_session, coordinador_ctx, _base_data())
    # coordinator (territory 4127 + owner) sees it
    rows, total, has_t = caso_service.list_casos(db_session, coordinador_ctx)
    assert total == 1 and has_t is True
    assert rows[0].asignado_nombre is not None
    # activista (own-only, not owner/assignee) sees nothing
    _, total_act, _ = caso_service.list_casos(db_session, activista_ctx)
    assert total_act == 0


def test_get_caso_respects_gate(coordinador_ctx, activista_ctx, db_session):
    caso = caso_service.crear_directo(db_session, coordinador_ctx, _base_data())
    assert caso_service.get_caso(db_session, coordinador_ctx, caso.id) is not None
    assert caso_service.get_caso(db_session, activista_ctx, caso.id) is None


# ── Lifecycle + bitácora ──────────────────────────────────────────────────────
def test_set_estado_writes_event(coordinador_ctx, db_session):
    caso = caso_service.crear_directo(db_session, coordinador_ctx, _base_data())
    updated = caso_service.set_estado(db_session, coordinador_ctx, caso.id, "EN_PROCESO", texto="voy")
    assert updated.estado == "EN_PROCESO"
    events = db_session.query(CasoEvento).filter(
        CasoEvento.caso_id == caso.id, CasoEvento.tipo == "CAMBIO_ESTADO").all()
    assert any(e.estado_nuevo == "EN_PROCESO" for e in events)


def test_asignar_writes_reasignacion(coordinador_ctx, activista_ctx, db_session):
    caso = caso_service.crear_directo(db_session, coordinador_ctx, _base_data())
    updated = caso_service.asignar(db_session, coordinador_ctx, caso.id, activista_ctx.user.id)
    assert updated.asignado_a == activista_ctx.user.id
    assert db_session.query(CasoEvento).filter(
        CasoEvento.caso_id == caso.id, CasoEvento.tipo == "REASIGNACION").count() == 1


def test_add_evento_evidencia_stores_object(coordinador_ctx, db_session, monkeypatch):
    puts = {}

    def _fake_put(key, data, content_type):
        puts[key] = (data, content_type)

    monkeypatch.setattr("app.core.storage.put_object", _fake_put)
    caso = caso_service.crear_directo(db_session, coordinador_ctx, _base_data())

    nota = caso_service.add_evento(db_session, coordinador_ctx, caso.id, "NOTA", texto="seguimiento")
    assert nota.tipo == "NOTA" and nota.evidencia_key is None

    ev = caso_service.add_evento(db_session, coordinador_ctx, caso.id, "EVIDENCIA",
                                 evidencia=b"\xff\xd8jpegbytes", content_type="image/jpeg")
    assert ev.evidencia_key == f"casos/{caso.campaign_id}/{caso.id}/ev-1.jpg"
    assert ev.evidencia_key in puts


# ── Panorama ──────────────────────────────────────────────────────────────────
def test_panorama_kpis_and_breakdowns(coordinador_ctx, db_session):
    caso_service.crear_directo(db_session, coordinador_ctx, _base_data(colonia="Centro"))
    c2 = caso_service.crear_directo(db_session, coordinador_ctx, _base_data(colonia="Norte"))
    caso_service.set_estado(db_session, coordinador_ctx, c2.id, "ATENDIDO")

    pan = caso_service.panorama(db_session, coordinador_ctx)
    assert pan["kpis"]["total"] == 2
    assert pan["kpis"]["por_estado"].get("ATENDIDO") == 1
    assert pan["kpis"]["por_estado"].get("PENDIENTE") == 1
    assert "sla_vencidos" in pan["kpis"]
    colonias = {row["colonia"] for row in pan["por_colonia"]}
    assert {"Centro", "Norte"} <= colonias
    assert any(r["asignado_a"] == coordinador_ctx.user.id for r in pan["por_responsable"])
