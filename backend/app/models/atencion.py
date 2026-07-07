"""Atención Ciudadana — form definitions, responses, and cases."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Index, Integer, JSON, LargeBinary,
    String, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import AuditMixin, CampaignMixin, TenantMixin, UUIDMixin


class FormDefinition(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "form_definitions"
    __table_args__ = (
        Index("ix_form_definitions_campaign_active", "campaign_id", "is_active"),
        UniqueConstraint("campaign_id", "slug", name="uq_form_definitions_campaign_slug"),
    )
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="PETICION")
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    canal: Mapped[str] = mapped_column(String(20), nullable=False, default="INTERNO")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    schema: Mapped[dict] = mapped_column(JSON, nullable=False)


class FormResponse(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "form_responses"
    __table_args__ = (
        Index("ix_form_responses_campaign_def", "campaign_id", "form_definition_id"),
    )
    form_definition_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("form_definitions.id", ondelete="CASCADE"), nullable=False, index=True)
    answers: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    answers_enc: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="INTERNO")
    captured_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    nombre_emisor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contacto_masked: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    seccion: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    evidencia_keys: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    moderacion: Mapped[str] = mapped_column(String(20), nullable=False, default="VERIFICADO")
    caso_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    client_uuid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class Caso(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "casos"
    __table_args__ = (
        Index("ix_casos_campaign_estado", "campaign_id", "estado"),
        Index("ix_casos_campaign_asignado", "campaign_id", "asignado_a"),
        Index("ix_casos_campaign_seccion", "campaign_id", "seccion"),
        UniqueConstraint("campaign_id", "folio", name="uq_casos_campaign_folio"),
    )
    folio: Mapped[str] = mapped_column(String(40), nullable=False)
    origin_response_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="PETICION")
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    ciudadano_nombre: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contacto_enc: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    contacto_masked: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    seccion: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    colonia: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    area_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), nullable=True)
    asignado_a: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDIENTE")
    prioridad: Mapped[str] = mapped_column(String(10), nullable=False, default="MEDIA")
    fecha_compromiso: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="INTERNO")
    moderacion: Mapped[str] = mapped_column(String(20), nullable=False, default="VERIFICADO")


class CasoEvento(UUIDMixin, TenantMixin, AuditMixin, Base):
    __tablename__ = "caso_eventos"
    __table_args__ = (Index("ix_caso_eventos_caso", "caso_id", "created_at"),)
    caso_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("casos.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    texto: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    evidencia_key: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    estado_nuevo: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    actor_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
