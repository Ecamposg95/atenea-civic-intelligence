"""IEEM (Instituto Electoral del Estado de México) Numeralia — real CSV datasets.

Files are stable CSV downloads (no token, no API). We fetch bytes server-side
(avoids CORS) and parse with the stdlib csv module. The real files are NOT clean
header-first tables: they carry decorative title/preamble rows (e.g. "INSTITUTO
ELECTORAL DEL ESTADO DE MÉXICO", "MUNICIPIOS") and are encoded in Windows-1252.

For "numbered catalog" datasets (a sequential 1..N list) we skip the preamble by
keeping only rows whose first cell is an integer and apply configured column
names. Add datasets here as their exact file names/shapes are confirmed.
"""

from __future__ import annotations

import csv
import io
from typing import Any, Callable

from app.integrations.ine.base import get_bytes

BASE = "https://dorganizacion.ieem.org.mx/numeralia/docs"
SOURCE = "IEEM Numeralia — Registro Federal de Electores (Estado de México)"

# key -> { label, file, kind, columns }
#   kind="numbered": keep rows whose first cell is an integer, map to `columns`.
#   kind="table"   : generic header-first CSV.
DATASETS: dict[str, dict[str, Any]] = {
    "municipios": {
        "label": "Catálogo de municipios",
        "file": "Municipios_EdoMex_2025.csv",
        "kind": "numbered",
        "columns": ["Clave", "Municipio"],
    },
    "distritos_locales": {
        "label": "Distritos electorales locales",
        "file": "Distritos_Electorales_Locales_2025.csv",
        "kind": "numbered",
        "columns": ["Distrito", "Cabecera"],
    },
}


def list_datasets() -> list[dict[str, str]]:
    return [{"key": k, "label": v["label"]} for k, v in DATASETS.items()]


def _decode(raw: bytes) -> str:
    """IEEM CSVs are not always UTF-8 (often Windows-1252 / Latin-1). Try
    common encodings before falling back to a lossy latin-1 decode."""
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace")


def _read_rows(raw: bytes) -> list[list[str]]:
    """Decode + CSV-split into non-empty rows of stripped cells."""
    reader = csv.reader(io.StringIO(_decode(raw)))
    return [
        [c.strip() for c in r]
        for r in reader
        if any(cell.strip() for cell in r)
    ]


def _parse_numbered(
    rows: list[list[str]], columns: list[str]
) -> list[dict[str, str]]:
    """Keep only the numbered data rows (first cell is an integer), dropping
    title/preamble rows, and map each to the configured column names."""
    out: list[dict[str, str]] = []
    for r in rows:
        if r and r[0].isdigit():
            out.append({columns[i]: (r[i] if i < len(r) else "") for i in range(len(columns))})
    return out


def _parse_table(rows: list[list[str]]) -> tuple[list[str], list[dict[str, str]]]:
    if not rows:
        return [], []
    header = rows[0]
    out = [
        {header[i]: (r[i] if i < len(r) else "") for i in range(len(header))}
        for r in rows[1:]
    ]
    return header, out


def fetch_dataset(
    key: str, *, fetch: Callable[[str], bytes] | None = None
) -> dict[str, Any]:
    if key not in DATASETS:
        raise KeyError(key)
    meta = DATASETS[key]
    url = f"{BASE}/{meta['file']}"
    fetcher = fetch or (lambda u: get_bytes(u))
    rows = _read_rows(fetcher(url))

    if meta.get("kind") == "numbered":
        columns = list(meta["columns"])
        data = _parse_numbered(rows, columns)
    else:
        columns, data = _parse_table(rows)

    return {
        "key": key,
        "label": meta["label"],
        "columns": columns,
        "rows": data,
        "count": len(data),
        "source": SOURCE,
        "url": url,
    }
