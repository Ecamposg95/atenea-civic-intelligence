from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class IngestRunOut(BaseModel):
    id: str
    dataset: str
    file_name: Optional[str]
    status: str
    rows_read: int
    rows_inserted: int
    rows_skipped: int
    rows_failed: int
    error_summary: Optional[str]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]

    class Config:
        from_attributes = True
