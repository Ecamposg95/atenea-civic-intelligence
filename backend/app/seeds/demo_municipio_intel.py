"""Idempotent seed: San Mateo Atenco municipal intelligence (socio-demographic,
mobility, electoral history 2015-2024, party breakdown, section aggregates) from
the VG study, loaded as generic ``CensusMetric`` rows keyed by (nivel, territory
code, anio, indicador). No migration — reuses the existing metric store."""
from __future__ import annotations

import csv
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.census import CensusMetric

_CSV = Path(__file__).parent / "san_mateo_atenco_intel.csv"
_MUNI_CODE = "15076"
_NIVEL = "MUNICIPIO"


def seed_municipio_intel(db: Session) -> None:
    rows = list(csv.DictReader(_CSV.open(encoding="utf-8")))
    for r in rows:
        anio = int(r["anio"])
        indicador = r["indicador"]
        exists = db.execute(
            select(CensusMetric).where(
                CensusMetric.nivel == _NIVEL,
                CensusMetric.territory_code == _MUNI_CODE,
                CensusMetric.anio == anio,
                CensusMetric.indicador == indicador,
            )
        ).scalar_one_or_none()
        if exists is None:
            db.add(CensusMetric(
                organization_id=None,
                anio=anio,
                nivel=_NIVEL,
                territory_code=_MUNI_CODE,
                indicador=indicador,
                valor=float(r["valor"]),
            ))
    db.commit()
