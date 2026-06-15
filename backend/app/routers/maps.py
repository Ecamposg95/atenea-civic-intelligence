"""Maps router — layer catalog, tenant-scoped GeoJSON areas, and WMS layers."""

from typing import Any

from fastapi import APIRouter, Query

from app.dependencies import DbSession, Tenant
from app.integrations.ine import cartografia
from app.services import map_service

router = APIRouter(prefix="/maps", tags=["maps"])


@router.get("/layers", summary="List available map layers")
def list_layers() -> dict[str, Any]:
    """Return the catalog of map layers available to the explorer."""
    return {"layers": map_service.list_layers()}


@router.get("/areas", summary="Electoral areas as GeoJSON")
def list_areas(
    db: DbSession,
    ctx: Tenant,
    level: str | None = Query(
        None, description="Filter by level (e.g. state, district)"
    ),
) -> dict[str, Any]:
    """Return tenant-scoped electoral areas as a GeoJSON FeatureCollection."""
    return map_service.list_areas_geojson(db, ctx.organization_id, level)


@router.get("/wms-layers", summary="INE SIGE WMS layers for the basemap")
def wms_layers(ctx: Tenant) -> dict[str, Any]:
    """Return MapLibre-ready SIGE WMS layer descriptors (empty if unconfigured)."""
    return {"configured": cartografia.wms_configured(), "layers": cartografia.wms_layers()}
