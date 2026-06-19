"""Row validation + coercion with explicit discard reporting (no silent drops)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class ColumnSpec:
    name: str
    required: bool = False
    coerce: Optional[str] = None  # "number" | "int" | None


def _coerce(value, kind):
    if kind == "number":
        return float(value)
    if kind == "int":
        return int(float(value))
    return value


def validate_rows(rows, specs: list[ColumnSpec]):
    """Return (good_rows, discards). good_rows have coerced values; discards are
    {row_index, reason}. Never drops silently."""
    good, discards = [], []
    for i, row in enumerate(rows):
        try:
            out = dict(row)
            for s in specs:
                raw = row.get(s.name, "")
                if s.required and (raw is None or str(raw).strip() == ""):
                    raise ValueError(f"missing required column '{s.name}'")
                if s.coerce and str(raw).strip() != "":
                    out[s.name] = _coerce(raw, s.coerce)
            good.append(out)
        except (ValueError, TypeError) as e:
            discards.append({"row_index": i, "reason": str(e)})
    return good, discards
