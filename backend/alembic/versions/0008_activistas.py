"""SPA-1 activistas: registros table + user lider_id/seccion + roles.

Revision ID: 0008
Revises: 0006
Create Date: 2026-06-28

Notes
-----
* down_revision is 0006, NOT 0007, because SP0b-2b (0007 tidy-fact loaders) is
  on a separate unmerged branch (feat/sp0b2b-tidy-facts).  When that branch is
  merged, a Alembic merge-migration (two down_revisions) will be needed.
* ALTER TYPE … ADD VALUE CANNOT run inside a transaction on PostgreSQL.  The
  statements are wrapped in op.get_context().autocommit_block(), matching the
  established pattern in 0003_area_level_values.py.
* Enum values are persisted as member NAMES (uppercase) — the app uses
  Enum(UserRole, name="user_role") with default values_callable, which stores
  the NAME.  0001 created the type with ("SUPERADMIN","ADMIN","ANALYST","VIEWER"),
  so new values must also be uppercase: 'LIDER', 'ACTIVISTA'.
* registros.activista_id is nullable=True because ondelete="SET NULL" on a NOT
  NULL column is a contradiction that crashes on hard-delete in PostgreSQL.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# ---------------------------------------------------------------------------
revision = "0008"
down_revision = "0006"
branch_labels = None
depends_on = None
# ---------------------------------------------------------------------------


def _table_exists(name: str) -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(name)


def _index_exists(table: str, index: str) -> bool:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(table):
        return False
    return any(ix["name"] == index for ix in sa.inspect(bind).get_indexes(table))


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    # 1. Extend the user_role enum (PG only; SQLite stores VARCHAR).
    #    MUST run in autocommit_block — ALTER TYPE … ADD VALUE is not allowed
    #    inside a transaction on PostgreSQL (hard lesson from prod crash-loop).
    if is_pg:
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'LIDER'")
            op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ACTIVISTA'")

    # 2. users.lider_id + users.seccion.
    user_cols = {c["name"] for c in sa.inspect(bind).get_columns("users")}
    if "lider_id" not in user_cols:
        op.add_column("users", sa.Column("lider_id", sa.String(length=36), nullable=True))
        if is_pg:
            # SQLite does not support ALTER TABLE ADD CONSTRAINT for FK; the
            # constraint is defined inline in create_table on fresh SQLite DBs.
            # FK enforcement is not relevant on test/dev SQLite anyway.
            op.create_foreign_key(
                "fk_users_lider_id", "users", "users", ["lider_id"], ["id"], ondelete="SET NULL"
            )
        op.create_index("ix_users_lider_id", "users", ["lider_id"])
    if "seccion" not in user_cols:
        op.add_column("users", sa.Column("seccion", sa.String(length=20), nullable=True))

    # 3. registros table.
    if not _table_exists("registros"):
        op.create_table(
            "registros",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "organization_id",
                sa.String(length=36),
                sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "campaign_id",
                sa.String(length=36),
                sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
                nullable=False,
            ),
            # nullable=True so that ondelete="SET NULL" is honoured on hard-delete.
            # A NOT NULL column with SET NULL would raise an integrity error in PG.
            sa.Column(
                "activista_id",
                sa.String(length=36),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("nombre_completo", sa.String(length=255), nullable=False),
            sa.Column("seccion", sa.String(length=20), nullable=True),
            sa.Column("direccion", sa.String(length=500), nullable=True),
            sa.Column("colonia", sa.String(length=255), nullable=True),
            sa.Column("telefono", sa.String(length=40), nullable=True),
            sa.Column("area", sa.String(length=120), nullable=True),
            sa.Column("clave_elector_enc", sa.LargeBinary(), nullable=True),
            sa.Column("clave_masked", sa.String(length=20), nullable=True),
            sa.Column("consentimiento", sa.Boolean(), nullable=False),
            sa.Column("consentimiento_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("aviso_version", sa.String(length=40), nullable=True),
            sa.Column("client_uuid", sa.String(length=64), nullable=True),
            sa.Column("lat", sa.Float(), nullable=True),
            sa.Column("lng", sa.Float(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(length=36), nullable=True),
            sa.Column("updated_by", sa.String(length=36), nullable=True),
            sa.UniqueConstraint(
                "campaign_id", "client_uuid", name="uq_registros_campaign_client_uuid"
            ),
        )

    # 4. Indexes on registros (idempotent via _index_exists guard).
    if not _index_exists("registros", "ix_registros_campaign_activista"):
        op.create_index(
            "ix_registros_campaign_activista", "registros", ["campaign_id", "activista_id"]
        )
    if not _index_exists("registros", "ix_registros_campaign_seccion"):
        op.create_index(
            "ix_registros_campaign_seccion", "registros", ["campaign_id", "seccion"]
        )
    if not _index_exists("registros", "ix_registros_organization_id"):
        op.create_index("ix_registros_organization_id", "registros", ["organization_id"])
    if not _index_exists("registros", "ix_registros_campaign_id"):
        op.create_index("ix_registros_campaign_id", "registros", ["campaign_id"])
    if not _index_exists("registros", "ix_registros_activista_id"):
        op.create_index("ix_registros_activista_id", "registros", ["activista_id"])


def downgrade() -> None:
    bind = op.get_bind()

    if _table_exists("registros"):
        op.drop_table("registros")

    user_cols = {c["name"] for c in sa.inspect(bind).get_columns("users")}
    if "seccion" in user_cols:
        op.drop_column("users", "seccion")
    if "lider_id" in user_cols:
        if bind.dialect.name == "postgresql":
            op.drop_constraint("fk_users_lider_id", "users", type_="foreignkey")
        op.drop_index("ix_users_lider_id", table_name="users")
        op.drop_column("users", "lider_id")

    # Enum values are never removed (consistent with all prior migrations and
    # PostgreSQL's lack of DROP VALUE support).
