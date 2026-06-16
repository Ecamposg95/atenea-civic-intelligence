"""Organization API schemas (Pydantic v2)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class OrganizationBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=120)


class OrganizationCreate(OrganizationBase):
    """Payload to create an organization (superadmin only)."""


# Backwards-compatible alias for the canonical create schema name.
OrgCreate = OrganizationCreate


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=120)
    is_active: bool | None = None


# Backwards-compatible alias for the canonical update schema name.
OrgUpdate = OrganizationUpdate


class OrganizationRead(OrganizationBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
