from pathlib import Path
from app.ingestion.readers import read_tabular
from app.ingestion.validation import validate_rows, ColumnSpec

FIX = Path(__file__).parent / "fixtures"


# ---------------------------------------------------------------------------
# Engine / DatasetSpec tests (SP0b-1 Task 3)
# ---------------------------------------------------------------------------
from app.ingestion.engine import run_ingest  # noqa: E402
from app.ingestion.datasets import DATASETS  # noqa: E402
from app.models.census import CensusMetric  # noqa: E402
from app.models.ingestion import IngestRun, IngestStatus  # noqa: E402
from tests.conftest import TestingSessionLocal  # noqa: E402


class _Ctx:
    organization_id = None  # global reference
    campaign_id = None
    is_superadmin = True

    class user:  # noqa
        id = "tester"


def test_engine_ingests_census_and_records_run():
    db = TestingSessionLocal()
    try:
        spec = DATASETS["census"]
        result = run_ingest(db, _Ctx(), spec, FIX / "census_min.csv", source=None, extra={"anio": 2020}, replace=False)
        run = db.get(IngestRun, result.run_id)
        assert run.status in (IngestStatus.SUCCESS, IngestStatus.PARTIAL)
        assert run.rows_inserted == 2
        rows = db.query(CensusMetric).filter(CensusMetric.ingest_run_id == run.id).all()
        assert len(rows) == 2
        assert {r.territory_code for r in rows} == {"15", "15001"}
    finally:
        db.query(CensusMetric).delete()
        db.query(IngestRun).delete()
        db.commit()
        db.close()


def test_engine_replace_is_idempotent():
    db = TestingSessionLocal()
    try:
        spec = DATASETS["census"]
        run_ingest(db, _Ctx(), spec, FIX / "census_min.csv", source=None, extra={"anio": 2020}, replace=True)
        run_ingest(db, _Ctx(), spec, FIX / "census_min.csv", source=None, extra={"anio": 2020}, replace=True)
        # replace by (org, anio) scope → still only 2 rows, not 4
        assert db.query(CensusMetric).filter(CensusMetric.anio == 2020).count() == 2
    finally:
        db.query(CensusMetric).delete()
        db.query(IngestRun).delete()
        db.commit()
        db.close()


def test_read_csv_utf8():
    rows, header = read_tabular(FIX / "census_min.csv")
    rows = list(rows)
    assert header == ["nivel", "clave", "indicador", "valor"]
    assert rows[0]["clave"] == "15" and rows[0]["indicador"] == "POBTOT"


def test_read_csv_latin1_fallback(tmp_path):
    p = tmp_path / "latin.csv"
    p.write_bytes("nivel,clave,indicador,valor\nmunicipio,15002,NOMBRE,Acámbaro\n".encode("latin-1"))
    rows, _ = read_tabular(p)
    assert list(rows)[0]["valor"] == "Acámbaro"


def test_validate_rows_reports_discards():
    specs = [ColumnSpec("clave", required=True), ColumnSpec("valor", required=True, coerce="number")]
    good, discards = validate_rows(
        [{"clave": "15", "valor": "10"}, {"clave": "", "valor": "x"}], specs
    )
    assert len(good) == 1 and good[0]["valor"] == 10.0
    assert len(discards) == 1 and "clave" in discards[0]["reason"]


def test_validate_coerce_failure_is_discarded():
    specs = [ColumnSpec("valor", required=True, coerce="number")]
    good, discards = validate_rows([{"valor": "notanumber"}], specs)
    assert good == [] and len(discards) == 1


def test_read_excel(tmp_path):
    import pytest
    openpyxl = pytest.importorskip("openpyxl")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["nivel", "clave", "indicador", "valor"])
    ws.append(["estado", "15", "POBTOT", "16992418"])
    f = tmp_path / "c.xlsx"
    wb.save(f)
    rows, header = read_tabular(f)
    assert header[:2] == ["nivel", "clave"]
    assert list(rows)[0]["clave"] == "15"


def test_engine_missing_file_records_failed_run():
    db = TestingSessionLocal()
    try:
        spec = DATASETS["census"]
        result = run_ingest(db, _Ctx(), spec, FIX / "does_not_exist.csv", source=None, extra={"anio": 2020})
        assert result.status == "failed"
        run = db.get(IngestRun, result.run_id)
        assert run is not None and run.status == IngestStatus.FAILED
    finally:
        db.query(IngestRun).delete(); db.commit(); db.close()


def test_engine_missing_anio_recorded_not_raised():
    db = TestingSessionLocal()
    try:
        spec = DATASETS["census"]
        result = run_ingest(db, _Ctx(), spec, FIX / "census_min.csv", source=None, extra={})
        assert result.status == "failed"  # recorded, not raised
    finally:
        from app.models.census import CensusMetric
        db.query(CensusMetric).delete(); db.query(IngestRun).delete(); db.commit(); db.close()


def test_engine_reader_hook_used():
    from app.ingestion.datasets import DatasetSpec, DATASETS
    from app.ingestion.validation import ColumnSpec
    from app.models.census import CensusMetric
    from app.models.ingestion import IngestRun
    calls = {"n": 0}
    def fake_reader(path, extra):
        calls["n"] += 1
        return ([{"nivel": "estado", "clave": "01", "indicador": "X", "valor": "5"}],
                ["nivel", "clave", "indicador", "valor"])
    spec = DatasetSpec(key="census", model=CensusMetric,
                       columns=[ColumnSpec("clave", required=True), ColumnSpec("valor", required=True, coerce="number")],
                       row_mapper=DATASETS["census"].row_mapper, scope_filter=DATASETS["census"].scope_filter,
                       reader=fake_reader)
    db = TestingSessionLocal()
    try:
        res = run_ingest(db, _Ctx(), spec, "ignored.csv", source=None, extra={"anio": 2020})
        assert calls["n"] == 1 and res.inserted == 1
    finally:
        db.query(CensusMetric).delete(); db.query(IngestRun).delete(); db.commit(); db.close()
