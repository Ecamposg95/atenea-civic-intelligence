from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.dependencies import CampaignCtx, DbSession, Tenant, require_roles
from app.models.campaign import Campaign
from app.models.user import UserRole
from app.schemas.campaign import CampaignCreate, CampaignOut, ContestCreate, ContestOut
from app.services import campaign_service as svc

router = APIRouter(prefix="/campaigns", tags=["campaigns"])
AdminCtx = Annotated[object, Depends(require_roles(UserRole.ADMIN))]


@router.get("/mine", response_model=list[CampaignOut])
def my_campaigns(db: DbSession, ctx: Tenant):
    return svc.list_my_campaigns(db, ctx)


@router.post("", response_model=CampaignOut, status_code=201)
def create_campaign(data: CampaignCreate, db: DbSession, ctx: AdminCtx):
    return svc.create_campaign(db, ctx, data)


@router.get("/{campaign_id}", response_model=CampaignOut)
def get_campaign(campaign_id: str, db: DbSession, cctx: CampaignCtx):
    return db.execute(select(Campaign).where(Campaign.id == cctx.campaign_id)).scalar_one()


@router.get("/{campaign_id}/contests", response_model=list[ContestOut])
def list_contests(campaign_id: str, db: DbSession, cctx: CampaignCtx):
    return svc.list_contests(db, cctx)


@router.post("/{campaign_id}/contests", response_model=ContestOut, status_code=201)
def create_contest(campaign_id: str, data: ContestCreate, db: DbSession, cctx: CampaignCtx):
    return svc.create_contest(db, cctx, data)
