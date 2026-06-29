"""ARCO request schemas (Pydantic v2)."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.arco import ArcoEstado, ArcoTipo

# Pattern that identifies a full 18-character alphanumeric clave de elector.
_FULL_CLAVE_RE = re.compile(r"^[A-Za-z0-9]{18}$")


class ArcoRequestCreate(BaseModel):
    """Body for POST /api/arco/solicitudes."""

    registro_id: str = Field(min_length=1, max_length=36)
    tipo: ArcoTipo
    motivo: Optional[str] = Field(default=None, max_length=1000)
    # titular_ref: short opaque token — must NOT be a full 18-char clave.
    titular_ref: Optional[str] = Field(default=None, max_length=12)

    @field_validator("titular_ref")
    @classmethod
    def _no_full_clave(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if _FULL_CLAVE_RE.match(v):
            raise ValueError(
                "titular_ref must not contain a full 18-character clave de elector"
            )
        return v


class EjecutarRequest(BaseModel):
    """Optional body for POST /api/arco/solicitudes/{id}/ejecutar.

    Normally the registro_ids are resolved from the ArcoRequest itself.
    This body is intentionally empty but kept as a schema anchor for future
    extension (e.g. confirmar=True safety gate).
    """

    pass


class ArcoRequestRead(BaseModel):
    """Response schema for ArcoRequest — holds NO PII."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: Optional[str]
    campaign_id: Optional[str]
    registro_id: str
    titular_ref: Optional[str]
    tipo: ArcoTipo
    estado: ArcoEstado
    motivo: Optional[str]
    requested_by: Optional[str]
    processed_by: Optional[str]
    requested_at: datetime
    processed_at: Optional[datetime]


class ArcoEjecutarResponse(BaseModel):
    """Response for POST /api/arco/solicitudes/{id}/ejecutar."""

    request_id: str
    deleted: int
    estado: ArcoEstado
