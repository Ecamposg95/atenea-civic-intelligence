"""Export schema constants — column order and media-type map for registros exports.

No Pydantic model is needed: the export endpoint returns a binary/text file,
not a JSON body. This module centralises the column list so the service and
tests agree on the exact header order.
"""
from __future__ import annotations

# Ordered columns written to every export (CSV header row / XLSX row 1).
# The "clave" column is masked (****-XXXX) by default; plaintext only on
# audited reveal-export (ADMIN/SUPERADMIN).
EXPORT_COLUMNS: list[str] = [
    "id",
    "organization_name",
    "campaign_id",
    "activista_nombre",
    "lider_nombre",
    "nombre_completo",
    "seccion",
    "colonia",
    "area",
    "telefono",
    "clave",
    "consentimiento",
    "consentimiento_at",
    "created_at",
]

MEDIA_TYPES: dict[str, str] = {
    "csv": "text/csv; charset=utf-8",
    "xlsx": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ),
}
