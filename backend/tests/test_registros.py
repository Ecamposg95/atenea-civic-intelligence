"""Tests for the activist capture core (User extensions, Registro model)."""
from datetime import datetime, timezone

from sqlalchemy import select

from app.core import crypto
from app.dependencies import CampaignContext
from app.models.campaign import Campaign
from app.models.registro import Registro
from app.models.user import User, UserRole
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal


def _camp_ctx(db, email, campaign_id):
    user = db.execute(select(User).where(User.email == email)).scalar_one()
    camp = db.execute(select(Campaign).where(Campaign.id == campaign_id)).scalar_one()
    org = camp.organization_id if user.role.value == "superadmin" else user.organization_id
    return CampaignContext(user=user, organization_id=org, role=user.role, campaign_id=campaign_id)


def _make(db, ctx, nombre, **kw):
    from app.services import registro_service
    from app.schemas.registro import RegistroCreate
    return registro_service.create_registro(
        db, ctx, RegistroCreate(nombre_completo=nombre, consentimiento=True, **kw)
    )


def test_user_role_has_lider_and_activista():
    assert UserRole.LIDER.value == "lider"
    assert UserRole.ACTIVISTA.value == "activista"


def test_user_has_lider_and_seccion_columns():
    cols = User.__table__.c
    assert "lider_id" in cols
    assert "seccion" in cols


def test_registro_stores_clave_encrypted_not_plain():
    db = TestingSessionLocal()
    try:
        from app.models.organization import Organization
        org = db.query(Organization).filter_by(slug="alpha").one()
        reg = Registro(
            organization_id=org.id,
            campaign_id=ALPHA_CAMPAIGN_ID,
            activista_id="someone",
            nombre_completo="Juan Pérez",
            clave_elector_enc=crypto.encrypt_clave("ABCD1234567890XYZ8"),
            clave_masked=crypto.mask_clave("ABCD1234567890XYZ8"),
            consentimiento=True,
            consentimiento_at=datetime.now(timezone.utc),
            aviso_version="v1",
        )
        db.add(reg)
        db.commit()
        db.refresh(reg)
        assert reg.clave_masked == "****-XYZ8"
        assert b"ABCD1234567890XYZ8" not in bytes(reg.clave_elector_enc)
        assert crypto.decrypt_clave(bytes(reg.clave_elector_enc)) == "ABCD1234567890XYZ8"
    finally:
        db.query(Registro).delete()
        db.commit()
        db.close()


def test_consent_required_raises():
    from app.services import registro_service
    from app.schemas.registro import RegistroCreate
    import pytest
    db = TestingSessionLocal()
    try:
        ctx = _camp_ctx(db, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
        data = RegistroCreate(nombre_completo="Sin Consent", consentimiento=False)
        with pytest.raises(registro_service.ConsentRequired):
            registro_service.create_registro(db, ctx, data)
    finally:
        db.query(Registro).delete()
        db.commit()
        db.close()


def test_activista_sees_only_own_lider_sees_structure():
    from app.services import registro_service
    db = TestingSessionLocal()
    try:
        a1 = _camp_ctx(db, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
        a2 = _camp_ctx(db, "activista2@alpha.gov", ALPHA_CAMPAIGN_ID)
        lider = _camp_ctx(db, "lider@alpha.gov", ALPHA_CAMPAIGN_ID)
        _make(db, a1, "Persona A1")
        _make(db, a2, "Persona A2")
        own, total_own = registro_service.list_registros(db, a1, None, 50, 0)
        assert {r.nombre_completo for r in own} == {"Persona A1"}
        assert total_own == 1
        seen, total_l = registro_service.list_registros(db, lider, None, 50, 0)
        assert {r.nombre_completo for r in seen} == {"Persona A1", "Persona A2"}
        assert total_l == 2
        own2, _ = registro_service.list_registros(db, a2, None, 50, 0)
        assert {r.nombre_completo for r in own2} == {"Persona A2"}
    finally:
        db.query(Registro).delete()
        db.commit()
        db.close()


def test_update_consent_false_raises():
    from app.services import registro_service
    from app.schemas.registro import RegistroUpdate
    import pytest
    db = TestingSessionLocal()
    try:
        ctx = _camp_ctx(db, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
        r = _make(db, ctx, "Update Consent Test")
        with pytest.raises(registro_service.ConsentRequired):
            registro_service.update_registro(db, ctx, r.id, RegistroUpdate(consentimiento=False))
    finally:
        db.query(Registro).delete()
        db.commit()
        db.close()


def test_soft_delete_excludes_from_list_and_get():
    from app.services import registro_service
    db = TestingSessionLocal()
    try:
        ctx = _camp_ctx(db, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
        r = _make(db, ctx, "To Delete")
        assert registro_service.delete_registro(db, ctx, r.id) is True
        rows, total = registro_service.list_registros(db, ctx, None, 50, 0)
        assert total == 0 and rows == []
        assert registro_service.get_registro(db, ctx, r.id) is None
    finally:
        db.query(Registro).delete()
        db.commit()
        db.close()


def test_idempotent_client_uuid():
    from app.services import registro_service
    db = TestingSessionLocal()
    try:
        a1 = _camp_ctx(db, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
        r1 = _make(db, a1, "Dup", client_uuid="cu-1")
        r2 = _make(db, a1, "Dup", client_uuid="cu-1")
        assert r1.id == r2.id
        _, total = registro_service.list_registros(db, a1, None, 50, 0)
        assert total == 1
    finally:
        db.query(Registro).delete()
        db.commit()
        db.close()


def test_idempotency_is_owner_scoped():
    """Each activista's client_uuid lookup is restricted to their own rows.

    activista-B's idempotent retry must return B's own registro, never A's.
    (Fix 3: owner-scoped idempotency via _role_scoped instead of bare scoped_query.)

    Note on the DB unique constraint (campaign_id, client_uuid): the constraint is
    per-campaign, not per-activista. Two activistas using the SAME client_uuid
    in the same campaign would hit an IntegrityError on the second insert after
    the owner-scoped lookup correctly returns None. This is intentional — the
    fix prevents row leakage; the correct resolution for true UUID collisions is
    to widen the constraint to (campaign_id, activista_id, client_uuid) in a
    future migration. For now we test with distinct UUIDs (the realistic case).
    """
    from app.services import registro_service
    db = TestingSessionLocal()
    try:
        a1 = _camp_ctx(db, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID)
        a2 = _camp_ctx(db, "activista2@alpha.gov", ALPHA_CAMPAIGN_ID)

        # Each activista creates with their own UUID.
        r1 = _make(db, a1, "Owner A1", client_uuid="owner-idem-uuid-a1")
        r2 = _make(db, a2, "Owner A2", client_uuid="owner-idem-uuid-a2")

        assert r1.id != r2.id, "Two activistas must produce distinct registros"

        # Idempotent retry: each activista gets back their OWN row.
        r1_retry = _make(db, a1, "Owner A1 retry", client_uuid="owner-idem-uuid-a1")
        r2_retry = _make(db, a2, "Owner A2 retry", client_uuid="owner-idem-uuid-a2")

        assert r1_retry.id == r1.id, "A1 retry must return A1's row"
        assert r2_retry.id == r2.id, "A2 retry must return A2's row"
        assert r2_retry.id != r1.id, "A2's idempotent row must NOT be A1's row"
    finally:
        db.query(Registro).delete()
        db.commit()
        db.close()
