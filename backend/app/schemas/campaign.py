from datetime import date
from typing import Optional
from pydantic import BaseModel


class CampaignCreate(BaseModel):
    name: str
    cycle: int
    municipio_code: Optional[str] = None
    candidato: Optional[str] = None
    partido: Optional[str] = None


class CampaignOut(BaseModel):
    id: str
    name: str
    cycle: int
    status: str
    license_tier: str
    municipio_code: Optional[str] = None
    candidato: Optional[str] = None
    partido: Optional[str] = None

    class Config:
        from_attributes = True


class ContestCreate(BaseModel):
    cargo_id: str
    territory_id: Optional[str] = None
    election_date: Optional[date] = None


class ContestOut(BaseModel):
    id: str
    campaign_id: str
    cargo_id: str
    territory_id: Optional[str]
    election_date: Optional[date]

    class Config:
        from_attributes = True
