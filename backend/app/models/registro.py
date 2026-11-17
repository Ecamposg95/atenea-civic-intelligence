"""Registro — a person captured by an activist (tidy operational fact)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Index, Integer, LargeBinary, String, UniqueConstraint,
)
from sqlalchemy import false as sa_false
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import AuditMixin, CampaignMixin, TenantMixin, UUIDMixin


class Registro(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "registros"
    __table_args__ = (
        Index("ix_registros_campaign_activista", "campaign_id", "activista_id"),
        Index("ix_registros_campaign_seccion", "campaign_id", "seccion"),
        UniqueConstraint(
            "campaign_id", "activista_id", "client_uuid",
            name="uq_registros_campaign_activista_client_uuid",
        ),
    )

    activista_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    nombre_completo: Mapped[str] = mapped_column(String(255), nullable=False)
    seccion: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    direccion: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    colonia: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    telefono: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    area: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    sexo: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)          # "M" | "F"
    edad: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    estructura: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    observacion: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    promotor: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)

    clave_elector_enc: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    clave_masked: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    consentimiento: Mapped[bool] = mapped_column(Boolean, nullable=False)
    consentimiento_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    aviso_version: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    # ── Captura de hojas SMA (migración 0022) ──
    tipo: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)  # LIDER|ACTIVISTA|PROMOVIDO
    padre_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("registros.id", ondelete="SET NULL"), index=True, nullable=True
    )
    apellido_paterno: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    apellido_materno: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    nombres: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    calle: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    numero: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    clave_hash: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    hoja_id: Mapped[Optional[str]] = mapped_column(String(36), index=True, nullable=True)
    # CURP: Fernet ciphertext + masked display + keyed hash (dup detection).
    curp_enc: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    curp_masked: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    curp_hash: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    # "Valor viejo": filas previas a la captura SMA (marcadas por la migración 0022).
    legacy: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa_false()
    )

    client_uuid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
