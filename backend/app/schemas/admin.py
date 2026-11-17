"""Admin console schemas (Pydantic v2).

SECURITY: AdminRegistroRead deliberately omits clave_elector_enc and any plain
clave — only clave_masked is exposed. The reveal endpoint lives in the router
and returns RevelarClaveResponse after an audited DB call.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AdminRegistroRead(BaseModel):
    """A registro row as returned by the admin listing endpoint.

    No from_attributes: admin_service returns dicts directly.
    """
    id: str
    organization_id: Optional[str]
    organization_name: Optional[str]  # base column — None only if org deleted
    campaign_id: str
    activista_id: Optional[str]
    activista_nombre: Optional[str]
    lider_id: Optional[str]
    lider_nombre: Optional[str]
    nombre_completo: str
    seccion: Optional[str]
    colonia: Optional[str]
    area: Optional[str]
    telefono: Optional[str]
    clave_masked: Optional[str]
    consentimiento: bool
    consentimiento_at: Optional[datetime]
    created_at: datetime


class AdminRegistroList(BaseModel):
    items: list[AdminRegistroRead]
    total: int
    limit: int
    offset: int


class MetricBucket(BaseModel):
    label: str
    count: int


class DailyPoint(BaseModel):
    date: str  # ISO date string e.g. "2027-03-01"
    count: int


class MetricsRead(BaseModel):
    total: int
    by_seccion: list[MetricBucket]
    by_activista: list[MetricBucket]
    by_lider: list[MetricBucket]
    by_day: list[DailyPoint]


class EstructuraActivista(BaseModel):
    id: str
    full_name: str
    email: str
    seccion: Optional[str]
    count: int  # registros captured


class EstructuraNode(BaseModel):
    id: str
    full_name: str
    email: str
    seccion: Optional[str]
    total: int  # rollup: sum of activistas' counts + líder's own captured registros
    activistas: list[EstructuraActivista]


class RevelarClaveResponse(BaseModel):
    registro_id: str
    clave_elector: str  # decrypted — never logged, never cached
    curp: Optional[str] = None  # decrypted CURP when stored (audited registro.reveal_curp)


class RevelarClavesRequest(BaseModel):
    registro_ids: list[str] = Field(min_length=1, max_length=500)


class RevelarClavesResponse(BaseModel):
    claves: dict[str, str]  # registro_id -> clave_elector (decrypted); missing/no-clave ids omitted
