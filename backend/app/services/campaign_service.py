from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.campaign import Campaign, Contest, CampaignMembership


def list_my_campaigns(db: Session, ctx) -> list[Campaign]:
    if ctx.is_superadmin:
        return list(db.execute(select(Campaign).where(Campaign.deleted_at.is_(None))).scalars())
    ids = db.execute(
        select(CampaignMembership.campaign_id).where(
            CampaignMembership.user_id == ctx.user.id,
            CampaignMembership.deleted_at.is_(None),
        )
    ).scalars().all()
    if not ids:
        return []
    return list(db.execute(
        select(Campaign).where(Campaign.id.in_(ids), Campaign.deleted_at.is_(None))
    ).scalars())


def create_campaign(db: Session, ctx, data) -> Campaign:
    c = Campaign(name=data.name, cycle=data.cycle, organization_id=ctx.organization_id, created_by=ctx.user.id)
    db.add(c)
    db.flush()
    db.add(CampaignMembership(user_id=ctx.user.id, campaign_id=c.id, role=ctx.role))
    db.commit()
    db.refresh(c)
    return c


def list_contests(db: Session, cctx) -> list[Contest]:
    return list(db.execute(
        select(Contest).where(Contest.campaign_id == cctx.campaign_id, Contest.deleted_at.is_(None))
    ).scalars())


def create_contest(db: Session, cctx, data) -> Contest:
    ct = Contest(
        organization_id=cctx.organization_id,
        campaign_id=cctx.campaign_id,
        cargo_id=data.cargo_id,
        territory_id=data.territory_id,
        election_date=data.election_date,
        created_by=cctx.user.id,
    )
    db.add(ct)
    db.commit()
    db.refresh(ct)
    return ct
