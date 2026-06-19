"""SP0b-2a: ensure electoral_areas.organization_id is nullable on SQLite.

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-19

Root cause
----------
Revision 0002 made ``electoral_areas.organization_id`` nullable so that global
reference cartography can be inserted without an organisation binding.  On
Postgres the ALTER COLUMN ran correctly.  On SQLite, ALTER COLUMN to change
nullability is not supported, so 0002 skipped it with a comment.  As a result
any schema built by ``alembic upgrade head`` on SQLite retains the original NOT
NULL constraint from 0001, and any attempt to insert a global area
(organization_id=None) raises::

    NOT NULL constraint failed: electoral_areas.organization_id

This revision fixes the gap using SQLAlchemy batch-alter mode (which recreates
the table transparently on SQLite) while keeping the operation idempotent on
Postgres (a plain ALTER COLUMN on an already-nullable column is a no-op).

downgrade
---------
No-op: reverting to NOT NULL would fail if any global/NULL rows exist, and a
full ``downgrade base`` drops the table anyway.
"""

import sqlalchemy as sa
from alembic import op

# ---------------------------------------------------------------------------
revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None
# ---------------------------------------------------------------------------


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Already nullable after 0002; this is a safe idempotent no-op on PG.
        op.alter_column(
            "electoral_areas",
            "organization_id",
            existing_type=sa.String(36),
            nullable=True,
        )
    else:
        # SQLite: batch mode recreates the table with the updated column
        # definition, preserving all other columns and indexes automatically.
        with op.batch_alter_table("electoral_areas") as batch_op:
            batch_op.alter_column(
                "organization_id",
                existing_type=sa.String(36),
                nullable=True,
            )


def downgrade() -> None:
    # Intentionally a no-op: reverting organization_id back to NOT NULL would
    # fail if any rows with organization_id=NULL exist (e.g. global areas
    # inserted by the geometria loader).  A full ``alembic downgrade base``
    # drops the electoral_areas table entirely, so no action is needed here.
    pass
