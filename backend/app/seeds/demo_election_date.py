"""Idempotent seed: ensure the demo campaign has a Contest with
``election_date = 2027-06-06`` (primer domingo de junio) so the Command Center
countdown runs. No migration; reuses Cargo + Contest. Safe to run every boot."""
from __future__ import annotations

import os
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.campaign import Campaign, Contest
from app.models.catalog import Ambito, Cargo

_CAMPAIGN_ID = os.environ.get("DEMO_CAMPAIGN_ID", "616b72dd-268a-42d9-8c66-008a0780cda8")
_ELECTION_DATE = date(2027, 6, 6)
_CARGO = ("presidencia_municipal", "Presidencia Municipal", Ambito.MUNICIPAL, "municipio")


def seed_election_date(db: Session) -> None:
    campaign = db.get(Campaign, _CAMPAIGN_ID)
    if campaign is None:
        return  # demo campaign not present in this environment — skip

    # already has a dated contest? nothing to do.
    dated = db.execute(
        select(Contest).where(
            Contest.campaign_id == _CAMPAIGN_ID,
            Contest.deleted_at.is_(None),
            Contest.election_date.is_not(None),
        )
    ).first()
    if dated is not None:
        return

    cargo = db.execute(select(Cargo).where(Cargo.key == _CARGO[0])).scalar_one_or_none()
    if cargo is None:
        cargo = Cargo(key=_CARGO[0], label=_CARGO[1], ambito=_CARGO[2], territory_level=_CARGO[3])
        db.add(cargo)
        db.flush()

    # reuse an existing undated contest if any, else create one.
    contest = db.execute(
        select(Contest).where(
            Contest.campaign_id == _CAMPAIGN_ID, Contest.deleted_at.is_(None)
        )
    ).scalars().first()
    if contest is None:
        contest = Contest(
            organization_id=campaign.organization_id,
            campaign_id=_CAMPAIGN_ID,
            cargo_id=cargo.id,
            election_date=_ELECTION_DATE,
        )
        db.add(contest)
    else:
        contest.election_date = _ELECTION_DATE
    db.commit()
