from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

ESTADO_PATTERN = "^(PENDIENTE|EN_PROCESO|ATENDIDO|CERRADO)$"
TIPO_PATTERN = "^(PETICION|QUEJA|APOYO|OTRO)$"
CANAL_PATTERN = "^(INTERNO|PUBLICO|AMBOS)$"
EVENTO_TIPO_PATTERN = "^(NOTA|EVIDENCIA)$"


class FormDefinitionCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=160)
    descripcion: Optional[str] = Field(default=None, max_length=1000)
    tipo: str = Field(pattern=TIPO_PATTERN)
    slug: str = Field(min_length=2, max_length=120)
    canal: str = Field(pattern=CANAL_PATTERN)
    schema: dict
    is_active: bool = True


class FormDefinitionRead(BaseModel):
    id: str
    nombre: str
    descripcion: Optional[str] = None
    tipo: str
    slug: str
    canal: str
    schema: dict
    is_active: bool
    version: int
    created_at: datetime


class FormDefinitionList(BaseModel):
    items: list[FormDefinitionRead]
    total: int
    limit: int
    offset: int


class FormResponseCreate(BaseModel):
    form_definition_id: str
    answers: dict
    nombre_emisor: Optional[str] = Field(default=None, max_length=255)
    contacto: Optional[str] = Field(default=None, max_length=160)
    seccion: Optional[str] = Field(default=None, max_length=20)
    evidencia_keys: Optional[list[str]] = None
    client_uuid: Optional[str] = Field(default=None, max_length=64)


class FormResponseRead(BaseModel):
    id: str
    caso_id: Optional[str] = None
    moderacion: str
    created_at: datetime


class CasoRead(BaseModel):
    id: str
    folio: str
    tipo: str
    titulo: str
    descripcion: Optional[str] = None
    ciudadano_nombre: Optional[str] = None
    contacto_masked: Optional[str] = None
    seccion: Optional[str] = None
    colonia: Optional[str] = None
    estado: str
    prioridad: str
    fecha_compromiso: Optional[date] = None
    asignado_a: Optional[str] = None
    asignado_nombre: Optional[str] = None
    channel: str
    moderacion: str
    created_at: datetime


class CasoList(BaseModel):
    items: list[CasoRead]
    total: int
    limit: int
    offset: int
    has_territory: bool = True


class CasoEstadoUpdate(BaseModel):
    estado: str = Field(pattern=ESTADO_PATTERN)
    nota: Optional[str] = Field(default=None, max_length=1000)


class CasoAsignarUpdate(BaseModel):
    asignado_a: str
    nota: Optional[str] = Field(default=None, max_length=1000)


class CasoEventoCreate(BaseModel):
    tipo: str = Field(pattern=EVENTO_TIPO_PATTERN)
    texto: Optional[str] = Field(default=None, max_length=2000)
    evidencia_key: Optional[str] = Field(default=None, max_length=500)


class CasoEventoRead(BaseModel):
    id: str
    caso_id: str
    tipo: str
    texto: Optional[str] = None
    evidencia_url: Optional[str] = None
    actor_nombre: Optional[str] = None
    created_at: datetime


class PanoramaKpis(BaseModel):
    total: int
    pendientes: int
    en_proceso: int
    atendidos: int
    cerrados: int
    sla_vencidos: int
    tiempo_prom_dias: Optional[float] = None


class PanoramaPorColonia(BaseModel):
    colonia: str
    casos: int


class PanoramaPorResponsable(BaseModel):
    asignado_a: Optional[str] = None
    nombre: str
    casos: int
    pendientes: int = 0


class CasoPanorama(BaseModel):
    kpis: PanoramaKpis
    por_estado: dict
    por_colonia: list[PanoramaPorColonia]
    por_responsable: list[PanoramaPorResponsable]
