"""TDD: PrivacyNotice + PrivacyAcceptance models + service (SPA-4 Task 2+3, AC-7.2)."""
from __future__ import annotations


def test_privacy_notice_importable():
    from app.models.privacy import PrivacyAcceptance, PrivacyNotice  # noqa: F401


def test_privacy_notice_columns():
    from app.models.privacy import PrivacyNotice

    cols = {c.name for c in PrivacyNotice.__table__.c}
    assert "organization_id" in cols
    assert "version" in cols
    assert "body" in cols
    assert "is_active" in cols


def test_privacy_acceptance_columns():
    from app.models.privacy import PrivacyAcceptance

    cols = {c.name for c in PrivacyAcceptance.__table__.c}
    assert "registro_id" in cols
    assert "notice_id" in cols
    assert "aviso_version" in cols


def test_privacy_notice_in_metadata():
    from app.database import Base

    import app.models  # noqa: F401

    assert "privacy_notices" in Base.metadata.tables


def test_privacy_acceptance_in_metadata():
    from app.database import Base

    import app.models  # noqa: F401

    assert "privacy_acceptances" in Base.metadata.tables


def test_privacy_notice_organization_id_nullable():
    """organization_id=None marks a global (platform-level) aviso."""
    from app.models.privacy import PrivacyNotice

    col = PrivacyNotice.__table__.c["organization_id"]
    assert col.nullable


def test_global_v1_notice_seeded(seed_data):
    """conftest seed_data creates the global v1 notice (org=None, is_active=True)."""
    from sqlalchemy import select

    from app.models.privacy import PrivacyNotice
    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    try:
        notice = db.execute(
            select(PrivacyNotice).where(
                PrivacyNotice.organization_id.is_(None),
                PrivacyNotice.version == "v1",
            )
        ).scalar_one_or_none()
        assert notice is not None, "Global v1 notice not found in test DB"
        assert notice.is_active is True
        assert notice.body, "Notice body must be non-empty"
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Task 3: privacy_service tests (TDD — written before implementation)
# ---------------------------------------------------------------------------


def test_get_active_notice_returns_global(seed_data):
    """get_active_notice returns the global v1 notice when no org-specific notice exists."""
    from sqlalchemy import select

    from app.dependencies import TenantContext
    from app.models.user import User, UserRole
    from app.services.privacy_service import get_active_notice
    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    try:
        user = db.execute(select(User).where(User.email == "admin@alpha.gov")).scalar_one()
        ctx = TenantContext(user=user, organization_id=user.organization_id, role=UserRole.ADMIN)
        notice = get_active_notice(db, ctx)
        assert notice.version == "v1"
        assert notice.organization_id is None
    finally:
        db.close()


def test_get_active_notice_prefers_org_specific(seed_data):
    """Org-specific active notice takes priority over the global default."""
    from sqlalchemy import select

    from app.dependencies import TenantContext
    from app.models.privacy import PrivacyNotice
    from app.models.user import User, UserRole
    from app.services.privacy_service import get_active_notice
    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    try:
        user = db.execute(select(User).where(User.email == "admin@alpha.gov")).scalar_one()
        org_id = user.organization_id
        ctx = TenantContext(user=user, organization_id=org_id, role=UserRole.ADMIN)

        org_notice = PrivacyNotice(
            organization_id=org_id,
            version="org-v1-t3",
            body="Org-specific aviso",
            is_active=True,
        )
        db.add(org_notice)
        db.commit()

        notice = get_active_notice(db, ctx)
        assert notice.organization_id == org_id
        assert notice.version == "org-v1-t3"
    finally:
        db.query(PrivacyNotice).filter(PrivacyNotice.version == "org-v1-t3").delete()
        db.commit()
        db.close()


def test_no_active_notice_raises(seed_data):
    """get_active_notice raises NoActiveNotice when no active notice is found."""
    import pytest
    from sqlalchemy import select

    from app.dependencies import TenantContext
    from app.models.privacy import PrivacyNotice
    from app.models.user import User, UserRole
    from app.services.privacy_service import NoActiveNotice, get_active_notice
    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    global_notice = None
    try:
        user = db.execute(select(User).where(User.email == "admin@alpha.gov")).scalar_one()
        ctx = TenantContext(user=user, organization_id=user.organization_id, role=UserRole.ADMIN)

        global_notice = db.execute(
            select(PrivacyNotice).where(
                PrivacyNotice.organization_id.is_(None),
                PrivacyNotice.version == "v1",
            )
        ).scalar_one()
        global_notice.is_active = False
        db.commit()

        with pytest.raises(NoActiveNotice):
            get_active_notice(db, ctx)
    finally:
        if global_notice is not None:
            global_notice.is_active = True
            db.commit()
        db.close()


def test_create_registro_stamps_real_version_and_creates_acceptance(seed_data):
    """create_registro stamps aviso_version from the active notice and creates PrivacyAcceptance."""
    from sqlalchemy import select

    from app.dependencies import CampaignContext
    from app.models.privacy import PrivacyAcceptance
    from app.models.registro import Registro
    from app.models.user import User
    from app.schemas.registro import RegistroCreate
    from app.services import registro_service
    from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal

    db = TestingSessionLocal()
    try:
        user = db.execute(select(User).where(User.email == "activista1@alpha.gov")).scalar_one()
        ctx = CampaignContext(
            user=user,
            organization_id=user.organization_id,
            role=user.role,
            campaign_id=ALPHA_CAMPAIGN_ID,
        )
        reg = registro_service.create_registro(
            db, ctx, RegistroCreate(nombre_completo="Aviso Test T3", consentimiento=True)
        )
        assert reg.aviso_version == "v1"

        acceptance = db.execute(
            select(PrivacyAcceptance).where(PrivacyAcceptance.registro_id == reg.id)
        ).scalar_one_or_none()
        assert acceptance is not None, "PrivacyAcceptance must be created alongside Registro"
        assert acceptance.aviso_version == "v1"
    finally:
        db.query(PrivacyAcceptance).delete()
        db.query(Registro).delete()
        db.commit()
        db.close()


