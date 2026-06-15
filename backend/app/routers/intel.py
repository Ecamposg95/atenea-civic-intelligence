"""External intelligence proxy — server-side fetch of public data sources.

Fetches happen server-side (no CORS), with bounded retries (in the integration
layer) + a short TTL cache here. Upstream failures surface as 502 with the
standard error envelope so the frontend can show a graceful retry.
"""

from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.dependencies import Tenant
from app.integrations.intel import ieem, worldbank
from app.integrations.intel.cache import TTLCache
from app.integrations.ine.base import IneSourceError

router = APIRouter(prefix="/intel", tags=["intel"])

CACHE = TTLCache(ttl_seconds=900.0)


@router.get("/ieem/datasets", summary="List IEEM (EdoMex) datasets")
def ieem_datasets(ctx: Tenant) -> dict[str, Any]:
    return {"items": ieem.list_datasets()}


@router.get("/ieem/{dataset}", summary="IEEM dataset (real CSV)")
def ieem_dataset(dataset: str, ctx: Tenant) -> dict[str, Any]:
    try:
        return CACHE.get_or_set(f"ieem:{dataset}", lambda: ieem.fetch_dataset(dataset))
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown dataset '{dataset}'")
    except IneSourceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"IEEM source unavailable: {exc}")


@router.get("/worldbank/indicators", summary="List World Bank indicators")
def worldbank_indicators(ctx: Tenant) -> dict[str, Any]:
    return {"items": worldbank.list_indicators()}


@router.get("/worldbank/indicator/{code}", summary="World Bank indicator series (real)")
def worldbank_indicator(code: str, ctx: Tenant) -> dict[str, Any]:
    try:
        return CACHE.get_or_set(f"wb:{code}", lambda: worldbank.fetch_indicator(code))
    except IneSourceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"World Bank source unavailable: {exc}")
