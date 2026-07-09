"""Idempotent demo-territory seed: San Mateo Atenco municipio + 22 secciones
(ElectoralArea) and the 2024 electoral matrix (SeccionElectoral) from the study CSV."""
from __future__ import annotations

import csv
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.seccion_electoral import SeccionElectoral

_CSV = Path(__file__).parent / "san_mateo_atenco_secciones_2024.csv"
_MUNI_CODE = "15076"
_MUNI_NAME = "San Mateo Atenco"
_ANIO = 2024
# Secciones del municipio que NO están en la matriz electoral 2024 del estudio
# (el estudio las omitió) pero sí tienen promovidos capturados. Se siembran como
# áreas para que entren al alcance territorial; no llevan fila SeccionElectoral,
# así que su contexto electoral se muestra vacío ("—").
_EXTRA_SECCIONES = ["4127"]


def seed_demo_territory(db: Session) -> None:
    # 1. Municipio (idempotent by code)
    muni = db.execute(
        select(ElectoralArea).where(ElectoralArea.code == _MUNI_CODE)
    ).scalar_one_or_none()
    if muni is None:
        muni = ElectoralArea(
            name=_MUNI_NAME, code=_MUNI_CODE,
            level=AreaLevel.MUNICIPIO, organization_id=None,
        )
        db.add(muni)
        db.flush()

    rows = list(csv.DictReader(_CSV.open(encoding="utf-8")))

    # 2. Secciones (ElectoralArea) + matrix (SeccionElectoral)
    for r in rows:
        code = r["seccion"]
        sec_area = db.execute(
            select(ElectoralArea).where(
                ElectoralArea.code == code,
                ElectoralArea.level == AreaLevel.SECCION,
            )
        ).scalar_one_or_none()
        if sec_area is None:
            db.add(ElectoralArea(
                name=f"Sección {code}", code=code, level=AreaLevel.SECCION,
                organization_id=None, municipio_id=muni.id, parent_id=muni.id,
            ))
        fact = db.execute(
            select(SeccionElectoral).where(
                SeccionElectoral.seccion == code, SeccionElectoral.anio == _ANIO)
        ).scalar_one_or_none()
        if fact is None:
            db.add(SeccionElectoral(
                seccion=code, municipio=_MUNI_NAME, anio=_ANIO,
                lista_nominal=int(r["lista_nominal"]), votos=int(r["votos"]),
                participacion=float(r["participacion"]),
                coalicion=int(r["coalicion"]), morena=int(r["morena"]),
                margen=int(r["margen"]), prioridad=r["prioridad"],
            ))

    # 3. Extra secciones del municipio sin matriz electoral (idempotente)
    for code in _EXTRA_SECCIONES:
        exists = db.execute(
            select(ElectoralArea).where(
                ElectoralArea.code == code,
                ElectoralArea.level == AreaLevel.SECCION,
            )
        ).scalar_one_or_none()
        if exists is None:
            db.add(ElectoralArea(
                name=f"Sección {code}", code=code, level=AreaLevel.SECCION,
                organization_id=None, municipio_id=muni.id, parent_id=muni.id,
            ))
        elif exists.municipio_id is None or exists.parent_id is None:
            # Reconcile a pre-existing area (e.g. created bare by a test
            # fixture) to the intended linked state, instead of skipping it.
            exists.municipio_id = muni.id
            exists.parent_id = muni.id
    db.commit()
