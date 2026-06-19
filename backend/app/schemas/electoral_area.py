"""Electoral area API schemas (Pydantic v2).

Geometry crosses the API boundary as GeoJSON-compatible dicts.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.electoral_area import AreaLevel


class ElectoralAreaBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str | None = Field(default=None, max_length=120)
    level: AreaLevel = AreaLevel.DISTRICT


class ElectoralAreaCreate(ElectoralAreaBase):
    geometry: dict[str, Any] | None = Field(
        default=None, description="GeoJSON geometry (SRID 4326)."
    )
    # organization_id derived from tenant context, never from input.


class ElectoralAreaUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    code: str | None = Field(default=None, max_length=120)
    level: AreaLevel | None = None
    geometry: dict[str, Any] | None = None


class ElectoralAreaRead(ElectoralAreaBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str | None = None  # NULL = global reference cartography
    ingest_run_id: str | None = None
    created_at: datetime
    updated_at: datetime
