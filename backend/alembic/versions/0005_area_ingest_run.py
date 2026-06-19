"""SP0b-2a: ElectoralArea.ingest_run_id — geometry-load traceability.

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-19

Changes introduced:
- electoral_areas: add nullable ingest_run_id (FK → ingest_runs.id, SET NULL).

NOTE — SQLite ALTER TABLE does not support ADD COLUMN … REFERENCES … when FK
constraints are enabled at the engine level.  This revision uses the same
pattern as 0002: the FK constraint is added only on Postgres; on SQLite the
column is a plain nullable VARCHAR (FK relationships are not enforced by SQLite
without PRAGMA foreign_keys=ON, so omitting the constraint is safe for dev/tests
and the column is still present and indexed).
"""

import sqlalchemy as sa
from alembic import op

# ---------------------------------------------------------------------------
revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None
# ---------------------------------------------------------------------------


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    # On Postgres include the FK constraint; on SQLite add a plain nullable
    # VARCHAR (matching the approach used for hierarchy FKs in 0002).
    fk_args = [sa.ForeignKey("ingest_runs.id", ondelete="SET NULL")] if is_pg else []

    op.add_column(
        "electoral_areas",
        sa.Column("ingest_run_id", sa.String(36), *fk_args, nullable=True),
    )
    op.create_index(
        "ix_electoral_areas_ingest_run_id", "electoral_areas", ["ingest_run_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_electoral_areas_ingest_run_id", table_name="electoral_areas")
    op.drop_column("electoral_areas", "ingest_run_id")
