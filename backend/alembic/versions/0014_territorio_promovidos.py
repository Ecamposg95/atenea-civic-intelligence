"""Territorio + promovidos: users.area_id, seccion_electoral, registros.promotor.

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    if not insp.has_table(table):
        return False
    return any(c["name"] == column for c in insp.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    # users.area_id (plain indexed column; FK constraint only on PG)
    if not _has_column("users", "area_id"):
        op.add_column("users", sa.Column("area_id", sa.String(length=36), nullable=True))
        op.create_index("ix_users_area_id", "users", ["area_id"])
        if is_pg:
            op.create_foreign_key(
                "fk_users_area_id", "users", "electoral_areas",
                ["area_id"], ["id"], ondelete="SET NULL",
            )

    # registros.promotor
    if not _has_column("registros", "promotor"):
        op.add_column("registros", sa.Column("promotor", sa.String(length=160), nullable=True))

    # seccion_electoral
    if not _has_table("seccion_electoral"):
        op.create_table(
            "seccion_electoral",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("seccion", sa.String(length=20), nullable=False),
            sa.Column("municipio", sa.String(length=120), nullable=True),
            sa.Column("anio", sa.Integer(), nullable=False),
            sa.Column("lista_nominal", sa.Integer(), nullable=True),
            sa.Column("votos", sa.Integer(), nullable=True),
            sa.Column("participacion", sa.Float(), nullable=True),
            sa.Column("coalicion", sa.Integer(), nullable=True),
            sa.Column("morena", sa.Integer(), nullable=True),
            sa.Column("margen", sa.Integer(), nullable=True),
            sa.Column("prioridad", sa.String(length=30), nullable=True),
            sa.UniqueConstraint("seccion", "anio", name="uq_seccion_electoral_seccion_anio"),
        )
        op.create_index("ix_seccion_electoral_seccion", "seccion_electoral", ["seccion"])


def downgrade() -> None:
    if _has_table("seccion_electoral"):
        op.drop_table("seccion_electoral")
    if _has_column("registros", "promotor"):
        op.drop_column("registros", "promotor")
    if _has_column("users", "area_id"):
        if op.get_bind().dialect.name == "postgresql":
            op.drop_constraint("fk_users_area_id", "users", type_="foreignkey")
        op.drop_index("ix_users_area_id", table_name="users")
        op.drop_column("users", "area_id")
