"""API tests for /api/responses + /api/casos (a form response opens a caso).

coord@alpha.gov needs an assigned territory covering sección 4127 for the
territory gate in caso_service (_territory_gated) to admit the resulting
caso — same idiom as test_promovidos_api.py's `_setup_territory_and_promovido`
(explicit ElectoralArea + User.area_id wiring via TestingSessionLocal), so
this file passes standalone (`pytest tests/test_casos_api.py`) and not only
as a side effect of test_casos.py's `coordinador_ctx` fixture running first.
"""
from sqlalchemy import select

from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.user import User
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers


def _hdr(client, email, cid=ALPHA_CAMPAIGN_ID):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = cid
    return h


def _ensure_coord_territory_4127():
    db = TestingSessionLocal()
    try:
        area = db.execute(select(ElectoralArea).where(
            ElectoralArea.code == "4127", ElectoralArea.level == AreaLevel.SECCION
        )).scalar_one_or_none()
        if area is None:
            area = ElectoralArea(name="Sección 4127", code="4127",
                                  level=AreaLevel.SECCION, organization_id=None)
            db.add(area)
            db.flush()
        coord = db.execute(select(User).where(User.email == "coord@alpha.gov")).scalar_one()
        if coord.area_id != area.id:
            coord.area_id = area.id
        db.commit()
    finally:
        db.close()


def _form_payload(slug):
    return {
        "nombre": "Pet", "tipo": "PETICION", "slug": slug, "canal": "INTERNO",
        "schema": {"secciones": [{"titulo": "D", "campos": [
            {"key": "nombre", "tipo": "text", "label": "N", "requerido": True},
            {"key": "descripcion", "tipo": "textarea", "label": "Desc"},
            {"key": "seccion", "tipo": "seccion", "label": "Secc"}]}]},
    }


def test_response_opens_caso(client):
    _ensure_coord_territory_4127()
    h = _hdr(client, "coord@alpha.gov")
    f = client.post("/api/forms", headers=h, json=_form_payload("pet-response-test")).json()
    r = client.post("/api/responses", headers=h, json={
        "form_definition_id": f["id"],
        "answers": {"nombre": "Ana", "descripcion": "bache", "seccion": "4127"}})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["caso_id"]
    # response envelope never echoes PII/answers back
    assert "answers" not in body
    assert "clave_elector" not in body

    casos = client.get("/api/casos", headers=h)
    assert casos.status_code == 200 and casos.json()["total"] >= 1
    caso = next(c for c in casos.json()["items"] if c["id"] == body["caso_id"])
    assert caso["descripcion"] == "bache"
    assert caso["seccion"] == "4127"
    assert caso["ciudadano_nombre"] == "Ana"


def test_response_requires_valid_form(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/responses", headers=h, json={
        "form_definition_id": "does-not-exist", "answers": {}})
    assert r.status_code == 404, r.text


def test_response_rejects_missing_required_answer(client):
    _ensure_coord_territory_4127()
    h = _hdr(client, "coord@alpha.gov")
    f = client.post("/api/forms", headers=h, json=_form_payload("pet-invalid-test")).json()
    r = client.post("/api/responses", headers=h, json={
        "form_definition_id": f["id"], "answers": {"descripcion": "bache"}})
    assert r.status_code == 422, r.text


def test_activista_can_capture_but_not_review(client):
    _ensure_coord_territory_4127()
    hc = _hdr(client, "coord@alpha.gov")
    f = client.post("/api/forms", headers=hc, json=_form_payload("pet-activista-test")).json()

    ha = _hdr(client, "activista1@alpha.gov")
    r = client.post("/api/responses", headers=ha, json={
        "form_definition_id": f["id"],
        "answers": {"nombre": "Beto", "descripcion": "fuga de agua", "seccion": "0001"}})
    assert r.status_code == 201, r.text
    cid = r.json()["caso_id"]

    # activista may list/read (capture tier) but not change estado / panorama (review tier)
    listado = client.get("/api/casos", headers=ha)
    assert listado.status_code == 200

    forbidden = client.patch(f"/api/casos/{cid}/estado", headers=ha, json={"estado": "EN_PROCESO"})
    assert forbidden.status_code == 403

    forbidden_pan = client.get("/api/casos/panorama", headers=ha)
    assert forbidden_pan.status_code == 403


def test_panorama_route_not_captured_by_cid_route(client):
    """`/casos/panorama` must resolve to the panorama endpoint, not get_one(cid)."""
    hc = _hdr(client, "coord@alpha.gov")
    r = client.get("/api/casos/panorama", headers=hc)
    assert r.status_code == 200
    assert "kpis" in r.json()


