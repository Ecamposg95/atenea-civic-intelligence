"""Captura de hojas SMA (spec 2026-11-17 §5) — request/response schemas.

Field-level validation is deliberately lenient here: the paper rules (§4) are
evaluated by the service so every row gets its own error/aviso messages instead
of a single opaque 422 from pydantic.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

TipoHoja = Literal["LIDER", "FAMILIA"]
TipoPersona = Literal["LIDER", "ACTIVISTA"]


class PersonaIn(BaseModel):
    apellido_paterno: Optional[str] = Field(default=None, max_length=120)
    apellido_materno: Optional[str] = Field(default=None, max_length=120)
    nombres: Optional[str] = Field(default=None, max_length=120)
    seccion: Optional[str] = Field(default=None, max_length=20)
    calle: Optional[str] = Field(default=None, max_length=255)
    numero: Optional[str] = Field(default=None, max_length=20)
    colonia: Optional[str] = Field(default=None, max_length=255)
    clave_elector: Optional[str] = Field(default=None, max_length=40)
    curp: Optional[str] = Field(default=None, max_length=40)
    telefono: Optional[str] = Field(default=None, max_length=40)


class TitularIn(PersonaIn):
    """Either ``{"id": ...}`` (existing person) or a new person's fields.
    ``padre_id`` (the líder) applies only to a new titular on a FAMILIA sheet."""
    id: Optional[str] = Field(default=None, max_length=36)
    padre_id: Optional[str] = Field(default=None, max_length=36)


class HojaIn(BaseModel):
    tipo_hoja: TipoHoja
    dry_run: bool = True
    titular: TitularIn
    filas: list[PersonaIn] = Field(default_factory=list, max_length=10)


class FilaResultado(BaseModel):
    index: Optional[int] = None          # position in ``filas``; None for the titular
    estado: Literal["ok", "aviso", "error"]
    mensajes: list[str] = Field(default_factory=list)
    id: Optional[str] = None             # registro id (existing titular, or created on commit)


class HojaOut(BaseModel):
    ok: bool
    titular: FilaResultado
    filas: list[FilaResultado]
    creados: int = 0
    hoja_id: Optional[str] = None        # set only when committed


class SeccionCatalogo(BaseModel):
    seccion: str
    barrio: str
    region: str
    prioridad: str


class CatalogoOut(BaseModel):
    secciones: list[SeccionCatalogo]
    barrios: list[str]


class PersonaOut(BaseModel):
    id: str
    tipo: Optional[str] = None
    nombre_completo: str
    seccion: Optional[str] = None
    telefono: Optional[str] = None
    padre_id: Optional[str] = None
    padre_nombre: Optional[str] = None
    hijos: int = 0


class HojaResumen(BaseModel):
    hoja_id: str
    tipo_hoja: str
    titular_id: Optional[str] = None
    titular_nombre: Optional[str] = None
    titular_nuevo: bool = False
    filas: int
    created_at: datetime


# ── Estructura del papel (Líder → Activistas → Promovidos) ──────────────────
# Never carries clave/CURP — names, sección and counts only.

class EstructuraPersona(BaseModel):
    id: str
    nombre_completo: str
    seccion: Optional[str] = None


class EstructuraActivista(EstructuraPersona):
    promovidos: list[EstructuraPersona] = Field(default_factory=list)


class EstructuraLider(EstructuraPersona):
    activistas: list[EstructuraActivista] = Field(default_factory=list)
    total_promovidos: int = 0
    familias_completas: int = 0      # activistas with ≥ meta_promovidos


class EstructuraResumen(BaseModel):
    lideres: int = 0
    activistas: int = 0
    promovidos: int = 0
    familias_completas: int = 0
    lideres_completos: int = 0       # líderes with ≥ meta_activistas


class EstructuraPage(BaseModel):
    items: list[EstructuraLider]
    total: int                       # líderes matching the filters
    limit: int
    offset: int
    meta_activistas: int
    meta_promovidos: int
    resumen: EstructuraResumen       # over ALL líderes matching the filters
