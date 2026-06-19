"""Electoral / territorial area model with PostGIS geometry.

A single generic geometry column holds points (precincts), polygons (districts)
and multipolygons (regions), all in SRID 4326 (WGS84). On non-PostGIS engines
(e.g. SQLite in tests) the column degrades to text so the schema stays portable.
"""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING, Any, Optional

from geoalchemy2 import Geometry
from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.database import Base
from app.models.base import AuditMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.organization import Organization


class AreaLevel(str, enum.Enum):
    """Administrative / electoral hierarchy levels."""

    # Legacy English-named levels (kept for back-compat).
    COUNTRY = "country"
    REGION = "region"
    STATE = "state"
    MUNICIPALITY = "municipality"
    DISTRICT = "district"
    PRECINCT = "precinct"

    # Mexican electoral hierarchy (SP0a).
    NATION = "nation"
    ESTADO = "estado"
    MUNICIPIO = "municipio"
    DISTRITO_FEDERAL = "distrito_federal"
    DISTRITO_LOCAL = "distrito_local"
    SECCION = "seccion"
    COLONIA = "colonia"
    MANZANA = "manzana"
    CASILLA = "casilla"


# PostGIS geometry on Postgres; plain Text on SQLite (dev/tests). We branch on
# the configured dialect at import time rather than using ``with_variant`` so
# that GeoAlchemy2's SpatiaLite DDL hooks (RecoverGeometryColumn) never fire on
# SQLite — those hooks break ``Base.metadata.create_all`` without SpatiaLite.
if settings.DATABASE_URL.startswith("sqlite"):
    _GEOMETRY_TYPE: Any = Text()
else:
    _GEOMETRY_TYPE = Geometry(geometry_type="GEOMETRY", srid=4326)


class ElectoralArea(UUIDMixin, AuditMixin, Base):
    """A geospatial civic/electoral unit.

    ``organization_id`` is nullable so that base cartography (estados, municipios,
    secciones electorales, etc.) can be stored as shared global reference data with
    no tenant binding.  Tenant-scoped records set ``organization_id`` as usual.
    """

    __tablename__ = "electoral_areas"

    # Nullable tenant — NULL means shared global reference cartography.
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=True
    )  # NULL = shared global reference cartography

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(120), index=True, nullable=True)
    level: Mapped[AreaLevel] = mapped_column(
        Enum(AreaLevel, name="area_level"), default=AreaLevel.DISTRICT, nullable=False
    )

    geometry: Mapped[Optional[Any]] = mapped_column(_GEOMETRY_TYPE, nullable=True)

    # ── Territorial hierarchy columns ─────────────────────────────────────────
    # parent_id: immediate structural parent (generic tree traversal).
    # estado_id … seccion_id: redundant denormalized FKs for fast single-join
    # queries (avoid recursive CTEs at query time).
    parent_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), index=True, nullable=True
    )
    estado_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), index=True, nullable=True
    )
    municipio_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), index=True, nullable=True
    )
    distrito_federal_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), index=True, nullable=True
    )
    distrito_local_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), index=True, nullable=True
    )
    seccion_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), index=True, nullable=True
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    # NOTE: no ORM self-referential relationships (parent/children) — multiple
    # self-FKs make them ambiguous; SP0a queries use the columns directly.
    organization: Mapped[Optional["Organization"]] = relationship(back_populates="electoral_areas")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ElectoralArea id={self.id} name={self.name!r} level={self.level}>"
