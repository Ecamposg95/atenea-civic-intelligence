from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

MINUTA_TIPO = "^(REUNION|PLANNING|DAILY|REVIEW|RETRO|OTRO)$"
MINUTA_ESTADO = "^(BORRADOR|PUBLICADA)$"
ACUERDO_ESTADO = "^(PENDIENTE|EN_CURSO|CUMPLIDO|CANCELADO)$"


class Asistente(BaseModel):
    user_id: Optional[str] = None
    nombre: str = Field(min_length=1, max_length=255)


class AcuerdoCreate(BaseModel):
    texto: str = Field(min_length=1, max_length=2000)
    responsable_id: Optional[str] = None
    fecha_limite: Optional[date] = None
    orden: int = 0


class AcuerdoUpdate(BaseModel):
    texto: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    responsable_id: Optional[str] = None
    fecha_limite: Optional[date] = None
    orden: Optional[int] = None
    estado: Optional[str] = Field(default=None, pattern=ACUERDO_ESTADO)


class AcuerdoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    minuta_id: str
    texto: str
    orden: int
    responsable_id: Optional[str] = None
    responsable_nombre: Optional[str] = None
    fecha_limite: Optional[date] = None
    estado: str
    work_item_id: Optional[str] = None
    created_at: datetime


class AcuerdoList(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[AcuerdoRead]
    total: int
    limit: int
    offset: int


class MinutaCreate(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    fecha: date
    lugar: Optional[str] = Field(default=None, max_length=255)
    tipo: str = Field(default="REUNION", pattern=MINUTA_TIPO)
    estado: str = Field(default="BORRADOR", pattern=MINUTA_ESTADO)
    asistentes: list[Asistente] = Field(default_factory=list)
    cuerpo: Optional[str] = None
    area_id: Optional[str] = None
    acuerdos: list[AcuerdoCreate] = Field(default_factory=list)


class MinutaUpdate(BaseModel):
    titulo: Optional[str] = Field(default=None, min_length=1, max_length=255)
    fecha: Optional[date] = None
    lugar: Optional[str] = Field(default=None, max_length=255)
    tipo: Optional[str] = Field(default=None, pattern=MINUTA_TIPO)
    estado: Optional[str] = Field(default=None, pattern=MINUTA_ESTADO)
    asistentes: Optional[list[Asistente]] = None
    cuerpo: Optional[str] = None
    area_id: Optional[str] = None


class MinutaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    titulo: str
    fecha: date
    lugar: Optional[str] = None
    tipo: str
    estado: str
    asistentes: list[Asistente] = Field(default_factory=list)
    cuerpo: Optional[str] = None
    area_id: Optional[str] = None
    created_at: datetime
    created_by: Optional[str] = None
    acuerdos: list[AcuerdoRead] = Field(default_factory=list)
    acuerdos_pendientes: int = 0


class MinutaList(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[MinutaRead]
    total: int
    limit: int
    offset: int
