from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PromovidoRead(BaseModel):
    id: str
    nombre_completo: str
    created_at: Optional[datetime] = None
    seccion: Optional[str] = None
    colonia: Optional[str] = None
    telefono: Optional[str] = None
    edad: Optional[int] = None
    estructura: Optional[str] = None
    promotor: Optional[str] = None
    clave_masked: Optional[str] = None
    # electoral context (from SeccionElectoral, may be null)
    participacion: Optional[float] = None
    margen: Optional[int] = None
    prioridad: Optional[str] = None


class PromovidoList(BaseModel):
    items: list[PromovidoRead]
    total: int
    limit: int
    offset: int
    has_territory: bool
