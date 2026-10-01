"""Seed de territorio parametrizado — SMA + matriz seccional 2024 + aislamiento por municipio."""
from sqlalchemy import func, select

from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.seccion_electoral import SeccionElectoral
from app.seeds.demo_territory import seed_territory
from app.seeds.municipios import MUNICIPIOS
from tests.conftest import TestingSessionLocal

SMA = MUNICIPIOS["15076"]
ATZ = MUNICIPIOS["15013"]


def _n_secciones(db, code):
    return db.execute(select(func.count()).select_from(SeccionElectoral).where(
        SeccionElectoral.anio == 2024, SeccionElectoral.municipio_code == code)).scalar_one()


def test_seed_creates_municipio_secciones_and_matrix():
    db = TestingSessionLocal()
    try:
        seed_territory(db, SMA)
        muni = db.execute(select(ElectoralArea).where(ElectoralArea.code == "15076")).scalar_one()
        assert muni.level == AreaLevel.MUNICIPIO
        n_sec = db.execute(select(func.count()).select_from(ElectoralArea).where(
            ElectoralArea.level == AreaLevel.SECCION, ElectoralArea.municipio_id == muni.id)).scalar_one()
        assert n_sec == 23  # 22 de la matriz + la extra 4127
        assert _n_secciones(db, "15076") == 22
        row = db.execute(select(SeccionElectoral).where(SeccionElectoral.seccion == "4121")).scalar_one()
        assert row.margen == -115 and row.prioridad == "COMPETITIVA" and row.municipio_code == "15076"
        assert db.execute(select(SeccionElectoral).where(SeccionElectoral.seccion == "4127")).scalar_one_or_none() is None
    finally:
        db.close()


def test_seed_is_idempotent_and_reconciles_missing_code():
    db = TestingSessionLocal()
    try:
        seed_territory(db, SMA)
        # Simula una fila previa a 0021 (sin municipio_code) y verifica que el seed la reconcilia.
        row = db.execute(select(SeccionElectoral).where(SeccionElectoral.seccion == "4121")).scalar_one()
        row.municipio_code = None
        db.commit()
        seed_territory(db, SMA)
        db.refresh(row)
        assert row.municipio_code == "15076"
        assert _n_secciones(db, "15076") == 22
        n_area = db.execute(select(func.count()).select_from(ElectoralArea).where(ElectoralArea.code == "15076")).scalar_one()
        assert n_area == 1
    finally:
        db.close()


def test_seed_atizapan_no_mezcla_con_sma():
    db = TestingSessionLocal()
    try:
        seed_territory(db, SMA)
        seed_territory(db, ATZ)
        assert _n_secciones(db, "15013") == 174
        assert _n_secciones(db, "15076") == 22
        muni = db.execute(select(ElectoralArea).where(ElectoralArea.code == "15013")).scalar_one()
        assert muni.name == "Atizapán de Zaragoza"
    finally:
        db.close()
