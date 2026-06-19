"""Organization (tenant) model."""

from __future__ import annotations

from typing import TYPE_CHECKING, List

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import AuditMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.electoral_area import ElectoralArea
    from app.models.user import User


class Organization(UUIDMixin, AuditMixin, Base):
    """An institution / tenant. The root of tenant scoping."""

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    users: Mapped[List["User"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    electoral_areas: Mapped[List["ElectoralArea"]] = relationship(
        back_populates="organization",
        cascade="all",
        foreign_keys="ElectoralArea.organization_id",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Organization id={self.id} slug={self.slug!r}>"
