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
from urllib.parse import quote

from app.integrations.ine.base import get_bytes

BASE = "https://dorganizacion.ieem.org.mx/numeralia/docs"
SOURCE = "IEEM Numeralia — Registro Federal de Electores (Estado de México)"

# key -> { label, file, kind, columns, header_match }
#   kind="numbered": keep rows whose first cell is an integer, map to `columns`.
#   kind="table"   : header-first CSV. If `header_match` is set, preamble rows
#                    are skipped until a row whose first cell equals that token
#                    (case-insensitive) — that row becomes the header.
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
    # State-level padrón / lista nominal aggregate. The real file name carries
    # spaces and accents, so the URL is percent-encoded when fetched. The file
    # carries 3 decorative preamble rows ("INSTITUTO ELECTORAL…", title, "Fecha
    # de corte…") before the real header row that starts with "ENTIDAD", so we
    # use the table parser with `header_match` to locate it. If the upstream
    # layout shifts, the parse degrades gracefully (falls back to first row as
    # header) and a fetch failure raises IneSourceError (router → 502 →
    # frontend DataState).
    "padron_lista_nominal": {
        "label": "Padrón electoral y lista nominal (estatal)",
        "file": "Padrón Electoral y Lista Nominal Edomex_31032026.csv",
        "kind": "table",
        "header_match": "ENTIDAD",
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


def _parse_table(
    rows: list[list[str]], header_match: str | None = None
) -> tuple[list[str], list[dict[str, str]]]:
    if not rows:
        return [], []
    start = 0
    if header_match:
        token = header_match.strip().lower()
        for i, r in enumerate(rows):
            if r and r[0].strip().lower() == token:
                start = i
                break
    header = rows[start]
    out = [
        {header[i]: (r[i] if i < len(r) else "") for i in range(len(header))}
        for r in rows[start + 1 :]
    ]
    return header, out


def fetch_dataset(
    key: str, *, fetch: Callable[[str], bytes] | None = None
) -> dict[str, Any]:
    if key not in DATASETS:
        raise KeyError(key)
    meta = DATASETS[key]
    # File names may contain spaces/accents → percent-encode the path segment.
    url = f"{BASE}/{quote(meta['file'])}"
    fetcher = fetch or (lambda u: get_bytes(u))
    rows = _read_rows(fetcher(url))

    if meta.get("kind") == "numbered":
        columns = list(meta["columns"])
        data = _parse_numbered(rows, columns)
    else:
        columns, data = _parse_table(rows, meta.get("header_match"))

    return {
        "key": key,
        "label": meta["label"],
        "columns": columns,
        "rows": data,
        "count": len(data),
        "source": SOURCE,
        "url": url,
    }
