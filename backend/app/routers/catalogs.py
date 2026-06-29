from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.dependencies import DbSession, Tenant, require_roles
from app.models.catalog import Cargo, Party
from app.models.user import UserRole
from app.schemas.catalog import CargoOut, PartyOut

# Catalogs (reference data for capture forms and intelligence dropdowns).
# Broad set so that capture roles (activista/capturista/consulta) can populate
# dropdowns. Only SUPERADMIN (auto-passes) is excluded from the explicit list.
_CATALOGS_ROLES = Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER,
    UserRole.ACTIVISTA, UserRole.CAPTURISTA,
    UserRole.ANALYST, UserRole.VIEWER, UserRole.CONSULTA,
))

router = APIRouter(prefix="/catalogs", tags=["catalogs"], dependencies=[_CATALOGS_ROLES])


@router.get("/cargos", response_model=list[CargoOut])
def list_cargos(db: DbSession, ctx: Tenant):
    return list(db.execute(select(Cargo)).scalars())


@router.get("/parties", response_model=list[PartyOut])
def list_parties(db: DbSession, ctx: Tenant):
    return list(db.execute(select(Party)).scalars())
