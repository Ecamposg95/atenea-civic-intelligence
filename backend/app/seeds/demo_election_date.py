"""Seed idempotente: toda campaña con ``municipio_code`` del registro tiene un Contest con
``election_date = 2027-06-06`` y ``territory_id`` = área MUNICIPIO. Corre en cada arranque."""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.campaign import Campaign, Contest
from app.models.catalog import Ambito, Cargo
from app.models.electoral_area import AreaLevel, ElectoralArea
from app.seeds.municipios import MUNICIPIOS

_ELECTION_DATE = date(2027, 6, 6)
_CARGO = ("presidencia_municipal", "Presidencia Municipal", Ambito.MUNICIPAL, "municipio")


def _cargo(db: Session) -> Cargo:
    cargo = db.execute(select(Cargo).where(Cargo.key == _CARGO[0])).scalar_one_or_none()
    if cargo is None:
        cargo = Cargo(key=_CARGO[0], label=_CARGO[1], ambito=_CARGO[2], territory_level=_CARGO[3])
        db.add(cargo)
        db.flush()
    return cargo


def seed_election_date(db: Session) -> None:
    campaigns = db.execute(select(Campaign).where(
        Campaign.deleted_at.is_(None), Campaign.municipio_code.in_(list(MUNICIPIOS)))).scalars().all()
    if not campaigns:
        return
    cargo = _cargo(db)
    for c in campaigns:
        area = db.execute(select(ElectoralArea).where(
            ElectoralArea.code == c.municipio_code, ElectoralArea.level == AreaLevel.MUNICIPIO)).scalar_one_or_none()
        contest = db.execute(select(Contest).where(
            Contest.campaign_id == c.id, Contest.deleted_at.is_(None))).scalars().first()
        if contest is None:
            contest = Contest(organization_id=c.organization_id, campaign_id=c.id, cargo_id=cargo.id,
                              election_date=_ELECTION_DATE)
            db.add(contest)
        if contest.election_date is None:
            contest.election_date = _ELECTION_DATE
        if contest.territory_id is None and area is not None:
            contest.territory_id = area.id
    db.commit()
