"""User model with role-based access and tenant scoping.

A user belongs to an organization. The ``superadmin`` role may have a null
organization (platform-level operator); all other roles are tenant-bound.
"""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import AuditMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.electoral_area import ElectoralArea
    from app.models.organization import Organization


class UserRole(str, enum.Enum):
    """Coarse role model. Fine-grained permissions can layer on later."""

    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    ANALYST = "analyst"
    VIEWER = "viewer"
    LIDER = "lider"
    ACTIVISTA = "activista"
    COORDINADOR = "coordinador"
    CAPTURISTA = "capturista"
    CONSULTA = "consulta"


class User(UUIDMixin, AuditMixin, Base):
    """A platform user."""

    __tablename__ = "users"

    # Nullable: platform-level superadmins are not bound to a single tenant.
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), default=UserRole.VIEWER, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # Activist-structure hierarchy: an activist points to its leader; a leader
    # has lider_id = NULL. Self-FK on users.
    lider_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    # A LIDER points to its COORDINADOR (campo→coordinación). Self-FK, like lider_id.
    coordinador_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    seccion: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Territorial assignment: which electoral area (any level) this user is
    # scoped to for territory-based dashboards/filters (SP-territorio).
    area_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"),
        index=True, nullable=True,
    )
    # Forces a password change on next login (temp-password onboarding flow).
    must_change_password: Mapped[bool] = mapped_column(default=False, nullable=False)

    organization: Mapped[Optional["Organization"]] = relationship(back_populates="users")
    area: Mapped[Optional["ElectoralArea"]] = relationship(
        "ElectoralArea", lazy="joined", foreign_keys=[area_id]
    )

    @property
    def area_nombre(self) -> Optional[str]:
        return self.area.name if self.area else None

    @property
    def area_nivel(self) -> Optional[str]:
        return self.area.level.value if self.area else None

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User id={self.id} email={self.email!r} role={self.role}>"
