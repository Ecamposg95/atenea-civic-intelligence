"""Alertas — schemas del centro unificado de riesgo (sin PII ciudadana)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

Severidad = Literal["critica", "alta", "media"]


class Alerta(BaseModel):
    clave: str
    regla: str
    categoria: Literal["territorial", "operativa"]
    severidad: Severidad
    titulo: str
    detalle: str
    seccion: Optional[str] = None
    valor: Optional[float] = None
    umbral: Optional[float] = None
    enlace: str


class AlertasResumen(BaseModel):
    critica: int
    alta: int
    media: int
    territorial: int
    operativa: int
    secciones_afectadas: int
    secciones_total: int


class SeccionSeveridad(BaseModel):
    seccion: str
    severidad_max: Optional[Severidad] = None


class AlertasResponse(BaseModel):
    resumen: AlertasResumen
    secciones: list[SeccionSeveridad]
    items: list[Alerta]
    evaluado_en: datetime
