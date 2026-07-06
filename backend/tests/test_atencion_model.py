from app.models.atencion import FormDefinition, FormResponse, Caso, CasoEvento
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal
from app.models.organization import Organization
from sqlalchemy import select


def test_atencion_models_persist():
    db = TestingSessionLocal()
    org_id = db.execute(select(Organization.id).where(Organization.slug == "alpha")).scalar_one()
    fd = FormDefinition(organization_id=org_id, campaign_id=ALPHA_CAMPAIGN_ID,
                        nombre="Petición vecinal", tipo="PETICION", slug="peticion-vecinal",
                        canal="AMBOS", is_active=True, version=1,
                        schema={"secciones": []})
    db.add(fd); db.commit(); db.refresh(fd)
    caso = Caso(organization_id=org_id, campaign_id=ALPHA_CAMPAIGN_ID, folio="AC-2026-00001",
                tipo="PETICION", titulo="Bache", descripcion="Bache en la esquina",
                estado="PENDIENTE", prioridad="MEDIA", channel="INTERNO")
    db.add(caso); db.commit(); db.refresh(caso)
    ev = CasoEvento(organization_id=org_id, caso_id=caso.id, tipo="NOTA", texto="Recibido", actor_id=None)
    db.add(ev); db.commit()
    assert fd.id and caso.estado == "PENDIENTE" and ev.id
    db.close()
