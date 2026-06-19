from pydantic import BaseModel


class CargoOut(BaseModel):
    id: str
    key: str
    label: str
    ambito: str
    territory_level: str

    class Config:
        from_attributes = True


class PartyOut(BaseModel):
    id: str
    key: str
    name: str
    short: str
    color: str

    class Config:
        from_attributes = True