def test_idempotent_create_no_dup_acceptance(seed_data):
    """Idempotent create (same client_uuid) does not create duplicate PrivacyAcceptance."""
    from sqlalchemy import func, select

    from app.dependencies import CampaignContext
    from app.models.privacy import PrivacyAcceptance
    from app.models.registro import Registro
    from app.models.user import User
    from app.schemas.registro import RegistroCreate
    from app.services import registro_service
    from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal

    db = TestingSessionLocal()
    try:
        user = db.execute(select(User).where(User.email == "activista1@alpha.gov")).scalar_one()
        ctx = CampaignContext(
            user=user,
            organization_id=user.organization_id,
            role=user.role,
            campaign_id=ALPHA_CAMPAIGN_ID,
        )
        r1 = registro_service.create_registro(
            db,
            ctx,
            RegistroCreate(nombre_completo="Idem T3", consentimiento=True, client_uuid="priv-idem-t3"),
        )
        r2 = registro_service.create_registro(
            db,
            ctx,
            RegistroCreate(nombre_completo="Idem T3", consentimiento=True, client_uuid="priv-idem-t3"),
        )
        assert r1.id == r2.id
        count = db.scalar(
            select(func.count()).where(PrivacyAcceptance.registro_id == r1.id)
        )
        assert count == 1, "Idempotent create must not duplicate PrivacyAcceptance"
    finally:
        db.query(PrivacyAcceptance).delete()
        db.query(Registro).delete()
        db.commit()
        db.close()


def test_publish_v2_leaves_v1_acceptance_intact(seed_data):
    """Publishing v2 deactivates v1 but leaves previous PrivacyAcceptance row unchanged."""
    from sqlalchemy import select

    from app.dependencies import CampaignContext, TenantContext
    from app.models.privacy import PrivacyAcceptance, PrivacyNotice
    from app.models.registro import Registro
    from app.models.user import User, UserRole
    from app.schemas.registro import RegistroCreate
    from app.services import registro_service
    from app.services.privacy_service import publish_notice
    from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal

    db = TestingSessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == "admin@alpha.gov")).scalar_one()
        act = db.execute(select(User).where(User.email == "activista1@alpha.gov")).scalar_one()

        act_ctx = CampaignContext(
            user=act,
            organization_id=act.organization_id,
            role=act.role,
            campaign_id=ALPHA_CAMPAIGN_ID,
        )
        reg = registro_service.create_registro(
            db, act_ctx, RegistroCreate(nombre_completo="Pre-v2 T3", consentimiento=True)
        )
        acceptance = db.execute(
            select(PrivacyAcceptance).where(PrivacyAcceptance.registro_id == reg.id)
        ).scalar_one()
        assert acceptance.aviso_version == "v1"

        # Admin (no org scope) publishes a new global v2-test notice
        admin_ctx = TenantContext(user=admin, organization_id=None, role=UserRole.SUPERADMIN)
        publish_notice(db, admin_ctx, version="v2-t3-test", body="New aviso v2")
        db.commit()

        # Existing acceptance still points to v1
        db.refresh(acceptance)
        assert acceptance.aviso_version == "v1", "Old acceptance must not be modified"

        # Global v1 is now deactivated
        v1 = db.execute(
            select(PrivacyNotice).where(
                PrivacyNotice.organization_id.is_(None),
                PrivacyNotice.version == "v1",
            )
        ).scalar_one()
        assert v1.is_active is False
    finally:
        # Restore global v1 as active; clean up test notice and registros
        v1_restore = db.execute(
            select(PrivacyNotice).where(
                PrivacyNotice.organization_id.is_(None),
                PrivacyNotice.version == "v1",
            )
        ).scalar_one_or_none()
        if v1_restore is not None:
            v1_restore.is_active = True
        db.query(PrivacyNotice).filter(PrivacyNotice.version == "v2-t3-test").delete()
        db.query(PrivacyAcceptance).delete()
        db.query(Registro).delete()
        db.commit()
        db.close()


def test_privacy_router_get_notice_returns_200(seed_data, client):
    """GET /api/privacy/notice returns the active notice body for authenticated users."""
    from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers

    hdrs = auth_headers(client, "activista1@alpha.gov")
    hdrs["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID
    resp = client.get("/api/privacy/notice", headers=hdrs)
    assert resp.status_code == 200
    body = resp.json()
    assert body["version"] == "v1"
    assert body["body"]


def test_privacy_router_post_notice_requires_admin(seed_data, client):
    """POST /api/privacy/notices is forbidden for activistas."""
    from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers

    hdrs = auth_headers(client, "activista1@alpha.gov")
    hdrs["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID
    resp = client.post(
        "/api/privacy/notices",
        json={"version": "v-unauth", "body": "Should fail"},
        headers=hdrs,
    )
    assert resp.status_code == 403
