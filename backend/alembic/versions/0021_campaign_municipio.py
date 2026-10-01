"""0021 campaign municipio/candidato/partido + seccion_electoral.municipio_code

Revision ID: 0021_campaign_municipio
Revises: 0020_minuta_sprint
"""
from alembic import op
import sqlalchemy as sa

revision = "0021_campaign_municipio"
down_revision = "0020_minuta_sprint"
branch_labels = None
depends_on = None


def _insp():
    return sa.inspect(op.get_bind())


def _column_exists(table: str, col: str) -> bool:
    return any(c["name"] == col for c in _insp().get_columns(table))


def _index_exists(table: str, name: str) -> bool:
    return any(ix["name"] == name for ix in _insp().get_indexes(table))


def upgrade() -> None:
    with op.batch_alter_table("campaigns") as batch:
        if not _column_exists("campaigns", "municipio_code"):
            batch.add_column(sa.Column("municipio_code", sa.String(10), nullable=True))
        if not _column_exists("campaigns", "candidato"):
            batch.add_column(sa.Column("candidato", sa.String(160), nullable=True))
        if not _column_exists("campaigns", "partido"):
            batch.add_column(sa.Column("partido", sa.String(60), nullable=True))
    if not _index_exists("campaigns", "ix_campaigns_municipio_code"):
        op.create_index("ix_campaigns_municipio_code", "campaigns", ["municipio_code"])

    if not _column_exists("seccion_electoral", "municipio_code"):
        with op.batch_alter_table("seccion_electoral") as batch:
            batch.add_column(sa.Column("municipio_code", sa.String(10), nullable=True))
    if not _index_exists("seccion_electoral", "ix_seccion_electoral_municipio_code"):
        op.create_index("ix_seccion_electoral_municipio_code", "seccion_electoral", ["municipio_code"])
    # Backfill SMA (único municipio previo): las filas se sembraron con el nombre como llave.
    op.execute(
        "UPDATE seccion_electoral SET municipio_code = '15076' "
        "WHERE municipio = 'San Mateo Atenco' AND municipio_code IS NULL"
    )


def downgrade() -> None:
    if _index_exists("seccion_electoral", "ix_seccion_electoral_municipio_code"):
        op.drop_index("ix_seccion_electoral_municipio_code", table_name="seccion_electoral")
    if _column_exists("seccion_electoral", "municipio_code"):
        with op.batch_alter_table("seccion_electoral") as batch:
            batch.drop_column("municipio_code")
    if _index_exists("campaigns", "ix_campaigns_municipio_code"):
        op.drop_index("ix_campaigns_municipio_code", table_name="campaigns")
    with op.batch_alter_table("campaigns") as batch:
        for col in ("partido", "candidato", "municipio_code"):
            if _column_exists("campaigns", col):
                batch.drop_column(col)
