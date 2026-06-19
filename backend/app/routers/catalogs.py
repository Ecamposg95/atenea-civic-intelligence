from fastapi import APIRouter
from sqlalchemy import select

from app.dependencies import DbSession, Tenant
from app.models.catalog import Cargo, Party
from app.schemas.catalog import CargoOut, PartyOut

router = APIRouter(prefix="/catalogs", tags=["catalogs"])


@router.get("/cargos", response_model=list[CargoOut])
def list_cargos(db: DbSession, ctx: Tenant):
    return list(db.execute(select(Cargo)).scalars())


@router.get("/parties", response_model=list[PartyOut])
def list_parties(db: DbSession, ctx: Tenant):
    return list(db.execute(select(Party)).scalars())
