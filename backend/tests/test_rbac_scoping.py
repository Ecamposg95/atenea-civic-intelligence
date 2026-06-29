"""RBAC scoping tests for _role_scoped(ctx) — Task 3."""
from sqlalchemy import select, false

from app.models.user import User, UserRole
from app.services import registro_service
from app.dependencies import CampaignContext
from tests.conftest import TestingSessionLocal, ALPHA_CAMPAIGN_ID


def _ctx(db, email):
    u = db.execute(select(User).where(User.email == email)).scalar_one()
    return CampaignContext(
        user=u,
        organization_id=u.organization_id,
        role=u.role,
        campaign_id=ALPHA_CAMPAIGN_ID,
    )


def test_consulta_role_sees_nothing():
    db = TestingSessionLocal()
    try:
        sql = str(registro_service._role_scoped(_ctx(db, "consulta@alpha.gov")))
        assert "1 != 1" in sql or "false" in sql.lower()
    finally:
        db.close()


def test_coordinador_scope_includes_sub_structure():
    # coord@alpha.gov coordina a lider@alpha.gov, cuyos activistas son activista1/2.
    db = TestingSessionLocal()
    try:
        stmt = registro_service._role_scoped(_ctx(db, "coord@alpha.gov"))
        assert "coordinador_id" in str(stmt) or "lider_id" in str(stmt)
    finally:
        db.close()


def test_capturista_scope_is_own_only():
    db = TestingSessionLocal()
    try:
        stmt = registro_service._role_scoped(_ctx(db, "capturista@alpha.gov"))
        sql = str(stmt)
        # Must contain activista_id = <id> restriction, not a subquery over lider_id.
        assert "activista_id" in sql
        assert "lider_id" not in sql
    finally:
        db.close()


def test_viewer_role_sees_nothing():
    db = TestingSessionLocal()
    try:
        sql = str(registro_service._role_scoped(_ctx(db, "viewer@alpha.gov")))
        assert "1 != 1" in sql or "false" in sql.lower()
    finally:
        db.close()
