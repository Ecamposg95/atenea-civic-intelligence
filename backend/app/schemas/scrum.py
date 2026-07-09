from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

SPRINT_ESTADO = "^(PLANIFICACION|ACTIVO|CERRADO)$"
WI_TIPO = "^(HISTORIA|TAREA|BUG)$"
WI_ESTADO = "^(POR_HACER|EN_CURSO|HECHO)$"
WI_PRIORIDAD = "^(ALTA|MEDIA|BAJA)$"
FIBONACCI = {1, 2, 3, 5, 8, 13, 21}


def _check_points(v: Optional[int]) -> Optional[int]:
    if v is not None and v not in FIBONACCI:
        raise ValueError("story_points must be Fibonacci: 1,2,3,5,8,13,21")
    return v


# ── Sprint ──
class SprintCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    objetivo: Optional[str] = Field(default=None, max_length=500)
    fecha_inicio: date
    fecha_fin: date
    estado: str = Field(default="PLANIFICACION", pattern=SPRINT_ESTADO)


class SprintUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=1, max_length=120)
    objetivo: Optional[str] = Field(default=None, max_length=500)
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    estado: Optional[str] = Field(default=None, pattern=SPRINT_ESTADO)


class SprintRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    nombre: str
    objetivo: Optional[str] = None
    fecha_inicio: date
    fecha_fin: date
    estado: str
    created_at: datetime


class SprintList(BaseModel):
    items: list[SprintRead]
    total: int
    limit: int
    offset: int


# ── Task ──
class TaskCreate(BaseModel):
    texto: str = Field(min_length=1, max_length=500)
    responsable_id: Optional[str] = None
    orden: int = 0


class TaskUpdate(BaseModel):
    texto: Optional[str] = Field(default=None, min_length=1, max_length=500)
    done: Optional[bool] = None
    responsable_id: Optional[str] = None
    orden: Optional[int] = None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    work_item_id: str
    texto: str
    done: bool
    orden: int
    responsable_id: Optional[str] = None
    responsable_nombre: Optional[str] = None


# ── WorkItem ──
class WorkItemCreate(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    descripcion: Optional[str] = Field(default=None, max_length=2000)
    tipo: str = Field(default="HISTORIA", pattern=WI_TIPO)
    story_points: Optional[int] = None
    prioridad: str = Field(default="MEDIA", pattern=WI_PRIORIDAD)
    orden: int = 0
    sprint_id: Optional[str] = None
    responsable_id: Optional[str] = None

    @field_validator("story_points")
    @classmethod
    def _pts(cls, v):
        return _check_points(v)


class WorkItemUpdate(BaseModel):
    titulo: Optional[str] = Field(default=None, min_length=1, max_length=255)
    descripcion: Optional[str] = Field(default=None, max_length=2000)
    tipo: Optional[str] = Field(default=None, pattern=WI_TIPO)
    story_points: Optional[int] = None
    prioridad: Optional[str] = Field(default=None, pattern=WI_PRIORIDAD)
    orden: Optional[int] = None
    sprint_id: Optional[str] = None
    responsable_id: Optional[str] = None

    @field_validator("story_points")
    @classmethod
    def _pts(cls, v):
        return _check_points(v)


class WorkItemEstadoUpdate(BaseModel):
    estado: str = Field(pattern=WI_ESTADO)


class WorkItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    titulo: str
    descripcion: Optional[str] = None
    tipo: str
    story_points: Optional[int] = None
    estado: str
    prioridad: str
    orden: int
    sprint_id: Optional[str] = None
    responsable_id: Optional[str] = None
    responsable_nombre: Optional[str] = None
    origin_acuerdo_id: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    tareas: list[TaskRead] = Field(default_factory=list)
    tareas_total: int = 0
    tareas_hechas: int = 0


class WorkItemList(BaseModel):
    items: list[WorkItemRead]
    total: int
    limit: int
    offset: int


class Board(BaseModel):
    sprint: Optional[SprintRead] = None
    POR_HACER: list[WorkItemRead] = Field(default_factory=list)
    EN_CURSO: list[WorkItemRead] = Field(default_factory=list)
    HECHO: list[WorkItemRead] = Field(default_factory=list)


# ── Metrics + ceremonias ──
class SprintMetrics(BaseModel):
    comprometido: int
    completado: int
    historias_total: int
    historias_hechas: int
    por_estado: dict[str, int]
    sin_estimar: int


class VelocidadPunto(BaseModel):
    sprint_id: str
    nombre: str
    fecha_fin: date
    velocidad: int


class BurndownDia(BaseModel):
    fecha: date
    restante: int
    ideal: int


class Burndown(BaseModel):
    total_puntos: int
    dias: list[BurndownDia]


class CeremoniaCreate(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    fecha: date
    tipo: str = Field(pattern="^(PLANNING|DAILY|REVIEW|RETRO)$")
    lugar: Optional[str] = Field(default=None, max_length=255)
    cuerpo: Optional[str] = None
