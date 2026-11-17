"""0022 captura SMA: tipo/padre/nombre desglosado/clave_hash/curp/hoja/legacy en registros

Revision ID: 0022_captura_sma
Revises: 0021_campaign_municipio

Adds the paper-sheet capture columns (spec 2026-11-17 §4) and marks every
pre-existing registro as ``legacy = true`` ("valor viejo"). Idempotent and
SQLite-compatible (batch_alter_table for the self-FK).
"""
from alembic import op
import sqlalchemy as sa

revision = "0022_captura_sma"
down_revision = "0021_campaign_municipio"
branch_labels = None
depends_on = None

_TABLE = "registros"
_FK_NAME = "fk_registros_padre_id_registros"

_COLUMNS = [
    ("tipo", lambda: sa.Column("tipo", sa.String(12), nullable=True)),
    ("padre_id", lambda: sa.Column("padre_id", sa.String(36), nullable=True)),
    ("apellido_paterno", lambda: sa.Column("apellido_paterno", sa.String(120), nullable=True)),
    ("apellido_materno", lambda: sa.Column("apellido_materno", sa.String(120), nullable=True)),
    ("nombres", lambda: sa.Column("nombres", sa.String(120), nullable=True)),
    ("calle", lambda: sa.Column("calle", sa.String(255), nullable=True)),
    ("numero", lambda: sa.Column("numero", sa.String(20), nullable=True)),
    ("clave_hash", lambda: sa.Column("clave_hash", sa.String(64), nullable=True)),
    ("hoja_id", lambda: sa.Column("hoja_id", sa.String(36), nullable=True)),
    ("curp_enc", lambda: sa.Column("curp_enc", sa.LargeBinary(), nullable=True)),
    ("curp_masked", lambda: sa.Column("curp_masked", sa.String(20), nullable=True)),
    ("curp_hash", lambda: sa.Column("curp_hash", sa.String(64), nullable=True)),
]

_INDEXES = [
    ("ix_registros_padre_id", ["padre_id"]),
    ("ix_registros_clave_hash", ["clave_hash"]),
    ("ix_registros_hoja_id", ["hoja_id"]),
    ("ix_registros_curp_hash", ["curp_hash"]),
]


def _insp():
    return sa.inspect(op.get_bind())


def _column_exists(table: str, col: str) -> bool:
    return any(c["name"] == col for c in _insp().get_columns(table))


def _index_exists(table: str, name: str) -> bool:
    return any(ix["name"] == name for ix in _insp().get_indexes(table))


def _fk_exists(table: str, name: str) -> bool:
    return any(fk.get("name") == name for fk in _insp().get_foreign_keys(table))


def upgrade() -> None:
    legacy_added = False
    missing = [(n, f) for n, f in _COLUMNS if not _column_exists(_TABLE, n)]
    need_legacy = not _column_exists(_TABLE, "legacy")
    if missing or need_legacy:
        with op.batch_alter_table(_TABLE) as batch:
            for _name, factory in missing:
                batch.add_column(factory())
            if need_legacy:
                batch.add_column(sa.Column(
                    "legacy", sa.Boolean(), nullable=False, server_default=sa.false()))
                legacy_added = True

    if not _fk_exists(_TABLE, _FK_NAME):
        with op.batch_alter_table(_TABLE) as batch:
            batch.create_foreign_key(
                _FK_NAME, _TABLE, ["padre_id"], ["id"], ondelete="SET NULL")

    for name, cols in _INDEXES:
        if not _index_exists(_TABLE, name):
            op.create_index(name, _TABLE, cols)

    # Every row that existed before this migration is a "valor viejo". Only run
    # when the column was created here so a re-run never re-flags new captures.
    if legacy_added:
        op.execute(sa.text("UPDATE registros SET legacy = :t").bindparams(t=True))


def downgrade() -> None:
    for name, _cols in _INDEXES:
        if _index_exists(_TABLE, name):
            op.drop_index(name, table_name=_TABLE)
    if _fk_exists(_TABLE, _FK_NAME):
        with op.batch_alter_table(_TABLE) as batch:
            batch.drop_constraint(_FK_NAME, type_="foreignkey")
    cols = [n for n, _f in _COLUMNS] + ["legacy"]
    present = [c for c in cols if _column_exists(_TABLE, c)]
    if present:
        with op.batch_alter_table(_TABLE) as batch:
            for c in present:
                batch.drop_column(c)
