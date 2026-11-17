"""Configuration and source registry for INE México integrations.

Base URLs are overridable via environment variables so deployments can point at
mirrors or updated endpoints without code changes. Defaults reflect the public
endpoints discovered as of 2026-06.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from app.models.electoral_area import AreaLevel

# --- Base URLs --------------------------------------------------------------
# datos.gob.mx CKAN action API (legacy platform, still live in 2026; the newer
# "Ajolote" platform exposes no public API).
CKAN_BASE_URL = os.getenv("INE_CKAN_BASE_URL", "https://datos.gob.mx/api/3/action")

# SocialTIC "Candidaturas MX" — open Popolo-standard electoral API (no auth).
CANDIDATURAS_BASE_URL = os.getenv("INE_CANDIDATURAS_BASE_URL", "https://www.apielectoral.mx")

# SIGE / Marco Geográfico Electoral. The WMS endpoint must be confirmed against
# the live GetCapabilities; left blank until configured.
SIGE_WMS_URL = os.getenv("INE_SIGE_WMS_URL", "")
SIGE_PORTAL_URL = os.getenv("INE_SIGE_PORTAL_URL", "https://cartografia.ine.mx/sige8")

DEFAULT_TIMEOUT = float(os.getenv("INE_HTTP_TIMEOUT", "30"))
DEFAULT_RETRIES = int(os.getenv("INE_HTTP_RETRIES", "3"))
USER_AGENT = os.getenv(
    "INE_HTTP_USER_AGENT",
    "AgoraCivicIntelligence/0.1 (+https://atlastech.example) integrations-ine",
)


# --- Geographic level mapping ----------------------------------------------
# Maps INE / Marco Geográfico Electoral level names to Ágora's AreaLevel enum.
LEVEL_MAP: dict[str, AreaLevel] = {
    "pais": AreaLevel.COUNTRY,
    "nacional": AreaLevel.COUNTRY,
    "circunscripcion": AreaLevel.REGION,
    "region": AreaLevel.REGION,
    "entidad": AreaLevel.STATE,
    "estado": AreaLevel.STATE,
    "entidad_federativa": AreaLevel.STATE,
    "municipio": AreaLevel.MUNICIPALITY,
    "delegacion": AreaLevel.MUNICIPALITY,
    "alcaldia": AreaLevel.MUNICIPALITY,
    "distrito": AreaLevel.DISTRICT,
    "distrito_federal": AreaLevel.DISTRICT,
    "distrito_local": AreaLevel.DISTRICT,
    "seccion": AreaLevel.PRECINCT,
    "seccion_electoral": AreaLevel.PRECINCT,
    "localidad": AreaLevel.PRECINCT,
    "manzana": AreaLevel.PRECINCT,
}


def map_level(name: str | None) -> AreaLevel:
    """Resolve an INE level name to an AreaLevel (defaults to DISTRICT)."""
    if not name:
        return AreaLevel.DISTRICT
    return LEVEL_MAP.get(name.strip().lower(), AreaLevel.DISTRICT)


# --- Source registry --------------------------------------------------------
@dataclass(frozen=True)
class SourceDescriptor:
    """A consumable INE data source, counted in /api/analytics/overview."""

    id: str
    name: str
    kind: str  # "api" | "wms" | "download" | "portal"
    base_url: str
    formats: list[str] = field(default_factory=list)
    auth_required: bool = False
    notes: str = ""


SOURCES: list[SourceDescriptor] = [
    SourceDescriptor(
        id="datos_gob_ckan",
        name="datos.gob.mx — CKAN API",
        kind="api",
        base_url=CKAN_BASE_URL,
        formats=["json", "csv"],
        auth_required=False,
        notes="API REST (JSON). package_search / package_show / datastore_search. "
        "Incluye padrón y lista nominal del INE.",
    ),
    SourceDescriptor(
        id="candidaturas_mx",
        name="Candidaturas MX (SocialTIC)",
        kind="api",
        base_url=CANDIDATURAS_BASE_URL,
        formats=["json"],
        auth_required=False,
        notes="API Popolo abierta. Candidaturas, partidos y geografía electoral "
        "(proceso 2021; verificar vigencia).",
    ),
    SourceDescriptor(
        id="sige_cartografia",
        name="SIGE — Marco Geográfico Electoral",
        kind="wms",
        base_url=SIGE_WMS_URL or SIGE_PORTAL_URL,
        formats=["wms", "shapefile", "geojson"],
        auth_required=True,
        notes="Entidades, distritos, municipios, secciones. Algunos productos "
        "requieren solicitud de acceso; configurar INE_SIGE_WMS_URL.",
    ),
    SourceDescriptor(
        id="prep",
        name="PREP — Resultados Electorales Preliminares",
        kind="download",
        base_url="https://prep2024.ine.mx",
        formats=["zip", "csv"],
        auth_required=False,
        notes="ZIP con CSV delimitado por '|' (casilla→sección→distrito→"
        "municipio→estado). Descarga por proceso electoral.",
    ),
    SourceDescriptor(
        id="computos",
        name="Cómputos Distritales",
        kind="download",
        base_url="https://computos2021.ine.mx",
        formats=["zip", "csv"],
        auth_required=False,
        notes="Resultados definitivos de cómputos distritales.",
    ),
]
