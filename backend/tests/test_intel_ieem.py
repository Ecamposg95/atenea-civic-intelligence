from app.integrations.intel import ieem


CSV = b"MUNICIPIO,NOMBRE DEL MUNICIPIO\r\n1,ACAMBAY\r\n2,ACOLMAN\r\n"


def test_datasets_registry_has_municipios():
    keys = {d["key"] for d in ieem.list_datasets()}
    assert "municipios" in keys


def test_fetch_dataset_parses_csv_rows():
    result = ieem.fetch_dataset("municipios", fetch=lambda url: CSV)
    assert result["key"] == "municipios"
    assert result["columns"] == ["MUNICIPIO", "NOMBRE DEL MUNICIPIO"]
    assert result["rows"][0] == {"MUNICIPIO": "1", "NOMBRE DEL MUNICIPIO": "ACAMBAY"}
    assert result["count"] == 2
    assert "source" in result and "ieem" in result["source"].lower()


def test_unknown_dataset_raises():
    import pytest
    with pytest.raises(KeyError):
        ieem.fetch_dataset("nope", fetch=lambda url: CSV)
