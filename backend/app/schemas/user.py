"""User API schemas (Pydantic v2)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    role: UserRole = UserRole.VIEWER
    phone: str | None = Field(default=None, max_length=40)


class UserCreate(UserBase):
    # If omitted, a temporary password is generated and returned once.
    password: str | None = Field(default=None, min_length=8, max_length=128)
    # Honored only for superadmins; otherwise the caller's tenant is used
    # (Golden Rule #2 — tenant from context, not arbitrary input).
    organization_id: str | None = None
    # Activist-structure fields (SPA-2 T6).
    lider_id: str | None = None
    coordinador_id: str | None = None
    seccion: str | None = Field(default=None, max_length=20)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    role: UserRole | None = None
    phone: str | None = Field(default=None, max_length=40)
    is_active: bool | None = None
    # Activist-structure fields (SPA-2 T6). None means "not sent"; use
    # model_fields_set to distinguish "omit" from "clear" for lider_id/coordinador_id.
    lider_id: str | None = None
    coordinador_id: str | None = None
    seccion: str | None = Field(default=None, max_length=20)


class SelfUpdate(BaseModel):
    """Self-service profile update (no role/status/tenant changes)."""

    full_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=40)


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str | None
    is_active: bool
    must_change_password: bool
    lider_id: str | None
    coordinador_id: str | None
    seccion: str | None
    area_id: str | None = None
    area_nombre: str | None = None
    area_nivel: str | None = None
    created_at: datetime
    updated_at: datetime


class TerritorioAssign(BaseModel):
    area_id: str | None = None


class UserCreated(BaseModel):
    """Result of creating a user — includes the one-time temporary password."""

    user: UserRead
    temporary_password: str | None = None


class PasswordResetResult(BaseModel):
    """Result of an admin-triggered password reset."""

    user_id: str
    temporary_password: str


class ChangePasswordRequest(BaseModel):
    """Self-service password change (clears the forced-change flag)."""

    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)
