"""Minutas & Acuerdos — meeting minutes and their action items.

Mirrors ``Caso``/``CasoEvento`` (app/models/atencion.py): String(20) estados
(no PG enums → simple, SQLite-compatible), tenant+campaign+audit mixins. A
``Minuta`` is a meeting record; an ``Acuerdo`` is a commitment born in it. The
``work_item_id`` column is a reserved hook for Sub-proyecto B (Scrum backlog).
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import Date, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import AuditMixin, CampaignMixin, TenantMixin, UUIDMixin


class Minuta(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "minutas"
    __table_args__ = (
        Index("ix_minutas_campaign_fecha", "campaign_id", "fecha"),
        Index("ix_minutas_campaign_estado", "campaign_id", "estado"),
    )
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    lugar: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="REUNION")
    asistentes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    cuerpo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="BORRADOR")
    area_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), nullable=True)


class Acuerdo(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "acuerdos"
    __table_args__ = (
        Index("ix_acuerdos_campaign_responsable_estado",
              "campaign_id", "responsable_id", "estado"),
    )
    minuta_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("minutas.id", ondelete="CASCADE"), nullable=False, index=True)
    texto: Mapped[str] = mapped_column(String(2000), nullable=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    responsable_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    fecha_limite: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDIENTE")
    work_item_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
