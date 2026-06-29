"""ARCO request trail — auditable record of a data-subject erasure/access request.

ArcoRequest is intentionally designed to outlive the Registro it targets:
- registro_id is a plain String, NOT a FK to ``registros`` (which would be
  orphaned after the hard-delete and violate referential integrity).
- titular_ref is a short opaque token (≤ 12 chars), never the full 18-char clave.
- The row persists as the compliance evidence that the request was received and
  processed.  It contains NO PII.

Enums stored as member NAMES (uppercase), matching the platform convention.
``create_type=False`` is used when referencing in op.create_table so that
PostgreSQL ENUM types are created explicitly (via CREATE TYPE … IF NOT EXISTS)
before ``CREATE TABLE``, avoiding ``DuplicateObject`` errors (same pattern as
0001_baseline.py).
"""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import UUIDMixin, new_uuid


class ArcoTipo(str, enum.Enum):
    """Derechos ARCO: Acceso, Rectificación, Cancelación, Oposición."""

    ACCESO = "ACCESO"
    RECTIFICACION = "RECTIFICACION"
    CANCELACION = "CANCELACION"
    OPOSICION = "OPOSICION"


class ArcoEstado(str, enum.Enum):
    """Lifecycle state of an ARCO request."""

    PENDIENTE = "PENDIENTE"
    PROCESADA = "PROCESADA"
    RECHAZADA = "RECHAZADA"


class ArcoRequest(UUIDMixin, Base):
    """Auditable trail for a data-subject ARCO request.

    Persists after the Registro is hard-deleted as the compliance evidence.
    Holds NO PII: titular_ref is an opaque token (≤ 12 chars).
    """

    __tablename__ = "arco_requests"
    __table_args__ = (
        Index("ix_arco_requests_organization_id", "organization_id"),
        Index("ix_arco_requests_registro_id", "registro_id"),
        Index("ix_arco_requests_estado", "estado"),
    )

    # Tenant scoping — NOT a FK (we do not want ON DELETE CASCADE here;
    # the trail must survive even if the org is eventually removed).
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True, index=False  # index via __table_args__
    )
    # Campaign context at the time of the request (informational).
    campaign_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    # The Registro that was requested for deletion.
    # Plain String — NOT a FK to ``registros`` — so it survives the hard-delete.
    registro_id: Mapped[str] = mapped_column(String(36), nullable=False, index=False)

    # Opaque titular reference (e.g. "ARCO-<partial>") — max 12 chars to prevent
    # storage of a full 18-char clave de elector.  NEVER store raw PII here.
    titular_ref: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)

    tipo: Mapped[ArcoTipo] = mapped_column(
        Enum(ArcoTipo, name="arco_tipo", values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    estado: Mapped[ArcoEstado] = mapped_column(
        Enum(ArcoEstado, name="arco_estado", values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
        default=ArcoEstado.PENDIENTE,
    )

    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Actor references (nullable in case the user is later deleted).
    requested_by: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    processed_by: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<ArcoRequest id={self.id} tipo={self.tipo} "
            f"estado={self.estado} registro={self.registro_id}>"
        )
