"""Seed idempotente de inteligencia municipal (CensusMetric) desde ``municipios/<code>/intel.csv``."""
from __future__ import annotations

import csv

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.census import CensusMetric
from app.seeds.municipios import MUNICIPIOS, MunicipioConfig

_NIVEL = "MUNICIPIO"


def seed_intel(db: Session, cfg: MunicipioConfig) -> None:
    existentes = {(m.anio, m.indicador) for m in db.execute(select(CensusMetric).where(
        CensusMetric.nivel == _NIVEL, CensusMetric.territory_code == cfg.code)).scalars()}
    with (cfg.data_dir / "intel.csv").open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            key = (int(r["anio"]), r["indicador"])
            if key not in existentes:
                db.add(CensusMetric(organization_id=None, anio=key[0], nivel=_NIVEL,
                                    territory_code=cfg.code, indicador=key[1], valor=float(r["valor"])))
                existentes.add(key)
    db.commit()


def seed_municipio_intel(db: Session) -> None:
    for cfg in MUNICIPIOS.values():
        seed_intel(db, cfg)
