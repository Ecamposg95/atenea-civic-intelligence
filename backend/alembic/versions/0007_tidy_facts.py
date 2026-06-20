"""SP0b-2b tidy fact tables: election_results, socio_metrics, economic_units.

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-20

No PG ENUM types here (all str/numeric) so the enum bugs fixed in the prod
recovery do not apply. Geometry is dialect-branched (PostGIS POINT on PG, Text
on SQLite). Idempotent via _table_exists/_index_exists pre-checks.
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def _now_default(is_pg: bool):
    return sa.text("now()") if is_pg else sa.text("(datetime('now'))")


def _audit_cols(now):
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("updated_by", sa.String(36), nullable=True),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    now = _now_default(is_pg)
    from sqlalchemy import inspect as sa_inspect
    insp = sa_inspect(bind)
    existing = set(insp.get_table_names())

    def _table_exists(n):
        return n in existing

    def _index_exists(table, name):
        if table not in existing:
            return False
        return any(ix["name"] == name for ix in insp.get_indexes(table))

    if is_pg:
        from geoalchemy2 import Geometry
        point_type = Geometry(geometry_type="POINT", srid=4326)
    else:
        point_type = sa.Text()

    # ── election_results ──────────────────────────────────────────────────────
    if not _table_exists("election_results"):
        op.create_table(
            "election_results",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("organization_id", sa.String(36),
                      sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
            sa.Column("ingest_run_id", sa.String(36),
                      sa.ForeignKey("ingest_runs.id", ondelete="SET NULL"), nullable=True),
            sa.Column("anio", sa.Integer(), nullable=False),
            sa.Column("nivel", sa.String(20), nullable=False),
            sa.Column("territory_code", sa.String(40), nullable=False),
            sa.Column("area_id", sa.String(36),
                      sa.ForeignKey("electoral_areas.id", ondelete="SET NULL"), nullable=True),
            sa.Column("eleccion", sa.String(40), nullable=False),
            sa.Column("partido", sa.String(40), nullable=False),
            sa.Column("votos", sa.Numeric(), nullable=False),
            *_audit_cols(now),
        )
    for tbl, name, cols in [
        ("election_results", "ix_election_results_organization_id", ["organization_id"]),
        ("election_results", "ix_election_results_ingest_run_id", ["ingest_run_id"]),
        ("election_results", "ix_election_results_territory_code", ["territory_code"]),
        ("election_results", "ix_election_results_area_id", ["area_id"]),
        ("election_results", "ix_election_lookup",
         ["anio", "nivel", "territory_code", "eleccion", "partido"]),
    ]:
        if not _index_exists(tbl, name):
            op.create_index(name, tbl, cols)

    # ── socio_metrics ─────────────────────────────────────────────────────────
    if not _table_exists("socio_metrics"):
        op.create_table(
            "socio_metrics",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("organization_id", sa.String(36),
                      sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
            sa.Column("ingest_run_id", sa.String(36),
                      sa.ForeignKey("ingest_runs.id", ondelete="SET NULL"), nullable=True),
            sa.Column("anio", sa.Integer(), nullable=False),
            sa.Column("nivel", sa.String(20), nullable=False),
            sa.Column("territory_code", sa.String(40), nullable=False),
            sa.Column("area_id", sa.String(36),
                      sa.ForeignKey("electoral_areas.id", ondelete="SET NULL"), nullable=True),
            sa.Column("indicador", sa.String(60), nullable=False),
            sa.Column("valor", sa.Numeric(), nullable=False),
            *_audit_cols(now),
        )
    for tbl, name, cols in [
        ("socio_metrics", "ix_socio_metrics_organization_id", ["organization_id"]),
        ("socio_metrics", "ix_socio_metrics_ingest_run_id", ["ingest_run_id"]),
        ("socio_metrics", "ix_socio_metrics_territory_code", ["territory_code"]),
        ("socio_metrics", "ix_socio_metrics_area_id", ["area_id"]),
        ("socio_metrics", "ix_socio_lookup", ["nivel", "territory_code", "indicador", "anio"]),
    ]:
        if not _index_exists(tbl, name):
            op.create_index(name, tbl, cols)

    # ── economic_units ────────────────────────────────────────────────────────
    if not _table_exists("economic_units"):
        op.create_table(
            "economic_units",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("organization_id", sa.String(36),
                      sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
            sa.Column("ingest_run_id", sa.String(36),
                      sa.ForeignKey("ingest_runs.id", ondelete="SET NULL"), nullable=True),
            sa.Column("clave", sa.String(40), nullable=False),
            sa.Column("nombre", sa.String(300), nullable=False),
            sa.Column("actividad", sa.String(20), nullable=True),
            sa.Column("actividad_desc", sa.String(300), nullable=True),
            sa.Column("estrato", sa.String(60), nullable=True),
            sa.Column("territory_code", sa.String(40), nullable=False),
            sa.Column("area_id", sa.String(36),
                      sa.ForeignKey("electoral_areas.id", ondelete="SET NULL"), nullable=True),
            sa.Column("lat", sa.Numeric(), nullable=True),
            sa.Column("lon", sa.Numeric(), nullable=True),
            sa.Column("geometry", point_type, nullable=True),
            *_audit_cols(now),
        )
    for tbl, name, cols in [
        ("economic_units", "ix_economic_units_organization_id", ["organization_id"]),
        ("economic_units", "ix_economic_units_ingest_run_id", ["ingest_run_id"]),
        ("economic_units", "ix_economic_units_clave", ["clave"]),
        ("economic_units", "ix_economic_units_territory_code", ["territory_code"]),
        ("economic_units", "ix_economic_units_area_id", ["area_id"]),
    ]:
        if not _index_exists(tbl, name):
            op.create_index(name, tbl, cols)


def downgrade() -> None:
    op.drop_table("economic_units")
    op.drop_table("socio_metrics")
    op.drop_table("election_results")
