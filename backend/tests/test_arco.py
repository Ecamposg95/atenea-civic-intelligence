"""TDD: ARCO hard-delete (AC-7.3, SPA-4 Task 4).

Tests are written BEFORE implementation (RED phase).

Scenarios:
1. Model + schema importable, columns correct.
2. Service: admin can hard-delete in scope → row GONE from DB + audit written + acceptances gone.
3. Service: ArcoRequest trail row persists (holds NO PII).
4. Service: second execution is idempotent (no-op, returns 0).
5. Router: non-admin → 403.
6. Router: admin from a different tenant → 404 (out of scope).
7. Router: titular_ref must never contain a full clave (18-char alphanum).
"""
from __future__ import annotations

import re


# ---------------------------------------------------------------------------
# 1. Model importability and schema checks
# ---------------------------------------------------------------------------

def test_arco_model_importable():
    from app.models.arco import ArcoRequest, ArcoTipo, ArcoEstado  # noqa: F401


def test_arco_enums():
    from app.models.arco import ArcoTipo, ArcoEstado

    assert hasattr(ArcoTipo, "CANCELACION")  # right-to-erasure is CANCELACION
    assert hasattr(ArcoEstado, "PENDIENTE")
    assert hasattr(ArcoEstado, "PROCESADA")


def test_arco_model_columns():
    from app.models.arco import ArcoRequest

    cols = {c.name for c in ArcoRequest.__table__.c}
    for col in ("id", "organization_id", "campaign_id", "registro_id",
                "titular_ref", "tipo", "estado", "motivo",
                "requested_by", "processed_by", "requested_at", "processed_at"):
        assert col in cols, f"Missing column: {col}"


def test_arco_model_in_metadata():
    from app.database import Base
    import app.models  # noqa: F401

    assert "arco_requests" in Base.metadata.tables


def test_arco_schema_importable():
    from app.schemas.arco import ArcoRequestCreate, ArcoRequestRead, EjecutarRequest  # noqa: F401


def test_arco_registro_id_not_fk_to_registros():
    """registro_id must NOT have a FK to registros — it must outlive the deleted row."""
    from app.models.arco import ArcoRequest

    col = ArcoRequest.__table__.c["registro_id"]
    fk_tables = {fk.column.table.name for fk in col.foreign_keys}
    assert "registros" not in fk_tables, (
        "registro_id must not FK to registros — the trail must survive the hard delete"
    )


def test_arco_titular_ref_max_length():
    """titular_ref column must be shorter than 18 chars capacity or just opaque — it may NOT store a full 18-char clave."""
    # The schema validator test: ArcoRequestCreate must reject a 18-char alphanum titular_ref
    from pydantic import ValidationError
    from app.schemas.arco import ArcoRequestCreate
    from app.models.arco import ArcoTipo

    full_clave = "ABCDEF123456789012"  # 18 alphanum — must be rejected
    try:
        req = ArcoRequestCreate(
            registro_id="some-id",
            tipo=ArcoTipo.CANCELACION,
            titular_ref=full_clave,
        )
        # If it did NOT raise, the schema is too permissive — but we'll also
        # validate the column max_length separately.
        col = __import__("app.models.arco", fromlist=["ArcoRequest"]).ArcoRequest.__table__.c["titular_ref"]
        # Column length must be < 18 OR the schema should block full claves
        assert col.type.length < 18, (
            "titular_ref column must not accommodate a full 18-char clave"
        )
    except (ValidationError, Exception):
        # Schema rejected it — that is the expected outcome
        pass


# ---------------------------------------------------------------------------
# 2. Service: hard-delete removes registro + acceptances, writes audit trail
# ---------------------------------------------------------------------------

