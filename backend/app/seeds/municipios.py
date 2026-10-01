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


REGIONES: dict[str, str] = {"atizapan": "Atizapán y periferia", "toluca": "Valle de Toluca"}

_ATZ = dict(region="atizapan", bloque_propio="Morena-PVEM-PT", bloque_rival="PAN-PRI-PRD")

MUNICIPIOS: dict[str, MunicipioConfig] = {m.code: m for m in (
    MunicipioConfig("15076", "San Mateo Atenco", "toluca", "Coalición", "Morena", "SMA", ("4127",)),
    MunicipioConfig("15013", "Atizapán de Zaragoza", folio_prefix="ATZ", **_ATZ),
    MunicipioConfig("15104", "Tlalnepantla de Baz", folio_prefix="TLA", **_ATZ),
    MunicipioConfig("15057", "Naucalpan de Juárez", folio_prefix="NAU", **_ATZ),
    MunicipioConfig("15060", "Nicolás Romero", folio_prefix="NRO", **_ATZ),
    MunicipioConfig("15121", "Cuautitlán Izcalli", folio_prefix="CIZ", **_ATZ),
    MunicipioConfig("15038", "Isidro Fabela", folio_prefix="IFA", **_ATZ),
    MunicipioConfig("15046", "Jilotzingo", folio_prefix="JIL", **_ATZ),
)}


def config_de(code: Optional[str]) -> Optional[MunicipioConfig]:
    return MUNICIPIOS.get(code or "")


def municipios_de_region(region: str) -> list[MunicipioConfig]:
    """Orden de inserción del registro (Atizapán primero en su región)."""
    return [m for m in MUNICIPIOS.values() if m.region == region]
