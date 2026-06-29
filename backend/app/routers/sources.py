"""External data sources router — consume INE data through Ágora's API.

All endpoints require authentication. They surface *reference* data (public
catalogs, geography) rather than tenant business records, so they are not
tenant-filtered; ingestion into tenant tables happens via the CLI / services.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import Tenant, require_roles
from app.models.user import UserRole
from app.integrations.ine import candidaturas, cartografia, ckan, padron
from app.integrations.ine.base import IneSourceError
from app.integrations.ine.config import SOURCES
from app.schemas.sources import (
    CandidaturasResponse,
    DatasetSummary,
    SourceInfo,
)

# Sources: admin-and-analyst only (ingest governance; not for general viewers).
_SOURCES_ROLES = Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST))

router = APIRouter(prefix="/sources", tags=["sources"], dependencies=[_SOURCES_ROLES])


def _guard(exc: IneSourceError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Upstream INE source error: {exc}",
    )


@router.get("", response_model=list[SourceInfo], summary="List consumable INE sources")
def list_sources(ctx: Tenant) -> list[SourceInfo]:
    """Return the registry of configured INE data sources."""
    return [SourceInfo(**vars(s)) for s in SOURCES]


@router.get(
    "/datasets",
    response_model=list[DatasetSummary],
    summary="Search datos.gob.mx (CKAN) datasets",
)
def search_datasets(
    ctx: Tenant,
    q: str = Query("", description="Free-text query"),
    rows: int = Query(20, ge=1, le=100),
    ine_only: bool = Query(True, description="Restrict to INE-published datasets"),
) -> list[DatasetSummary]:
    """Proxy CKAN ``package_search`` and condense results."""
    try:
        result = (
            ckan.search_ine_datasets(q, rows=rows)
            if ine_only
            else ckan.package_search(q, rows=rows)
        )
    except IneSourceError as exc:
        raise _guard(exc) from exc

    summaries: list[DatasetSummary] = []
    for ds in result.get("results", []):
        formats = sorted(
            {r.get("format", "").upper() for r in ds.get("resources", []) if r.get("format")}
        )
        summaries.append(
            DatasetSummary(
                id=ds.get("id", ds.get("name", "")),
                title=ds.get("title", ds.get("name", "")),
                organization=(ds.get("organization") or {}).get("title")
                if isinstance(ds.get("organization"), dict)
                else None,
                formats=formats,
                url=next(
                    (r.get("url") for r in ds.get("resources", []) if r.get("url")), None
                ),
            )
        )
    return summaries


@router.get("/padron/resources", summary="Padrón / Lista Nominal downloadable resources")
def padron_resources(ctx: Tenant) -> dict[str, Any]:
    """List downloadable Padrón Electoral / Lista Nominal resources from CKAN."""
    try:
        return {"resources": padron.latest_lista_nominal_resources()}
    except IneSourceError as exc:
        raise _guard(exc) from exc


@router.get(
    "/candidaturas/{collection}",
    response_model=CandidaturasResponse,
    summary="Candidaturas MX (Popolo) collection",
)
def candidaturas_collection(ctx: Tenant, collection: str) -> CandidaturasResponse:
    """Proxy a Candidaturas MX collection: persons, organizations, areas, posts."""
    dispatch = {
        "persons": candidaturas.list_persons,
        "personas": candidaturas.list_persons,
        "organizations": candidaturas.list_organizations,
        "organizaciones": candidaturas.list_organizations,
        "areas": candidaturas.list_areas,
        "posts": candidaturas.list_posts,
        "cargos": candidaturas.list_posts,
    }
    fn = dispatch.get(collection.lower())
    if fn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown collection '{collection}'. Try: {sorted(dispatch)}",
        )
    try:
        return CandidaturasResponse(data=fn())
    except IneSourceError as exc:
        raise _guard(exc) from exc


@router.get(
    "/cartografia/wms-layers",
    summary="SIGE WMS layer descriptors (alias of /maps/wms-layers)",
)
def cartografia_wms(ctx: Tenant) -> dict[str, Any]:
    """Return SIGE WMS layer descriptors for the map (empty if unconfigured)."""
    return {"configured": cartografia.wms_configured(), "layers": cartografia.wms_layers()}
