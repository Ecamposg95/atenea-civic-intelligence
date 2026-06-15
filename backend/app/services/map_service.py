"""Map / geospatial service.

Layer catalog plus tenant-scoped electoral areas serialized as a GeoJSON
FeatureCollection. On PostGIS, geometry is emitted via ``ST_AsGeoJSON``.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.electoral_area import AreaLevel, ElectoralArea


def list_layers() -> list[dict[str, Any]]:
    """Return the catalog of available map layers."""
    return [
        {
            "id": "electoral_districts",
            "name": "Electoral Districts",
            "category": "electoral",
            "geometry_type": "polygon",
            "srid": 4326,
            "visible": True,
            "description": "Administrative electoral district boundaries.",
        },
        {
            "id": "precincts",
            "name": "Voting Precincts",
            "category": "electoral",
            "geometry_type": "point",
            "srid": 4326,
            "visible": False,
            "description": "Polling locations and precinct centroids.",
        },
        {
            "id": "participation_heat",
            "name": "Participation Heatmap",
            "category": "analytics",
            "geometry_type": "raster",
            "srid": 4326,
            "visible": False,
            "description": "Civic participation density surface.",
        },
    ]


def _level_value(level: Any) -> str:
    return getattr(level, "value", level)


def list_areas_geojson(
    db: Session, organization_id: str | None, level: str | None = None
) -> dict[str, Any]:
    """Return tenant-scoped electoral areas as a GeoJSON FeatureCollection."""
    dialect = db.bind.dialect.name if db.bind is not None else ""
    features: list[dict[str, Any]] = []

    if dialect == "postgresql":
        stmt = select(
            ElectoralArea.id,
            ElectoralArea.name,
            ElectoralArea.code,
            ElectoralArea.level,
            ElectoralArea.organization_id,
            func.ST_AsGeoJSON(ElectoralArea.geometry),
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
