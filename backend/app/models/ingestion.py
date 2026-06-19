"""Ingestion governance: registered sources + per-run traceability."""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import AuditMixin, UUIDMixin


class SourceKind(str, enum.Enum):
    FILE_CSV = "file_csv"
    FILE_EXCEL = "file_excel"
    FILE_SHAPEFILE = "file_shapefile"
    FILE_GEOJSON = "file_geojson"
    API = "api"


class IngestStatus(str, enum.Enum):
    RUNNING = "running"
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"


class DataSource(UUIDMixin, AuditMixin, Base):
    __tablename__ = "data_sources"
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_datasource_name"),)
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[SourceKind] = mapped_column(Enum(SourceKind, name="source_kind"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)


class IngestRun(UUIDMixin, AuditMixin, Base):
    __tablename__ = "ingest_runs"
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=True
    )
    campaign_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="SET NULL"), index=True, nullable=True
    )
    source_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("data_sources.id", ondelete="SET NULL"), index=True, nullable=True
    )
    dataset: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    file_name: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    file_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[IngestStatus] = mapped_column(Enum(IngestStatus, name="ingest_status"), default=IngestStatus.RUNNING, nullable=False)
    rows_read: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_inserted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_skipped: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
