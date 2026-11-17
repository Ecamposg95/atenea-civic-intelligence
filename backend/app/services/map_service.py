"""Map / geospatial service.

Tenant-scoped electoral areas serialized as a GeoJSON FeatureCollection.
On PostGIS, geometry is emitted via ``ST_AsGeoJSON``.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.electoral_area import AreaLevel, ElectoralArea


def _level_value(level: Any) -> str:
    return getattr(level, "value", level)


def list_areas_geojson(
    db: Session,
    organization_id: str | None,
    level: str | None = None,
    simplify: float = 0.0,
) -> dict[str, Any]:
    """Return tenant-scoped electoral areas as a GeoJSON FeatureCollection.

    ``simplify`` > 0 applies ``ST_SimplifyPreserveTopology`` (tolerance in SRID
    4326 degrees) to shrink the payload (e.g. the ~1854-municipio layer). Output
    coordinates are emitted at 5 decimals (~1 m) regardless. ``ST_CollectionExtract``
    first normalizes any GeometryCollection to a MultiPolygon so simplification
    never fails on mixed geometries.
    """
    dialect = db.bind.dialect.name if db.bind is not None else ""
    features: list[dict[str, Any]] = []

    if dialect == "postgresql":
        geom = ElectoralArea.geometry
        if simplify and simplify > 0:
            geom = func.ST_SimplifyPreserveTopology(
                func.ST_CollectionExtract(ElectoralArea.geometry, 3), simplify
            )
        stmt = select(
            ElectoralArea.id,
            ElectoralArea.name,
            ElectoralArea.code,
            ElectoralArea.level,
            ElectoralArea.organization_id,
            func.ST_AsGeoJSON(geom, 5),
        ).where(ElectoralArea.deleted_at.is_(None))
        if organization_id is not None:
            stmt = stmt.where(ElectoralArea.organization_id == organization_id)
        if level:
            try:
                stmt = stmt.where(ElectoralArea.level == AreaLevel(level))
            except ValueError:
                pass  # unknown level → no filter
        for id_, name, code, level, org_id, geojson in db.execute(stmt).all():
            features.append(
                {
                    "type": "Feature",
                    "geometry": json.loads(geojson) if geojson else None,
                    "properties": {
                        "id": id_,
                        "name": name,
                        "code": code,
                        "level": _level_value(level),
                        "organization_id": org_id,
                    },
                }
            )
    else:
        stmt = select(ElectoralArea).where(ElectoralArea.deleted_at.is_(None))
        if organization_id is not None:
            stmt = stmt.where(ElectoralArea.organization_id == organization_id)
        if level:
            try:
                stmt = stmt.where(ElectoralArea.level == AreaLevel(level))
            except ValueError:
                pass  # unknown level → no filter
        for area in db.execute(stmt).scalars().all():
            features.append(
                {
                    "type": "Feature",
                    "geometry": None,
                    "properties": {
                        "id": area.id,
                        "name": area.name,
                        "code": area.code,
                        "level": _level_value(area.level),
                        "organization_id": area.organization_id,
                    },
                }
            )

    return {"type": "FeatureCollection", "features": features}
