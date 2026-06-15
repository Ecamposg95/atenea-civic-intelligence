"""Audit log read schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class AuditEntry(BaseModel):
    """A single audit-trail entry (read model)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    action: str
    actor_id: Optional[str] = None
    organization_id: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    meta: Optional[dict[str, Any]] = None
    created_at: datetime