def test_coordinador_can_set_estado_and_asignar(client):
    _ensure_coord_territory_4127()
    h = _hdr(client, "coord@alpha.gov")
    f = client.post("/api/forms", headers=h, json=_form_payload("pet-estado-test")).json()
    r = client.post("/api/responses", headers=h, json={
        "form_definition_id": f["id"],
        "answers": {"nombre": "Cita", "descripcion": "poda de arbol", "seccion": "4127"}})
    cid = r.json()["caso_id"]

    ok = client.patch(f"/api/casos/{cid}/estado", headers=h, json={"estado": "EN_PROCESO"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["estado"] == "EN_PROCESO"

    coord = TestingSessionLocal()
    try:
        coord_user = coord.execute(select(User).where(User.email == "coord@alpha.gov")).scalar_one()
        coord_id = coord_user.id
    finally:
        coord.close()

    asignado = client.patch(f"/api/casos/{cid}/asignar", headers=h,
                             json={"asignado_a": coord_id})
    assert asignado.status_code == 200, asignado.text
    assert asignado.json()["asignado_a"] == coord_id

    evento = client.post(f"/api/casos/{cid}/eventos", headers=h,
                          json={"tipo": "NOTA", "texto": "seguimiento"})
    assert evento.status_code == 201, evento.text


def _open_caso(client, h, slug):
    f = client.post("/api/forms", headers=h, json=_form_payload(slug)).json()
    r = client.post("/api/responses", headers=h, json={
        "form_definition_id": f["id"],
        "answers": {"nombre": "Deo", "descripcion": "bache", "seccion": "4127"}})
    assert r.status_code == 201, r.text
    return r.json()["caso_id"]


def test_evidencia_upload_and_evento_flow(client, monkeypatch):
    import app.core.storage as storage

    puts: dict = {}
    monkeypatch.setattr(storage, "put_object", lambda key, data, ct: puts.__setitem__(key, data))
    monkeypatch.setattr(storage, "presigned_get", lambda key, ttl=60: f"https://signed/{key}")

    _ensure_coord_territory_4127()
    h = _hdr(client, "coord@alpha.gov")
    cid = _open_caso(client, h, "pet-evidencia-test")

    up = client.post(f"/api/casos/{cid}/evidencia", headers=h,
                      files={"file": ("foto.jpg", b"\xff\xd8fakejpegbytes", "image/jpeg")})
    assert up.status_code == 200, up.text
    key = up.json()["evidencia_key"]
    assert key.startswith(f"casos/{ALPHA_CAMPAIGN_ID}/{cid}/ev-")
    assert key in puts

    evento = client.post(f"/api/casos/{cid}/eventos", headers=h,
                          json={"tipo": "EVIDENCIA", "evidencia_key": key})
    assert evento.status_code == 201, evento.text
    body = evento.json()
    assert body["evidencia_url"] == f"https://signed/{key}"


def test_evidencia_upload_rejects_oversized_file(client):
    _ensure_coord_territory_4127()
    h = _hdr(client, "coord@alpha.gov")
    cid = _open_caso(client, h, "pet-evidencia-big-test")

    big = b"x" * (6 * 1024 * 1024 + 1)
    up = client.post(f"/api/casos/{cid}/evidencia", headers=h,
                      files={"file": ("foto.jpg", big, "image/jpeg")})
    assert up.status_code == 413, up.text


def test_evidencia_upload_requires_existing_caso(client, monkeypatch):
    import app.core.storage as storage
    monkeypatch.setattr(storage, "put_object", lambda *a, **k: None)
    h = _hdr(client, "coord@alpha.gov")
    up = client.post("/api/casos/does-not-exist/evidencia", headers=h,
                      files={"file": ("foto.jpg", b"jpg", "image/jpeg")})
    assert up.status_code == 404


def test_list_eventos_returns_bitacora(client):
    _ensure_coord_territory_4127()
    h = _hdr(client, "coord@alpha.gov")
    cid = _open_caso(client, h, "pet-list-eventos-test")

    created = client.post(f"/api/casos/{cid}/eventos", headers=h,
                           json={"tipo": "NOTA", "texto": "seguimiento inicial"})
    assert created.status_code == 201, created.text

    listado = client.get(f"/api/casos/{cid}/eventos", headers=h)
    assert listado.status_code == 200, listado.text
    body = listado.json()
    assert isinstance(body, list)
    # the opening CAMBIO_ESTADO → PENDIENTE event plus the NOTA just added
    assert len(body) >= 2
    nota = next(e for e in body if e["tipo"] == "NOTA")
    assert nota["texto"] == "seguimiento inicial"
    assert nota["caso_id"] == cid
    # chronological (oldest first): the opening event precedes the NOTA
    assert body[0]["tipo"] == "CAMBIO_ESTADO"


def test_list_eventos_requires_existing_caso(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.get("/api/casos/does-not-exist/eventos", headers=h)
    assert r.status_code == 404


def test_evento_rejects_foreign_evidencia_key(client):
    _ensure_coord_territory_4127()
    h = _hdr(client, "coord@alpha.gov")
    cid = _open_caso(client, h, "pet-evidencia-foreign-test")

    evento = client.post(f"/api/casos/{cid}/eventos", headers=h, json={
        "tipo": "EVIDENCIA", "evidencia_key": "casos/other-campaign/other-caso/ev-x.jpg"})
    assert evento.status_code == 422
