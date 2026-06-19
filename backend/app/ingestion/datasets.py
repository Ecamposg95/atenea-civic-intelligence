"""Pluggable dataset registry. Each DatasetSpec maps a file to a typed table."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from app.ingestion.readers import read_tabular
from app.ingestion.validation import ColumnSpec
from app.models.census import CensusMetric


@dataclass
class DatasetSpec:
    key: str
    model: type
    columns: list[ColumnSpec]
    row_mapper: Callable          # (row, ctx, run, extra, db=None) -> dict of model kwargs
    scope_filter: Callable = field(default=lambda model, ctx, extra: [])  # for --replace
    reader: Callable = field(default=lambda path, extra: read_tabular(path))  # (path, extra) -> (rows, header)


def _census_mapper(row, ctx, run, extra, db=None):
    # Fix 3: actionable error when 'anio' is absent rather than an opaque TypeError
    if extra.get("anio") in (None, ""):
        raise ValueError("census dataset requires 'anio' in extra")
    return dict(
        organization_id=ctx.organization_id,
        ingest_run_id=run.id,
        anio=int(extra.get("anio")),
        nivel=row["nivel"],
        territory_code=str(row["clave"]),
        indicador=row["indicador"],
        valor=row["valor"],
    )


def _census_scope(model, ctx, extra):
    # Fix 3: guard anio here too — scope runs on the replace path before any mapper
    if extra.get("anio") in (None, ""):
        raise ValueError("census dataset requires 'anio' in extra")
    org_clause = (
        model.organization_id.is_(None)
        if ctx.organization_id is None
        else model.organization_id == ctx.organization_id
    )
    return [org_clause, model.anio == int(extra.get("anio"))]


DATASETS: dict[str, DatasetSpec] = {
    "census": DatasetSpec(
        key="census",
        model=CensusMetric,
        columns=[
            ColumnSpec("nivel", required=True),
            ColumnSpec("clave", required=True),
            ColumnSpec("indicador", required=True),
            ColumnSpec("valor", required=True, coerce="number"),
        ],
        row_mapper=_census_mapper,
        scope_filter=_census_scope,
    ),
}
