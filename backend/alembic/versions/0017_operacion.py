"""0017 operacion territorial — seccion_planes + agenda_items

Revision ID: 0017_operacion
Revises: 0016_atencion
"""
from alembic import op
import sqlalchemy as sa

revision = "0017_operacion"
down_revision = "0016_atencion"
branch_labels = None
depends_on = None


def _insp():
    return sa.inspect(op.get_bind())


def _table_exists(name: str) -> bool:
    return name in _insp().get_table_names()


def _index_exists(table: str, name: str) -> bool:
    if not _table_exists(table):
        return False
    return any(ix["name"] == name for ix in _insp().get_indexes(table))


def _audit_cols():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("updated_by", sa.String(36), nullable=True),
    ]


def upgrade() -> None:
    if not _table_exists("seccion_planes"):
        op.create_table(
            "seccion_planes",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("campaign_id", sa.String(36), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("seccion", sa.String(20), nullable=False, index=True),
            sa.Column("responsable_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("problema_dominante", sa.String(120), nullable=True),
            sa.Column("liderazgo", sa.String(500), nullable=True),
            sa.Column("meta_semanal", sa.Integer(), nullable=True),
            sa.Column("prioridad_operativa", sa.String(30), nullable=True),
            sa.Column("notas", sa.String(2000), nullable=True),
            *_audit_cols(),
        )
    if not _index_exists("seccion_planes", "uq_seccion_planes_campaign_seccion"):
        op.create_index("uq_seccion_planes_campaign_seccion", "seccion_planes", ["campaign_id", "seccion"], unique=True)

    if not _table_exists("agenda_items"):
        op.create_table(
            "agenda_items",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("campaign_id", sa.String(36), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("fase", sa.Integer(), nullable=False, index=True),
            sa.Column("titulo", sa.String(255), nullable=False),
            sa.Column("descripcion", sa.String(1000), nullable=True),
            sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
            *_audit_cols(),
        )


def downgrade() -> None:
    if _table_exists("agenda_items"):
        op.drop_table("agenda_items")
    if _table_exists("seccion_planes"):
        op.drop_table("seccion_planes")
