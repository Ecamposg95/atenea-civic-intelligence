from pathlib import Path
from app.ingestion.readers import read_tabular
from app.ingestion.validation import validate_rows, ColumnSpec

FIX = Path(__file__).parent / "fixtures"


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
