"""Campaign container (multi-contest) + membership, tenant-scoped."""
from __future__ import annotations

import enum
from datetime import date
from typing import Optional

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import AuditMixin, CampaignMixin, TenantMixin, UUIDMixin
from app.models.user import UserRole


class CampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    CLOSED = "closed"


class LicenseTier(str, enum.Enum):
    STANDARD = "standard"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class Campaign(UUIDMixin, TenantMixin, AuditMixin, Base):
    __tablename__ = "campaigns"
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    cycle: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[CampaignStatus] = mapped_column(
        Enum(CampaignStatus, name="campaign_status"), default=CampaignStatus.DRAFT, nullable=False
    )
    license_tier: Mapped[LicenseTier] = mapped_column(
        Enum(LicenseTier, name="license_tier"), default=LicenseTier.STANDARD, nullable=False
    )


class Contest(UUIDMixin, TenantMixin, AuditMixin, CampaignMixin, Base):
    __tablename__ = "contests"
    cargo_id: Mapped[str] = mapped_column(ForeignKey("cargos.id"), index=True, nullable=False)
    territory_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("electoral_areas.id"), index=True, nullable=True
    )
    election_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)


class CampaignMembership(UUIDMixin, AuditMixin, Base):
    __tablename__ = "campaign_memberships"
    __table_args__ = (UniqueConstraint("user_id", "campaign_id", name="uq_campaign_member"),)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True, nullable=False)
    # create_type=False: the user_role PG enum is created once by the User model;
    # re-declaring it here must not emit a second CREATE TYPE on Postgres.
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", create_type=False), default=UserRole.VIEWER, nullable=False
    )
