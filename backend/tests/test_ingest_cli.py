"""Tests for scripts/ingest_file.py CLI."""
from pathlib import Path
import importlib.util

from tests.conftest import TestingSessionLocal
from app.models.ingestion import DataSource, IngestRun
from app.models.census import CensusMetric

FIX = Path(__file__).parent / "fixtures"


def _load_cli():
    # load scripts/ingest_file.py as a module
    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location("ingest_file", root / "scripts" / "ingest_file.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_cli_get_or_create_source_and_ingest(monkeypatch):
    cli = _load_cli()
    # point the CLI's SessionLocal at the test DB
    monkeypatch.setattr(cli, "SessionLocal", TestingSessionLocal, raising=False)
    res = cli.ingest(dataset="census", file=str(FIX / "census_min.csv"),
                     source="INEGI 2020", org=None, campaign=None, anio=2020, replace=True)
    assert res.inserted == 2
    db = TestingSessionLocal()
    try:
        assert db.query(DataSource).filter(DataSource.name == "INEGI 2020").count() == 1
        assert db.query(IngestRun).count() >= 1
        # idempotent source: run again, still one source
        cli.ingest(dataset="census", file=str(FIX / "census_min.csv"), source="INEGI 2020",
                   org=None, campaign=None, anio=2020, replace=True)
        assert db.query(DataSource).filter(DataSource.name == "INEGI 2020").count() == 1
    finally:
        db.query(CensusMetric).delete(); db.query(IngestRun).delete(); db.query(DataSource).delete(); db.commit(); db.close()
