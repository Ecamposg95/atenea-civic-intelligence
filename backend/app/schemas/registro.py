"""Registro API schemas (Pydantic v2)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.user import UserRole


def _validate_clave(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return None
    cleaned = v.strip().upper()
    if len(cleaned) != 18 or not cleaned.isalnum():
        raise ValueError("clave de elector must be 18 alphanumeric characters")
    return cleaned


def _validate_sexo(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return None
    cleaned = v.strip().upper()
    if cleaned not in ("M", "F"):
        raise ValueError("sexo must be 'M' or 'F'")
    return cleaned


class RegistroCreate(BaseModel):
    nombre_completo: str = Field(min_length=2, max_length=255)
    seccion: Optional[str] = Field(default=None, max_length=20)
    direccion: Optional[str] = Field(default=None, max_length=500)
    colonia: Optional[str] = Field(default=None, max_length=255)
    telefono: Optional[str] = Field(default=None, max_length=40)
    area: Optional[str] = Field(default=None, max_length=120)
    sexo: Optional[str] = Field(default=None)
    edad: Optional[int] = Field(default=None, ge=0, le=120)
    estructura: Optional[str] = Field(default=None, max_length=120)
    promotor: Optional[str] = Field(default=None, max_length=160)
    observacion: Optional[str] = Field(default=None, max_length=1000)
    clave_elector: Optional[str] = Field(default=None)
    consentimiento: bool
    client_uuid: Optional[str] = Field(default=None, max_length=64)
    lat: Optional[float] = None
    lng: Optional[float] = None

    @field_validator("clave_elector")
    @classmethod
    def _clave(cls, v):
        return _validate_clave(v)

    @field_validator("sexo")
    @classmethod
    def _sexo(cls, v):
        return _validate_sexo(v)


class RegistroUpdate(BaseModel):
    nombre_completo: Optional[str] = Field(default=None, min_length=2, max_length=255)
    seccion: Optional[str] = Field(default=None, max_length=20)
    direccion: Optional[str] = Field(default=None, max_length=500)
    colonia: Optional[str] = Field(default=None, max_length=255)
    telefono: Optional[str] = Field(default=None, max_length=40)
    area: Optional[str] = Field(default=None, max_length=120)
    sexo: Optional[str] = Field(default=None)
    edad: Optional[int] = Field(default=None, ge=0, le=120)
    estructura: Optional[str] = Field(default=None, max_length=120)
    observacion: Optional[str] = Field(default=None, max_length=1000)
    clave_elector: Optional[str] = Field(default=None)
    consentimiento: Optional[bool] = None

    @field_validator("clave_elector")
    @classmethod
    def _clave(cls, v):
        return _validate_clave(v)

    @field_validator("sexo")
    @classmethod
    def _sexo(cls, v):
        return _validate_sexo(v)


class RegistroRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    campaign_id: str
    activista_id: Optional[str]
    nombre_completo: str
    seccion: Optional[str]
    direccion: Optional[str]
    colonia: Optional[str]
    telefono: Optional[str]
    area: Optional[str]
    sexo: Optional[str]
    edad: Optional[int]
    estructura: Optional[str]
    observacion: Optional[str]
    promotor: Optional[str] = None
    activista_nombre: Optional[str] = None
    clave_masked: Optional[str]
    consentimiento: bool
    consentimiento_at: Optional[datetime]
    created_at: datetime


class RegistroList(BaseModel):
    items: list[RegistroRead]
    total: int
    limit: int
    offset: int


class PerfilRead(BaseModel):
    id: str
    full_name: str
    role: UserRole
    seccion: Optional[str]
    lider_id: Optional[str]
    lider_nombre: Optional[str]
    organization_id: Optional[str]
    area: Optional[dict] = None   # {"id","nombre","nivel"} | None
