"""DENUE economic units — columnar facts with a Point geometry from file lat/lon."""
from __future__ import annotations
from typing import Any, Optional
from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column
from geoalchemy2 import Geometry
from app.core.config import settings
from app.database import Base
from app.models.base import AuditMixin, UUIDMixin

if settings.DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import Text
    _POINT_TYPE: Any = Text()
else:
    _POINT_TYPE = Geometry(geometry_type="POINT", srid=4326)


class EconomicUnit(UUIDMixin, AuditMixin, Base):
    __tablename__ = "economic_units"
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=True
    )
    ingest_run_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("ingest_runs.id", ondelete="SET NULL"), index=True, nullable=True
    )
    clave: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(300), nullable=False)
    actividad: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    actividad_desc: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    estrato: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    territory_code: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    area_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), index=True, nullable=True
    )
    lat: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    lon: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    geometry: Mapped[Optional[Any]] = mapped_column(_POINT_TYPE, nullable=True)