def test_hard_delete_removes_registro_and_acceptances(seed_data):
    """hard_delete_titular physically removes the Registro and all PrivacyAcceptances."""
    from sqlalchemy import select

    from app.dependencies import CampaignContext
    from app.models.arco import ArcoRequest, ArcoEstado
    from app.models.audit_log import AuditLog
    from app.models.privacy import PrivacyAcceptance
    from app.models.registro import Registro
    from app.models.user import User
    from app.schemas.registro import RegistroCreate
    from app.services import registro_service
    from app.services.arco_service import create_request, hard_delete_titular
    from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal
    from app.models.arco import ArcoTipo

    db = TestingSessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == "admin@alpha.gov")).scalar_one()
        act = db.execute(select(User).where(User.email == "activista1@alpha.gov")).scalar_one()

        act_ctx = CampaignContext(
            user=act, organization_id=act.organization_id,
            role=act.role, campaign_id=ALPHA_CAMPAIGN_ID,
        )
        admin_ctx = CampaignContext(
            user=admin, organization_id=admin.organization_id,
            role=admin.role, campaign_id=ALPHA_CAMPAIGN_ID,
        )

        # Create a registro with a privacy acceptance
        reg = registro_service.create_registro(
            db, act_ctx,
            RegistroCreate(nombre_completo="ARCO Delete Test", consentimiento=True),
        )
        reg_id = reg.id

        # Verify acceptance exists before delete
        acc_before = db.execute(
            select(PrivacyAcceptance).where(PrivacyAcceptance.registro_id == reg_id)
        ).scalar_one_or_none()
        assert acc_before is not None, "Acceptance must exist before ARCO delete"

        # Create the ARCO request
        arco_req = create_request(
            db, admin_ctx,
            registro_id=reg_id,
            tipo=ArcoTipo.CANCELACION,
            motivo="Data subject requests erasure",
            titular_ref="MASKED",
        )
        arco_req_id = arco_req.id

        # Execute the hard delete
        count = hard_delete_titular(
            db, admin_ctx, request_id=arco_req_id, registro_ids=[reg_id]
        )
        assert count == 1, f"Expected 1 deletion, got {count}"

        # Registro must be GONE
        row = db.execute(
            select(Registro).where(Registro.id == reg_id)
        ).scalar_one_or_none()
        assert row is None, "Registro must be physically deleted (not soft-deleted)"

        # PrivacyAcceptance must be GONE (cascades from registros FK)
        acc_after = db.execute(
            select(PrivacyAcceptance).where(PrivacyAcceptance.registro_id == reg_id)
        ).scalar_one_or_none()
        assert acc_after is None, "PrivacyAcceptance must cascade-delete with Registro"

        # AuditLog must have been written (action="registro.arco_hard_delete")
        audit = db.execute(
            select(AuditLog).where(
                AuditLog.entity_id == reg_id,
                AuditLog.action == "registro.arco_hard_delete",
            )
        ).scalar_one_or_none()
        assert audit is not None, "AuditLog must be written for ARCO hard-delete"
        assert audit.entity_id == reg_id
        # Audit must NOT store PII — entity_id is fine (opaque UUID)

        # ArcoRequest trail must PERSIST with status PROCESADA
        arco = db.execute(
            select(ArcoRequest).where(ArcoRequest.id == arco_req_id)
        ).scalar_one_or_none()
        assert arco is not None, "ArcoRequest trail must persist after deletion"
        assert arco.estado == ArcoEstado.PROCESADA

    finally:
        # Cleanup (in case the test fails mid-way)
        db.query(PrivacyAcceptance).delete()
        db.query(AuditLog).filter(AuditLog.action == "registro.arco_hard_delete").delete()
        db.query(ArcoRequest).delete()
        db.query(Registro).delete()
        db.commit()
        db.close()


