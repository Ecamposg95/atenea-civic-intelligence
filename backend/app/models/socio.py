"""Socioeconomic metrics — tidy global reference facts (row per territory+indicator)."""
from __future__ import annotations
from typing import Optional
from sqlalchemy import ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.base import AuditMixin, UUIDMixin


class SocioMetric(UUIDMixin, AuditMixin, Base):
    __tablename__ = "socio_metrics"
    __table_args__ = (Index("ix_socio_lookup", "nivel", "territory_code", "indicador", "anio"),)
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=True
    )
    ingest_run_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("ingest_runs.id", ondelete="SET NULL"), index=True, nullable=True
    )
    anio: Mapped[int] = mapped_column(Integer, nullable=False)
    nivel: Mapped[str] = mapped_column(String(20), nullable=False)
    territory_code: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    area_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), index=True, nullable=True
    )
    indicador: Mapped[str] = mapped_column(String(60), nullable=False)
    valor: Mapped[float] = mapped_column(Numeric, nullable=False)
