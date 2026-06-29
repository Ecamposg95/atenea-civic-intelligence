"""Tests for the activist capture core (User extensions, Registro model)."""
from datetime import datetime, timezone

from app.core import crypto
from app.models.registro import Registro
from app.models.user import User, UserRole
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal


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
