"""COORDINADOR = campaign-wide scope (sees all campaign registros/militantes/
casos, not just their hierarchy) — the 'Víctor Garduño' fix — with tenant/
campaign isolation intact."""
from sqlalchemy import delete, select

from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers
from app.models.atencion import Caso
from app.models.militante import Militante
from app.models.organization import Organization
from app.models.registro import Registro
from app.models.user import User

_OTHER_CAMPAIGN = "22222222-2222-2222-2222-222222222222"


def _hdr(client, email):
    return {**auth_headers(client, email), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}


def _ids():
    db = TestingSessionLocal()
    try:
        org = db.execute(select(Organization).where(Organization.slug == "alpha")).scalar_one()
        # a user NOT under the coordinador's hierarchy (admin) → activista_id outside the tree
        admin = db.execute(select(User).where(User.email == "admin@alpha.gov")).scalar_one()
        return org.id, admin.id
    finally:
        db.close()


def _cleanup():
    db = TestingSessionLocal()
    try:
        db.execute(delete(Registro).where(Registro.seccion.in_(["7777", "7778"])))
        db.execute(delete(Militante).where(Militante.seccion == "7777"))
        db.execute(delete(Caso).where(Caso.folio.in_(["SCOPE-1"])))
        db.commit()
    finally:
        db.close()


def test_coordinador_sees_records_outside_own_hierarchy(client):
    org_id, outsider = _ids()
    db = TestingSessionLocal()
    try:
        # captured by a user outside the coordinador's sub-tree, same campaign
        db.add(Registro(organization_id=org_id, campaign_id=ALPHA_CAMPAIGN_ID,
                        nombre_completo="Victor Garduno Outside", seccion="7777",
                        consentimiento=True, activista_id=outsider))
        db.add(Militante(organization_id=org_id, campaign_id=ALPHA_CAMPAIGN_ID,
                         folio="SCOPE-MIL-1", nombre_completo="Afiliado Outside",
                         seccion="7777", activista_id=outsider, consentimiento=True))
        db.add(Caso(organization_id=org_id, campaign_id=ALPHA_CAMPAIGN_ID,
                    folio="SCOPE-1", titulo="Caso Outside", asignado_a=outsider))
        db.commit()
    finally:
        db.close()
    try:
        r = client.get("/api/promovidos?q=Victor%20Garduno&limit=5", headers=_hdr(client, "coord@alpha.gov"))
        assert r.status_code == 200, r.text
        assert any("Victor Garduno Outside" == i["nombre_completo"] for i in r.json()["items"]), \
            "coordinador should see a promovido captured outside their hierarchy"
    finally:
        _cleanup()
        db = TestingSessionLocal()
        db.execute(delete(Militante).where(Militante.folio == "SCOPE-MIL-1")); db.commit(); db.close()


def test_coordinador_does_not_see_other_campaign(client):
    org_id, outsider = _ids()
    db = TestingSessionLocal()
    try:
        db.add(Registro(organization_id=org_id, campaign_id=_OTHER_CAMPAIGN,
                        nombre_completo="Otra Campana Persona", seccion="7778",
                        consentimiento=True, activista_id=None))
        db.commit()
    finally:
        db.close()
    try:
        r = client.get("/api/promovidos?q=Otra%20Campana&limit=5", headers=_hdr(client, "coord@alpha.gov"))
        assert r.status_code == 200, r.text
        # coord queries with ALPHA campaign header → must NOT see the other-campaign row
        assert all("Otra Campana Persona" != i["nombre_completo"] for i in r.json()["items"]), \
            "campaign isolation must still hold"
    finally:
        _cleanup()