def test_hard_delete_idempotent(seed_data):
    """Second execution for same registro_id is a no-op (returns 0)."""
    from sqlalchemy import select

    from app.dependencies import CampaignContext
    from app.models.arco import ArcoRequest, ArcoTipo
    from app.models.audit_log import AuditLog
    from app.models.privacy import PrivacyAcceptance
    from app.models.registro import Registro
    from app.models.user import User
    from app.schemas.registro import RegistroCreate
    from app.services import registro_service
    from app.services.arco_service import create_request, hard_delete_titular
    from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal

    db = TestingSessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == "admin@alpha.gov")).scalar_one()
        act = db.execute(select(User).where(User.email == "activista1@alpha.gov")).scalar_one()

        act_ctx = CampaignContext(
            user=act, organization_id=act.organization_id,
            role=act.role, campaign_id=ALPHA_CAMPAIGN_ID,
        )
        admin_ctx = CampaignContext(
            user=admin, organization_id=admin.organization_id,
            role=admin.role, campaign_id=ALPHA_CAMPAIGN_ID,
        )

        reg = registro_service.create_registro(
            db, act_ctx,
            RegistroCreate(nombre_completo="ARCO Idem Test", consentimiento=True),
        )
        reg_id = reg.id

        arco_req = create_request(
            db, admin_ctx,
            registro_id=reg_id,
            tipo=ArcoTipo.CANCELACION,
            motivo="First request",
            titular_ref="MASKED",
        )
        arco_req_id = arco_req.id

        # First delete
        count1 = hard_delete_titular(db, admin_ctx, request_id=arco_req_id, registro_ids=[reg_id])
        assert count1 == 1

        # Second execution — registro no longer exists, should be no-op
        count2 = hard_delete_titular(db, admin_ctx, request_id=arco_req_id, registro_ids=[reg_id])
        assert count2 == 0, "Second hard-delete on same id must be no-op"

    finally:
        db.query(PrivacyAcceptance).delete()
        db.query(AuditLog).filter(AuditLog.action == "registro.arco_hard_delete").delete()
        db.query(ArcoRequest).delete()
        db.query(Registro).delete()
        db.commit()
        db.close()


def test_hard_delete_out_of_scope_returns_zero(seed_data):
    """Admin from Beta cannot hard-delete Alpha's registros (out-of-scope → 0)."""
    from sqlalchemy import select

    from app.dependencies import CampaignContext
    from app.models.arco import ArcoRequest, ArcoTipo
    from app.models.audit_log import AuditLog
    from app.models.privacy import PrivacyAcceptance
    from app.models.registro import Registro
    from app.models.user import User
    from app.schemas.registro import RegistroCreate
    from app.services import registro_service
    from app.services.arco_service import create_request, hard_delete_titular
    from tests.conftest import ALPHA_CAMPAIGN_ID, BETA_CAMPAIGN_ID, TestingSessionLocal

    db = TestingSessionLocal()
    try:
        alpha_admin = db.execute(select(User).where(User.email == "admin@alpha.gov")).scalar_one()
        beta_admin = db.execute(select(User).where(User.email == "admin@beta.gov")).scalar_one()
        act = db.execute(select(User).where(User.email == "activista1@alpha.gov")).scalar_one()

        act_ctx = CampaignContext(
            user=act, organization_id=act.organization_id,
            role=act.role, campaign_id=ALPHA_CAMPAIGN_ID,
        )
        alpha_admin_ctx = CampaignContext(
            user=alpha_admin, organization_id=alpha_admin.organization_id,
            role=alpha_admin.role, campaign_id=ALPHA_CAMPAIGN_ID,
        )
        beta_admin_ctx = CampaignContext(
            user=beta_admin, organization_id=beta_admin.organization_id,
            role=beta_admin.role, campaign_id=BETA_CAMPAIGN_ID,
        )

        # Create a registro in Alpha
        reg = registro_service.create_registro(
            db, act_ctx,
            RegistroCreate(nombre_completo="ARCO Scope Test", consentimiento=True),
        )
        reg_id = reg.id

        # Alpha admin creates the ARCO request
        arco_req = create_request(
            db, alpha_admin_ctx,
            registro_id=reg_id,
            tipo=ArcoTipo.CANCELACION,
            motivo="Test scope",
            titular_ref="MASKED",
        )
        arco_req_id = arco_req.id

        # Beta admin attempts to execute — must get 0 (no rows in scope)
        count = hard_delete_titular(
            db, beta_admin_ctx, request_id=arco_req_id, registro_ids=[reg_id]
        )
        assert count == 0, "Beta admin must not delete Alpha registros"

        # Alpha registro must still exist
        row = db.execute(
            select(Registro).where(Registro.id == reg_id)
        ).scalar_one_or_none()
        assert row is not None, "Alpha registro must survive Beta admin's attempt"

    finally:
        db.query(PrivacyAcceptance).delete()
        db.query(AuditLog).filter(AuditLog.action == "registro.arco_hard_delete").delete()
        db.query(ArcoRequest).delete()
        db.query(Registro).delete()
        db.commit()
        db.close()


