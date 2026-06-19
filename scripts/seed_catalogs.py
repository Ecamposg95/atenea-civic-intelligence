"""Seed the global Cargo + Party catalogs. Idempotent.

Run from the project root:
    python -m scripts.seed_catalogs

Or directly (the sys.path insert handles the backend/ lookup):
    python scripts/seed_catalogs.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.catalog import Ambito, Cargo, Party  # noqa: E402

CARGOS = [
    ("presidencia", "Presidencia de la República", Ambito.FEDERAL, "nation"),
    ("gubernatura", "Gubernatura", Ambito.ESTATAL, "estado"),
    ("senaduria", "Senaduría", Ambito.FEDERAL, "estado"),
    ("dip_federal", "Diputación Federal", Ambito.FEDERAL, "distrito_federal"),
    ("dip_local", "Diputación Local", Ambito.ESTATAL, "distrito_local"),
    ("presidencia_municipal", "Presidencia Municipal", Ambito.MUNICIPAL, "municipio"),
]
PARTIES = [
    ("morena", "Movimiento Regeneración Nacional", "MORENA", "#a6032f"),
    ("pan", "Partido Acción Nacional", "PAN", "#0851a5"),
    ("pri", "Partido Revolucionario Institucional", "PRI", "#0f8a3c"),
    ("mc", "Movimiento Ciudadano", "MC", "#f58025"),
    ("prd", "Partido de la Revolución Democrática", "PRD", "#ffcc00"),
    ("pvem", "Partido Verde Ecologista", "PVEM", "#2e9e57"),
    ("pt", "Partido del Trabajo", "PT", "#d62828"),
]


def run():
    with SessionLocal() as db:
        for key, label, ambito, lvl in CARGOS:
            if not db.execute(select(Cargo).where(Cargo.key == key)).scalar_one_or_none():
                db.add(Cargo(key=key, label=label, ambito=ambito, territory_level=lvl))
        for key, name, short, color in PARTIES:
            if not db.execute(select(Party).where(Party.key == key)).scalar_one_or_none():
                db.add(Party(key=key, name=name, short=short, color=color))
        db.commit()
    print("✓ Catalog seed complete")
    print(f"  {len(CARGOS)} cargos, {len(PARTIES)} parties seeded (idempotent)")


if __name__ == "__main__":
    run()
