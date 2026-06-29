"""RBAC v2: user_role +coordinador/capturista/consulta + users.coordinador_id.

Revision ID: 0012
Revises: 0011
"""
from __future__ import annotations
import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

NEW_ROLES = ["COORDINADOR", "CAPTURISTA", "CONSULTA"]


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    if is_pg:
        with op.get_context().autocommit_block():
            for name in NEW_ROLES:
                op.execute(f"ALTER TYPE user_role ADD VALUE IF NOT EXISTS '{name}'")
    user_cols = {c["name"] for c in sa.inspect(bind).get_columns("users")}
    if "coordinador_id" not in user_cols:
        op.add_column("users", sa.Column("coordinador_id", sa.String(length=36), nullable=True))
        if is_pg:
            op.create_foreign_key(
                "fk_users_coordinador_id", "users", "users",
                ["coordinador_id"], ["id"], ondelete="SET NULL",
            )
        op.create_index("ix_users_coordinador_id", "users", ["coordinador_id"])


def downgrade() -> None:
    bind = op.get_bind()
    user_cols = {c["name"] for c in sa.inspect(bind).get_columns("users")}
    if "coordinador_id" in user_cols:
        op.drop_index("ix_users_coordinador_id", table_name="users")
        if bind.dialect.name == "postgresql":
            op.drop_constraint("fk_users_coordinador_id", "users", type_="foreignkey")
        op.drop_column("users", "coordinador_id")
    # Enum values are not removed (PG limitation; consistent with prior migrations).
