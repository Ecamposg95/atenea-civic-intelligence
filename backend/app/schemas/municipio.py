from typing import Optional

from pydantic import BaseModel


class RegionMunicipio(BaseModel):
    code: str
    name: str
    es_campana: bool
    lista_nominal_2024: Optional[int] = None
    participacion_2024: Optional[float] = None
    margen_votos_2024: Optional[int] = None
    margen_pp_2024: Optional[float] = None
    secciones_total: Optional[int] = None
    secciones_persuadibles: Optional[int] = None
    poblacion: Optional[int] = None


class MunicipioCatalogo(BaseModel):
    code: str
    name: str
    region: str


class RegionOut(BaseModel):
    region: str
    municipios: list[RegionMunicipio]
