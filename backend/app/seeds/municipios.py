"""Registro estático de municipios con datos sembrados (territorio + inteligencia).

Semántica de la matriz seccional (``SeccionElectoral``): ``coalicion`` = bloque PROPIO de la
campaña, ``morena`` = bloque RIVAL, ``margen = coalicion - morena``. Las etiquetas visibles
salen de aquí, no del nombre de la columna. La región es una constante de agrupación para
el selector/comparación del panorama; no es una entidad.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

_BASE = Path(__file__).parent / "municipios"


@dataclass(frozen=True)
class MunicipioConfig:
    code: str
    name: str
    region: str
    bloque_propio: str
    bloque_rival: str
    folio_prefix: str
    extra_secciones: tuple[str, ...] = ()

    @property
    def data_dir(self) -> Path:
        return _BASE / self.code


REGIONES: dict[str, str] = {"toluca": "Valle de Toluca"}

MUNICIPIOS: dict[str, MunicipioConfig] = {m.code: m for m in (
    MunicipioConfig("15076", "San Mateo Atenco", "toluca", "Coalición", "Morena", "SMA", ("4127",)),
)}


def config_de(code: Optional[str]) -> Optional[MunicipioConfig]:
    return MUNICIPIOS.get(code or "")


def municipios_de_region(region: str) -> list[MunicipioConfig]:
    """Municipios de la región, en orden de inserción del registro."""
    return [m for m in MUNICIPIOS.values() if m.region == region]
