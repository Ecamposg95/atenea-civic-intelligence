"""SP0b-1 ingestion tables: data_sources, ingest_runs, census_metrics.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-19

Tables introduced:
- data_sources   — registered data source registry per organisation.
- ingest_runs    — per-file execution trace with counters and status.
- census_metrics — tidy census/DENUE fact rows linked to electoral areas.

New enum types (Postgres only):
- source_kind    — file_csv / file_excel / file_shapefile / file_geojson / api
- ingest_status  — running / success / partial / failed
"""

import sqlalchemy as sa
from alembic import op

# ---------------------------------------------------------------------------
revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None
# ---------------------------------------------------------------------------

_SOURCE_KIND_VALUES = ("file_csv", "file_excel", "file_shapefile", "file_geojson", "api")
_INGEST_STATUS_VALUES = ("running", "success", "partial", "failed")


def _now_default(is_pg: bool) -> sa.sql.expression.TextClause:
    """Dialect-portable server default for CURRENT TIMESTAMP."""
    return sa.text("now()") if is_pg else sa.text("(datetime('now'))")


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    now = _now_default(is_pg)

    # ── Create new enums (Postgres only) ─────────────────────────────────────
    # On SQLite enums are stored as VARCHAR — no type object needed.
    if is_pg:
        sa.Enum(*_SOURCE_KIND_VALUES, name="source_kind").create(bind, checkfirst=True)
        sa.Enum(*_INGEST_STATUS_VALUES, name="ingest_status").create(bind, checkfirst=True)

    # ── data_sources ──────────────────────────────────────────────────────────
    op.create_table(
        "data_sources",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            sa.String(36),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(*_SOURCE_KIND_VALUES, name="source_kind", create_type=False),
            nullable=False,
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("owner", sa.String(200), nullable=True),
        # AuditMixin columns
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("updated_by", sa.String(36), nullable=True),
        sa.UniqueConstraint("organization_id", "name", name="uq_datasource_name"),
    )
    op.create_index("ix_data_sources_organization_id", "data_sources", ["organization_id"])

    # ── ingest_runs ───────────────────────────────────────────────────────────
    op.create_table(
        "ingest_runs",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            sa.String(36),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "campaign_id",
            sa.String(36),
            sa.ForeignKey("campaigns.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "source_id",
            sa.String(36),
            sa.ForeignKey("data_sources.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("dataset", sa.String(60), nullable=False),
        sa.Column("file_name", sa.String(400), nullable=True),
        sa.Column("file_hash", sa.String(64), nullable=True),
        sa.Column(
            "status",
            sa.Enum(*_INGEST_STATUS_VALUES, name="ingest_status", create_type=False),
            nullable=False,
            server_default="running",
        ),
        sa.Column("rows_read", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_inserted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        # AuditMixin columns
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("updated_by", sa.String(36), nullable=True),
    )
    op.create_index("ix_ingest_runs_organization_id", "ingest_runs", ["organization_id"])
    op.create_index("ix_ingest_runs_campaign_id", "ingest_runs", ["campaign_id"])
    op.create_index("ix_ingest_runs_source_id", "ingest_runs", ["source_id"])
    op.create_index("ix_ingest_runs_dataset", "ingest_runs", ["dataset"])

    # ── census_metrics ────────────────────────────────────────────────────────
    op.create_table(
        "census_metrics",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            sa.String(36),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "ingest_run_id",
            sa.String(36),
            sa.ForeignKey("ingest_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("nivel", sa.String(20), nullable=False),
        sa.Column("territory_code", sa.String(40), nullable=False),
        sa.Column(
            "area_id",
            sa.String(36),
            sa.ForeignKey("electoral_areas.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("indicador", sa.String(60), nullable=False),
        sa.Column("valor", sa.Numeric(), nullable=False),
        # AuditMixin columns
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("updated_by", sa.String(36), nullable=True),
    )
    # Composite lookup index (nivel, territory_code, indicador, anio)
    op.create_index(
        "ix_census_lookup",
        "census_metrics",
        ["nivel", "territory_code", "indicador", "anio"],
    )
    op.create_index("ix_census_metrics_territory_code", "census_metrics", ["territory_code"])
    op.create_index("ix_census_metrics_organization_id", "census_metrics", ["organization_id"])
    op.create_index("ix_census_metrics_ingest_run_id", "census_metrics", ["ingest_run_id"])
    op.create_index("ix_census_metrics_area_id", "census_metrics", ["area_id"])


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    # Drop in reverse FK order: census_metrics → ingest_runs → data_sources
    op.drop_table("census_metrics")
    op.drop_table("ingest_runs")
    op.drop_table("data_sources")

    # Drop Postgres-only enum types
    if is_pg:
        sa.Enum(name="ingest_status").drop(bind, checkfirst=True)
        sa.Enum(name="source_kind").drop(bind, checkfirst=True)
