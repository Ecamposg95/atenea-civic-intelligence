"""Pluggable dataset registry. Each DatasetSpec maps a file to a typed table."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Callable

from sqlalchemy import func

from app.ingestion.geo_readers import read_features
from app.ingestion.readers import read_tabular
from app.ingestion.validation import ColumnSpec
from app.models.census import CensusMetric
from app.models.electoral_area import ElectoralArea, AreaLevel
from app.models.election_result import ElectionResult
from app.models.socio import SocioMetric


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


def _geo_reader(path, extra):
    return read_features(
        path,
        name_prop=extra.get("name_prop", "name"),
        code_prop=extra.get("code_prop", "code"),
        parent_prop=extra.get("parent_prop"),
    )


def _geometria_mapper(row, ctx, run, extra, db=None):
    geom = row.get("geometry")
    dialect = db.get_bind().dialect.name if db is not None else "sqlite"
    if dialect == "postgresql" and geom:
        geometry = func.ST_SetSRID(func.ST_GeomFromGeoJSON(json.dumps(geom)), 4326)
    else:
        geometry = json.dumps(geom) if geom else None
    return dict(
        organization_id=None,
        ingest_run_id=run.id,
        level=AreaLevel(extra["level"]),
        name=row.get("name") or "",
        code=row.get("code") or None,
        geometry=geometry,
    )


def _geometria_scope(model, ctx, extra):
    return [model.organization_id.is_(None), model.level == AreaLevel(extra["level"])]


def _resultados_mapper(row, ctx, run, extra, db=None):
    if extra.get("anio") in (None, ""):
        raise ValueError("resultados dataset requires 'anio' in extra")
    if extra.get("eleccion") in (None, ""):
        raise ValueError("resultados dataset requires 'eleccion' in extra")
    return dict(
        organization_id=ctx.organization_id,
        ingest_run_id=run.id,
        anio=int(extra["anio"]),
        nivel=row["nivel"],
        territory_code=str(row["clave"]),
        eleccion=str(extra["eleccion"]),
        partido=str(row["partido"]),
        votos=row["votos"],
    )


def _resultados_scope(model, ctx, extra):
    if extra.get("anio") in (None, "") or extra.get("eleccion") in (None, ""):
        raise ValueError("resultados --replace requires 'anio' and 'eleccion'")
    org_clause = (model.organization_id.is_(None) if ctx.organization_id is None
                  else model.organization_id == ctx.organization_id)
    clauses = [org_clause, model.anio == int(extra["anio"]),
               model.eleccion == str(extra["eleccion"])]
    if extra.get("nivel"):
        clauses.append(model.nivel == str(extra["nivel"]))
    return clauses


def _socio_mapper(row, ctx, run, extra, db=None):
    if extra.get("anio") in (None, ""):
        raise ValueError("socio dataset requires 'anio' in extra")
    return dict(
        organization_id=ctx.organization_id,
        ingest_run_id=run.id,
        anio=int(extra["anio"]),
        nivel=row["nivel"],
        territory_code=str(row["clave"]),
        indicador=row["indicador"],
        valor=row["valor"],
    )


def _socio_scope(model, ctx, extra):
    if extra.get("anio") in (None, ""):
        raise ValueError("socio --replace requires 'anio'")
    org_clause = (model.organization_id.is_(None) if ctx.organization_id is None
                  else model.organization_id == ctx.organization_id)
    clauses = [org_clause, model.anio == int(extra["anio"])]
    if extra.get("nivel"):
        clauses.append(model.nivel == str(extra["nivel"]))
    return clauses


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

DATASETS["resultados"] = DatasetSpec(
    key="resultados",
    model=ElectionResult,
    columns=[
        ColumnSpec("nivel", required=True),
        ColumnSpec("clave", required=True),
        ColumnSpec("partido", required=True),
        ColumnSpec("votos", required=True, coerce="number"),
    ],
    row_mapper=_resultados_mapper,
    scope_filter=_resultados_scope,
)

DATASETS["socio"] = DatasetSpec(
    key="socio",
    model=SocioMetric,
    columns=[
        ColumnSpec("nivel", required=True),
        ColumnSpec("clave", required=True),
        ColumnSpec("indicador", required=True),
        ColumnSpec("valor", required=True, coerce="number"),
    ],
    row_mapper=_socio_mapper,
    scope_filter=_socio_scope,
)

DATASETS["geometria"] = DatasetSpec(
    key="geometria",
    model=ElectoralArea,
    columns=[ColumnSpec("code", required=True)],
    row_mapper=_geometria_mapper,
    scope_filter=_geometria_scope,
    reader=_geo_reader,
)