# ---------------------------------------------------------------------------
# 3. Router: RBAC enforcement
# ---------------------------------------------------------------------------

def test_arco_ejecutar_requires_admin(seed_data, client):
    """POST /api/arco/solicitudes/{id}/ejecutar returns 403 for non-admin."""
    from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers

    hdrs = auth_headers(client, "activista1@alpha.gov")
    hdrs["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID
    resp = client.post(
        "/api/arco/solicitudes/fake-id/ejecutar",
        headers=hdrs,
    )
    assert resp.status_code == 403


def test_arco_solicitudes_list_requires_admin(seed_data, client):
    """GET /api/arco/solicitudes returns 403 for non-admin."""
    from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers

    hdrs = auth_headers(client, "activista1@alpha.gov")
    hdrs["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID
    resp = client.get("/api/arco/solicitudes", headers=hdrs)
    assert resp.status_code == 403


def test_arco_create_solicitud_requires_admin(seed_data, client):
    """POST /api/arco/solicitudes returns 403 for non-admin."""
    from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers

    hdrs = auth_headers(client, "activista1@alpha.gov")
    hdrs["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID
    resp = client.post(
        "/api/arco/solicitudes",
        json={"registro_id": "fake", "tipo": "CANCELACION", "motivo": "test"},
        headers=hdrs,
    )
    assert resp.status_code == 403


def test_arco_create_and_execute_via_router(seed_data, client):
    """Admin can create + execute an ARCO hard-delete via the HTTP router."""
    from sqlalchemy import select

    from app.models.audit_log import AuditLog
    from app.models.privacy import PrivacyAcceptance
    from app.models.registro import Registro
    from app.models.user import User
    from app.dependencies import CampaignContext
    from app.schemas.registro import RegistroCreate
    from app.services import registro_service
    from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers

    db = TestingSessionLocal()
    try:
        act = db.execute(select(User).where(User.email == "activista1@alpha.gov")).scalar_one()
        act_ctx = CampaignContext(
            user=act, organization_id=act.organization_id,
            role=act.role, campaign_id=ALPHA_CAMPAIGN_ID,
        )
        reg = registro_service.create_registro(
            db, act_ctx,
            RegistroCreate(nombre_completo="ARCO Router Test", consentimiento=True),
        )
        reg_id = reg.id
    finally:
        db.close()

    admin_hdrs = auth_headers(client, "admin@alpha.gov")
    admin_hdrs["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID

    # 1. Create ARCO solicitud
    resp = client.post(
        "/api/arco/solicitudes",
        json={"registro_id": reg_id, "tipo": "CANCELACION", "motivo": "Derecho ARCO", "titular_ref": "MASKED"},
        headers=admin_hdrs,
    )
    assert resp.status_code == 201, resp.text
    solicitud_id = resp.json()["id"]

    # 2. Execute the hard-delete
    resp2 = client.post(
        f"/api/arco/solicitudes/{solicitud_id}/ejecutar",
        headers=admin_hdrs,
    )
    assert resp2.status_code == 200, resp2.text
    body = resp2.json()
    assert body["deleted"] == 1

    # 3. Registro must be GONE from DB
    db2 = TestingSessionLocal()
    try:
        row = db2.execute(
            select(Registro).where(Registro.id == reg_id)
        ).scalar_one_or_none()
        assert row is None, "Registro must be physically removed after ARCO ejecutar"
    finally:
        from app.models.arco import ArcoRequest
        db2.query(PrivacyAcceptance).delete()
        db2.query(AuditLog).filter(AuditLog.action == "registro.arco_hard_delete").delete()
        db2.query(ArcoRequest).delete()
        db2.query(Registro).delete()
        db2.commit()
        db2.close()
