"""File readers. CSV (encoding autodetect) + Excel (lazy openpyxl)."""
from __future__ import annotations

import csv
from pathlib import Path


def _decode(path: Path) -> str:
    raw = Path(path).read_bytes()
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace")


def read_csv(path) -> tuple[list[dict], list[str]]:
    text = _decode(Path(path))
    reader = csv.DictReader(text.splitlines())
    header = list(reader.fieldnames or [])
    return list(reader), header


def read_excel(path) -> tuple[list[dict], list[str]]:
    import openpyxl  # lazy: only needed for .xlsx
    wb = openpyxl.load_workbook(Path(path), read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    header = [str(c) if c is not None else "" for c in next(rows_iter)]
    out = []
    for r in rows_iter:
        out.append({header[i]: ("" if v is None else str(v)) for i, v in enumerate(r) if i < len(header)})
    return out, header


def read_tabular(path) -> tuple[list[dict], list[str]]:
    p = Path(path)
    if p.suffix.lower() in (".xlsx", ".xlsm"):
        return read_excel(p)
    return read_csv(p)
