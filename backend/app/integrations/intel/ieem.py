"""IEEM (Instituto Electoral del Estado de México) Numeralia — real CSV datasets.

Files are stable CSV downloads (no token, no API). We fetch bytes server-side
(avoids CORS) and parse with the stdlib csv module. Add datasets here as their
exact file names are confirmed from the numeralia sub-pages.
"""

from __future__ import annotations

import csv
import io
from typing import Any, Callable

from app.integrations.ine.base import get_bytes

BASE = "https://dorganizacion.ieem.org.mx/numeralia/docs"
SOURCE = "IEEM Numeralia — Registro Federal de Electores (Estado de México)"

# key -> (label, filename). Confirmed: municipios. Others to confirm at impl time
# by reading the sub-pages; municipios is the verified working case.
DATASETS: dict[str, dict[str, str]] = {
    "municipios": {"label": "Catálogo de municipios", "file": "Municipios_EdoMex_2025.csv"},
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


def _parse_csv(raw: bytes) -> tuple[list[str], list[dict[str, str]]]:
    text = _decode(raw)  # handle BOM + non-UTF-8 (Windows-1252) encodings
    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader if any(cell.strip() for cell in r)]
    if not rows:
        return [], []
    header = [h.strip() for h in rows[0]]
    out: list[dict[str, str]] = []
    for r in rows[1:]:
        out.append({header[i]: (r[i].strip() if i < len(r) else "") for i in range(len(header))})
    return header, out


def fetch_dataset(
    key: str, *, fetch: Callable[[str], bytes] | None = None
) -> dict[str, Any]:
    if key not in DATASETS:
        raise KeyError(key)
    meta = DATASETS[key]
    url = f"{BASE}/{meta['file']}"
    fetcher = fetch or (lambda u: get_bytes(u))
    columns, rows = _parse_csv(fetcher(url))
    return {
        "key": key,
        "label": meta["label"],
        "columns": columns,
        "rows": rows,
        "count": len(rows),
        "source": SOURCE,
        "url": url,
    }
