"""Baseline: pre-SP0a schema (organizations, users, audit_logs, electoral_areas).

Revision ID: 0001
Revises: --
Create Date: 2026-06-18

This revision captures the schema that was previously created by
``Base.metadata.create_all`` BEFORE the SP0a changes.  An existing production
database that was bootstrapped via create_all can be stamped to this revision:

    alembic stamp 0001

A completely fresh database should run ``alembic upgrade head`` which will
execute 0001 then 0002 in sequence.
"""

import sqlalchemy as sa
from alembic import op

# ---------------------------------------------------------------------------
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None
# ---------------------------------------------------------------------------

# Enum labels MUST be the SQLAlchemy member *names* (uppercase) — the app maps
# enums with the default ``Enum(PyEnum)`` (no values_callable), which stores the
# member NAME, and the original create_all-built production DB created the types
# that way too.  Earlier these migrations used the lowercase member *values*,
# which mismatched the app + create_all schema and crashed prod on upgrade.
#
# Pre-SP0a AreaLevel members (the 6 original values).
_OLD_AREA_LEVEL_VALUES = ("COUNTRY", "REGION", "STATE", "MUNICIPALITY", "DISTRICT", "PRECINCT")

# UserRole members (unchanged across revisions).
_USER_ROLE_VALUES = ("SUPERADMIN", "ADMIN", "ANALYST", "VIEWER")


def _now_default(is_pg: bool) -> sa.sql.expression.TextClause:
    """Dialect-portable server default for CURRENT TIMESTAMP."""
    return sa.text("now()") if is_pg else sa.text("(datetime('now'))")


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    now = _now_default(is_pg)

    def _enum_col(values, name):
        """Enum column type that never auto-creates its PG type in create_table.

        Generic ``sa.Enum(create_type=False)`` does NOT suppress the implicit
        ``CREATE TYPE`` emitted by ``op.create_table`` on Postgres (an alembic
        quirk), so the type — already created explicitly with checkfirst below —
        gets created twice → ``DuplicateObject``.  ``postgresql.ENUM`` honours
        ``create_type=False``; SQLite falls back to ``sa.Enum`` (VARCHAR).
        """
        if is_pg:
            from sqlalchemy.dialects import postgresql
            return postgresql.ENUM(*values, name=name, create_type=False)
        return sa.Enum(*values, name=name)

    # ── organizations ─────────────────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("updated_by", sa.String(36), nullable=True),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"], unique=True)

    # ── user_role enum ────────────────────────────────────────────────────────
    # Created once here; campaign_memberships reuses it with create_type=False.
    if is_pg:
        sa.Enum(*_USER_ROLE_VALUES, name="user_role").create(bind, checkfirst=True)

    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        # No `index=True` here -- we create the index explicitly below.
        sa.Column(
            "organization_id",
            sa.String(36),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column(
            "role",
            _enum_col(_USER_ROLE_VALUES, "user_role"),
            nullable=False,
            server_default="VIEWER",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("phone", sa.String(40), nullable=True),
        sa.Column(
            "must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("updated_by", sa.String(36), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_organization_id", "users", ["organization_id"])

    # ── audit_logs ────────────────────────────────────────────────────────────
    # JSONB on Postgres, JSON on everything else.
    if is_pg:
        from sqlalchemy.dialects.postgresql import JSONB
        meta_type = JSONB()
    else:
        meta_type = sa.JSON()

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("actor_id", sa.String(36), nullable=True),
        sa.Column("organization_id", sa.String(36), nullable=True),
        sa.Column("action", sa.String(120), nullable=False),
        sa.Column("entity_type", sa.String(120), nullable=True),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column("metadata", meta_type, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=now,
            nullable=False,
        ),
    )
    op.create_index("ix_audit_logs_actor_id", "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_organization_id", "audit_logs", ["organization_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # ── area_level enum ───────────────────────────────────────────────────────
    if is_pg:
        sa.Enum(*_OLD_AREA_LEVEL_VALUES, name="area_level").create(bind, checkfirst=True)

    # ── Geometry column: PostGIS on Postgres, Text on SQLite/other ─────────────
    if is_pg:
        from geoalchemy2 import Geometry as _Geometry
        geom_col = sa.Column("geometry", _Geometry("GEOMETRY", srid=4326), nullable=True)
    else:
        geom_col = sa.Column("geometry", sa.Text(), nullable=True)

    # ── electoral_areas (baseline shape, organization_id NOT NULL) ────────────
    op.create_table(
        "electoral_areas",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        # In the pre-SP0a baseline, organization_id was required (NOT NULL).
        # SP0a makes it nullable so global cartography can be unbound from tenants.
        # The ALTER happens in migration 0002.
        sa.Column(
            "organization_id",
            sa.String(36),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("code", sa.String(120), nullable=True),
        sa.Column(
            "level",
            _enum_col(_OLD_AREA_LEVEL_VALUES, "area_level"),
            nullable=False,
            server_default="DISTRICT",
        ),
        geom_col,
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("updated_by", sa.String(36), nullable=True),
    )
    op.create_index(
        "ix_electoral_areas_organization_id", "electoral_areas", ["organization_id"]
    )
    op.create_index("ix_electoral_areas_code", "electoral_areas", ["code"])


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    op.drop_table("electoral_areas")
    op.drop_table("audit_logs")
    op.drop_table("users")
    op.drop_table("organizations")

    if is_pg:
        sa.Enum(name="area_level").drop(bind, checkfirst=True)
        sa.Enum(name="user_role").drop(bind, checkfirst=True)
