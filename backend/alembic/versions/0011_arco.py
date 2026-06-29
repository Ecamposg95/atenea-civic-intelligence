"""SPA-4 Task 4: arco_requests table (ARCO hard-delete compliance trail).

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-29

Notes
-----
* ArcoRequest stores an auditable trail of ARCO (Acceso, Rectificación,
  Cancelación, Oposición) data-subject requests.
* ``registro_id`` is a plain String — intentionally NOT a FK to ``registros``
  so the trail survives after the Registro is hard-deleted.
* ``requested_by`` / ``processed_by`` FK to ``users`` with SET NULL on delete.
* Two new PG enum types: ``arco_tipo`` and ``arco_estado``.
  * Created explicitly (CREATE TYPE … IF NOT EXISTS) before CREATE TABLE.
  * In op.create_table we use ``postgresql.ENUM(create_type=False)`` to
    prevent a second CREATE TYPE from Alembic (DuplicateObject crash pattern
    documented in 0001_baseline.py and prod-recovery notes).
* Idempotent: _table_exists + _index_exists guards on every DDL statement.
* SQLite round-trip verified (up then down).
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

_ARCO_TIPO_VALUES = ("ACCESO", "RECTIFICACION", "CANCELACION", "OPOSICION")
_ARCO_ESTADO_VALUES = ("PENDIENTE", "PROCESADA", "RECHAZADA")


def _table_exists(name: str) -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(name)


def _index_exists(table: str, index: str) -> bool:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(table):
        return False
    return any(ix["name"] == index for ix in sa.inspect(bind).get_indexes(table))


def _enum_col(values: tuple[str, ...], name: str, is_pg: bool) -> sa.types.TypeEngine:
    """Dialect-portable enum column that never double-creates the PG type.

    On PostgreSQL: the type is created explicitly below (CREATE TYPE … IF NOT
    EXISTS); here we reference it with ``create_type=False`` to prevent Alembic
    from issuing a duplicate CREATE TYPE inside op.create_table.
    On SQLite: falls back to plain sa.Enum (stored as VARCHAR).
    """
    if is_pg:
        from sqlalchemy.dialects import postgresql
        return postgresql.ENUM(*values, name=name, create_type=False)
    return sa.Enum(*values, name=name)


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    # ── 1. Create PG enum types (idempotent via IF NOT EXISTS) ───────────────
    if is_pg:
        bind.execute(
            sa.text("CREATE TYPE arco_tipo AS ENUM ('ACCESO', 'RECTIFICACION', 'CANCELACION', 'OPOSICION')")
            if False else sa.text("SELECT 1")  # placeholder — use DO block below
        )
        # Use DO $$ … $$ to check existence before creating (no IF NOT EXISTS
        # syntax for CREATE TYPE in older PG).
        bind.execute(sa.text(
            "DO $$ BEGIN "
            "  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'arco_tipo') THEN "
            "    CREATE TYPE arco_tipo AS ENUM ('ACCESO', 'RECTIFICACION', 'CANCELACION', 'OPOSICION'); "
            "  END IF; "
            "END $$;"
        ))
        bind.execute(sa.text(
            "DO $$ BEGIN "
            "  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'arco_estado') THEN "
            "    CREATE TYPE arco_estado AS ENUM ('PENDIENTE', 'PROCESADA', 'RECHAZADA'); "
            "  END IF; "
            "END $$;"
        ))

    # ── 2. arco_requests table ────────────────────────────────────────────────
    if not _table_exists("arco_requests"):
        op.create_table(
            "arco_requests",
            sa.Column("id", sa.String(length=36), primary_key=True),
            # Tenant reference — NOT a FK; trail must outlive org/registro.
            sa.Column("organization_id", sa.String(length=36), nullable=True),
            sa.Column("campaign_id", sa.String(length=36), nullable=True),
            # Plain String — NOT a FK to registros (row is gone after hard-delete).
            sa.Column("registro_id", sa.String(length=36), nullable=False),
            # Opaque token ≤ 12 chars — never a full 18-char clave de elector.
            sa.Column("titular_ref", sa.String(length=12), nullable=True),
            sa.Column(
                "tipo",
                _enum_col(_ARCO_TIPO_VALUES, "arco_tipo", is_pg),
                nullable=False,
            ),
            sa.Column(
                "estado",
                _enum_col(_ARCO_ESTADO_VALUES, "arco_estado", is_pg),
                nullable=False,
            ),
            sa.Column("motivo", sa.Text(), nullable=True),
            sa.Column(
                "requested_by",
                sa.String(length=36),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "processed_by",
                sa.String(length=36),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "requested_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        )

    # ── 3. Indexes ────────────────────────────────────────────────────────────
    if not _index_exists("arco_requests", "ix_arco_requests_organization_id"):
        op.create_index(
            "ix_arco_requests_organization_id", "arco_requests", ["organization_id"]
        )
    if not _index_exists("arco_requests", "ix_arco_requests_registro_id"):
        op.create_index(
            "ix_arco_requests_registro_id", "arco_requests", ["registro_id"]
        )
    if not _index_exists("arco_requests", "ix_arco_requests_estado"):
        op.create_index(
            "ix_arco_requests_estado", "arco_requests", ["estado"]
        )


def downgrade() -> None:
    if _index_exists("arco_requests", "ix_arco_requests_estado"):
        op.drop_index("ix_arco_requests_estado", table_name="arco_requests")
    if _index_exists("arco_requests", "ix_arco_requests_registro_id"):
        op.drop_index("ix_arco_requests_registro_id", table_name="arco_requests")
    if _index_exists("arco_requests", "ix_arco_requests_organization_id"):
        op.drop_index("ix_arco_requests_organization_id", table_name="arco_requests")

    if _table_exists("arco_requests"):
        op.drop_table("arco_requests")

    # PG enum types are dropped only if the table is gone.
    # (Enum values are never removed from existing types; we only drop the type
    # if we own the entire type definition and there are no remaining dependents.)
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        bind.execute(sa.text("DROP TYPE IF EXISTS arco_estado"))
        bind.execute(sa.text("DROP TYPE IF EXISTS arco_tipo"))
