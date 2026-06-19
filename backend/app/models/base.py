"""Atlas canon model mixins.

Every entity composes these. They enforce the platform invariants at the schema
level: stable UUID identity, tenant scoping, and an audit/soft-delete trail.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column


def new_uuid() -> str:
    """Generate a string UUID4 primary key."""
    return str(uuid.uuid4())


class UUIDMixin:
    """String UUID primary key."""

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_uuid
    )


class TenantMixin:
    """Tenant scoping. Business entities are always bound to an organization.

    Tenant context is derived from the JWT — never from request input.
    """

    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )


class CampaignMixin:
    """Campaign scoping for operational/contest-bound entities."""
    campaign_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )


class AuditMixin:
    """Timestamps, soft delete, and actor attribution."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
