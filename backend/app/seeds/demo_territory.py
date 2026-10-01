"""Seed idempotente de territorio por municipio: ElectoralArea MUNICIPIO + SECCION y la
matriz electoral 2024 (SeccionElectoral) desde ``municipios/<code>/secciones_2024.csv``."""
from __future__ import annotations

import csv

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.seccion_electoral import SeccionElectoral
from app.seeds.municipios import MUNICIPIOS, MunicipioConfig

_ANIO = 2024


def _area_seccion(db: Session, code: str, muni: ElectoralArea) -> None:
    area = db.execute(select(ElectoralArea).where(
        ElectoralArea.code == code, ElectoralArea.level == AreaLevel.SECCION)).scalar_one_or_none()
    if area is None:
        db.add(ElectoralArea(name=f"Sección {code}", code=code, level=AreaLevel.SECCION,
                             organization_id=None, municipio_id=muni.id, parent_id=muni.id))
    elif area.municipio_id is None or area.parent_id is None:
        area.municipio_id = muni.id
        area.parent_id = muni.id


def seed_territory(db: Session, cfg: MunicipioConfig) -> None:
    muni = db.execute(select(ElectoralArea).where(
        ElectoralArea.code == cfg.code, ElectoralArea.level == AreaLevel.MUNICIPIO)).scalar_one_or_none()
    if muni is None:
        muni = ElectoralArea(name=cfg.name, code=cfg.code, level=AreaLevel.MUNICIPIO, organization_id=None)
        db.add(muni)
        db.flush()

    existentes = {f.seccion: f for f in db.execute(select(SeccionElectoral).where(
        SeccionElectoral.anio == _ANIO)).scalars()}
    with (cfg.data_dir / "secciones_2024.csv").open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            code = r["seccion"]
            _area_seccion(db, code, muni)
            fact = existentes.get(code)
            if fact is None:
                db.add(SeccionElectoral(
                    seccion=code, municipio=cfg.name, municipio_code=cfg.code, anio=_ANIO,
                    lista_nominal=int(r["lista_nominal"]), votos=int(r["votos"]),
                    participacion=float(r["participacion"]), coalicion=int(r["coalicion"]),
                    morena=int(r["morena"]), margen=int(r["margen"]), prioridad=r["prioridad"]))
            elif fact.municipio_code != cfg.code:
                fact.municipio_code = cfg.code   # reconcilia filas previas a 0021
    for code in cfg.extra_secciones:
        _area_seccion(db, code, muni)
    db.commit()


def seed_all_territories(db: Session) -> None:
    for cfg in MUNICIPIOS.values():
        seed_territory(db, cfg)


seed_demo_territory = seed_all_territories  # alias histórico (lifespan/tests antiguos)
