"""Captura v2: sexo, edad, estructura, observacion en registros.

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-02

Notes
-----
* Migración puramente aditiva: 4 columnas nullable. Sin enums nuevos.
* Idempotente: guarda _column_exists en cada add_column.
* SQLite-safe: ADD COLUMN simple, sin batch (no hay constraints).
* La columna existente ``area`` se conserva intacta (no se toca).
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

_NEW_COLUMNS = (
    ("sexo", sa.String(length=1)),
    ("edad", sa.Integer()),
    ("estructura", sa.String(length=120)),
    ("observacion", sa.String(length=1000)),
)


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return False
    return any(c["name"] == column for c in insp.get_columns(table))


def upgrade() -> None:
    for name, coltype in _NEW_COLUMNS:
        if not _column_exists("registros", name):
            op.add_column("registros", sa.Column(name, coltype, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_NEW_COLUMNS):
        if _column_exists("registros", name):
            op.drop_column("registros", name)
