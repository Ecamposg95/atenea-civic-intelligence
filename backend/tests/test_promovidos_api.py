"""GET /promovidos — scope territorial + enriquecimiento electoral."""
from sqlalchemy import delete, select
from tests.conftest import auth_headers, ALPHA_CAMPAIGN_ID, TestingSessionLocal
from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.seccion_electoral import SeccionElectoral
from app.models.registro import Registro
from app.models.user import User


def _h(client, email):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID
    return h


def _setup_territory_and_promovido():
    db = TestingSessionLocal()
    try:
        muni = ElectoralArea(name="San Mateo Atenco", code="15076",
                             level=AreaLevel.MUNICIPIO, organization_id=None)
        db.add(muni); db.flush()
        db.add(ElectoralArea(name="Sección 4121", code="4121", level=AreaLevel.SECCION,
                             organization_id=None, municipio_id=muni.id, parent_id=muni.id))
        db.add(SeccionElectoral(seccion="4121", municipio="San Mateo Atenco", anio=2024,
                                participacion=66.9, margen=-115, prioridad="COMPETITIVA"))
        coord = db.execute(select(User).where(User.email == "coord@alpha.gov")).scalar_one()
        coord.area_id = muni.id
        db.add(Registro(organization_id=coord.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                        activista_id=None, nombre_completo="Promovido Uno", seccion="4121",
                        promotor="ALAN", consentimiento=True, client_uuid="prom-1"))
        # a promovido OUTSIDE her territory (should be filtered out)
        db.add(Registro(organization_id=coord.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                        activista_id=None, nombre_completo="Fuera", seccion="9999",
                        promotor="ALAN", consentimiento=True, client_uuid="prom-2"))
        db.commit()
    finally:
        db.close()


def test_promovidos_scoped_and_enriched(client):
    _setup_territory_and_promovido()
    r = client.get("/api/promovidos", headers=_h(client, "coord@alpha.gov"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_territory"] is True
    names = [i["nombre_completo"] for i in body["items"]]
    # COORDINADOR is campaign-wide (no territory gate) → sees both the in-territory
    # promovido AND the one in another sección.
    assert "Promovido Uno" in names and "Fuera" in names
    row = next(i for i in body["items"] if i["nombre_completo"] == "Promovido Uno")
    assert row["prioridad"] == "COMPETITIVA" and row["margen"] == -115
    assert "clave_elector" not in row  # Golden Rule #9


def test_promovidos_empty_without_territory(client):
    db = TestingSessionLocal()
    try:
        lider = db.execute(select(User).where(User.email == "lider@alpha.gov")).scalar_one()
        lider.area_id = None
        db.commit()
    finally:
        db.close()
    r = client.get("/api/promovidos", headers=_h(client, "lider@alpha.gov"))
    assert r.status_code == 200
    assert r.json()["has_territory"] is False
    assert r.json()["items"] == []


def test_promovidos_admin_bypasses_territory(client):
    # Relies on promovido rows already seeded by test_promovidos_scoped_and_enriched
    # (module-scoped SQLite DB — see conftest.py); do not re-invoke the setup
    # helper here, it would violate the seccion_electoral/client_uuid unique
    # constraints on a second insert.
    db = TestingSessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == "admin@alpha.gov")).scalar_one()
        assert admin.area_id is None
    finally:
        db.close()
    r = client.get("/api/promovidos", headers=_h(client, "admin@alpha.gov"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_territory"] is True
    names = [i["nombre_completo"] for i in body["items"]]
    assert "Promovido Uno" in names and "Fuera" in names  # admin: no territory filter


_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _make_template_xlsx(tmp_path, rows):
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Promotor Prueba"
    ws.append(["#", "PRIMER APELLIDO", "SEGUNDO APELLIDO", "NOMBRE",
               "DIA", "MES", "AÑO", "CALLE", "NUM", "COLONIA", "SECCION", "TELEFONO"])
    ws.append([None] * 12)  # data starts at header + 2
    for r in rows:
        ws.append(r)
    p = tmp_path / "ImportPrueba.xlsx"
    wb.save(p)
    return p


def test_promovidos_import_preview_and_idempotent_commit(client, tmp_path):
    p = _make_template_xlsx(tmp_path, [
        [1, "Garduno", "Garrido", "Victor", 15, 6, 1990, "Matamoros", "514", "Concepcion", "6129", "7221459523"],
        [2, "Lopez", "Perez", "Ana", 1, 1, 1985, "Juarez", "10", "Centro", "6130", "7220000000"],
    ])
    h = _h(client, "coord@alpha.gov")
    try:
        # preview: nothing written
        with open(p, "rb") as f:
            pre = client.post("/api/promovidos/import",
                              files={"file": ("ImportPrueba.xlsx", f, _XLSX_MIME)},
                              data={"commit": "false"}, headers=h)
        assert pre.status_code == 200, pre.text
        assert pre.json()["commit"] is False and pre.json()["leidas"] == 2
        assert len(pre.json()["muestra"]) == 2

        # commit: 2 imported
        with open(p, "rb") as f:
            c1 = client.post("/api/promovidos/import",
                             files={"file": ("ImportPrueba.xlsx", f, _XLSX_MIME)},
                             data={"commit": "true"}, headers=h)
        assert c1.status_code == 200 and c1.json()["importadas"] == 2

        # re-commit same file: idempotent → duplicates, 0 new
        with open(p, "rb") as f:
            c2 = client.post("/api/promovidos/import",
                             files={"file": ("ImportPrueba.xlsx", f, _XLSX_MIME)},
                             data={"commit": "true"}, headers=h)
        assert c2.json()["importadas"] == 0 and c2.json()["duplicadas"] == 2
    finally:
        db = TestingSessionLocal()
        db.execute(delete(Registro).where(Registro.seccion.in_(["6129", "6130"])))
        db.commit(); db.close()


def test_promovidos_import_rejects_non_excel(client):
    import io
    h = _h(client, "coord@alpha.gov")
    r = client.post("/api/promovidos/import",
                    files={"file": ("notas.txt", io.BytesIO(b"hola"), "text/plain")},
                    data={"commit": "false"}, headers=h)
    assert r.status_code == 422


def test_promovidos_import_forbidden_for_activista(client):
    import io
    h = _h(client, "activista1@alpha.gov")
    r = client.post("/api/promovidos/import",
                    files={"file": ("x.xlsx", io.BytesIO(b"x"), _XLSX_MIME)},
                    data={"commit": "false"}, headers=h)
    assert r.status_code == 403
