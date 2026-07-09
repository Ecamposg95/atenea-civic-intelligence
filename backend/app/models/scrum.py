"""Scrum / PM — sprints, backlog work items, and their checklist tasks.

Mirrors Minuta/Caso conventions: String(20) estados (no PG enums, SQLite-safe),
tenant+campaign+audit mixins. WorkItem.completed_at is sealed when the card
enters HECHO (powers B2 burndown/velocity). origin_acuerdo_id links a card back
to the Acuerdo (module A) it was converted from.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Index, Integer, String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import AuditMixin, CampaignMixin, TenantMixin, UUIDMixin


class Sprint(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "sprints"
    __table_args__ = (Index("ix_sprints_campaign_estado", "campaign_id", "estado"),)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    objetivo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date] = mapped_column(Date, nullable=False)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="PLANIFICACION")


class WorkItem(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "work_items"
    __table_args__ = (
        Index("ix_work_items_campaign_sprint_estado", "campaign_id", "sprint_id", "estado"),
        Index("ix_work_items_campaign_estado", "campaign_id", "estado"),
        Index("ix_work_items_campaign_responsable", "campaign_id", "responsable_id"),
    )
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="HISTORIA")
    story_points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="POR_HACER")
    prioridad: Mapped[str] = mapped_column(String(10), nullable=False, default="MEDIA")
    orden: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sprint_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("sprints.id", ondelete="SET NULL"), nullable=True)
    responsable_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    origin_acuerdo_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class WorkItemTask(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "work_item_tasks"
    work_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("work_items.id", ondelete="CASCADE"), nullable=False, index=True)
    texto: Mapped[str] = mapped_column(String(500), nullable=False)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    responsable_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
