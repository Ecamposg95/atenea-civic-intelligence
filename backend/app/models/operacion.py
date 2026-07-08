"""Operación territorial — plan operativo por sección + agenda 30/60/90.
Campaign-scoped operationalization of the VG study's section matrix."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import AuditMixin, CampaignMixin, TenantMixin, UUIDMixin


class SeccionPlan(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    """One operational plan per (campaign, sección): responsable, dominant
    problem, local leadership, weekly promovidos target."""
    __tablename__ = "seccion_planes"
    __table_args__ = (
        UniqueConstraint("campaign_id", "seccion", name="uq_seccion_planes_campaign_seccion"),
    )
    seccion: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    responsable_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    problema_dominante: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    liderazgo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    meta_semanal: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    prioridad_operativa: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    notas: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)


class AgendaItem(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    """A checklist item of the 30/60/90 campaign-startup agenda."""
    __tablename__ = "agenda_items"
    fase: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # 30 | 60 | 90
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
