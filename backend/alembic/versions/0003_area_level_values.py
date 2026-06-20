"""Extend area_level enum with SP0a Mexican electoral hierarchy values.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-18

This revision exists as its own file because ALTER TYPE ... ADD VALUE must run
OUTSIDE a transaction on Postgres (hence the autocommit_block).  Separating it
from 0002 ensures 0002 itself is fully transactional and atomically rollback-safe.

On SQLite the enum is stored as VARCHAR — no DDL is needed.

Downgrade is a no-op: PostgreSQL does not support removing values from an
existing enum type.  Operators who need a clean enum must recreate it manually.
"""

from alembic import op

# ---------------------------------------------------------------------------
revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None
# ---------------------------------------------------------------------------

# Member NAMES (uppercase) — matches the app's Enum(AreaLevel) mapping and the
# uppercase labels created by 0001/create_all.
NEW = [
    "NATION",
    "ESTADO",
    "MUNICIPIO",
    "DISTRITO_FEDERAL",
    "DISTRITO_LOCAL",
    "SECCION",
    "COLONIA",
    "MANZANA",
    "CASILLA",
]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite: enum is just VARCHAR — nothing to do.
        return
    with op.get_context().autocommit_block():
        for v in NEW:
            op.execute(f"ALTER TYPE area_level ADD VALUE IF NOT EXISTS '{v}'")


def downgrade() -> None:
    pass  # PostgreSQL does not support removing enum values
