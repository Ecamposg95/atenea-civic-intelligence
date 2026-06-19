"""Platform-global reference catalogs (no tenant scoping)."""
from __future__ import annotations

import enum

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import UUIDMixin


class Ambito(str, enum.Enum):
    FEDERAL = "federal"
    ESTATAL = "estatal"
    MUNICIPAL = "municipal"


class Cargo(UUIDMixin, Base):
    """A contested office (gubernatura, diputación federal, etc.)."""
    __tablename__ = "cargos"
    key: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    ambito: Mapped[Ambito] = mapped_column(Enum(Ambito, name="cargo_ambito"), nullable=False)
    territory_level: Mapped[str] = mapped_column(String(40), nullable=False)


class Party(UUIDMixin, Base):
    __tablename__ = "parties"
    key: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    short: Mapped[str] = mapped_column(String(40), nullable=False)
    color: Mapped[str] = mapped_column(String(9), nullable=False, default="#8ba0a8")


class Coalition(UUIDMixin, Base):
    __tablename__ = "coalitions"
    key: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    color: Mapped[str] = mapped_column(String(9), nullable=False, default="#8ba0a8")


class CoalitionParty(UUIDMixin, Base):
    __tablename__ = "coalition_parties"
    coalition_id: Mapped[str] = mapped_column(ForeignKey("coalitions.id", ondelete="CASCADE"), index=True, nullable=False)
    party_id: Mapped[str] = mapped_column(ForeignKey("parties.id", ondelete="CASCADE"), index=True, nullable=False)
