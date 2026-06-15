from app.integrations.intel import ieem

# Real IEEM files carry title/preamble rows before the numbered data, are
# Windows-1252 encoded, and are sequential 1..N catalogs.
CSV = (
    "INSTITUTO ELECTORAL DEL ESTADO DE MÉXICO,\r\n"
    "MUNICIPIOS,\r\n"
    "1,ACAMBAY DE RUIZ CASTAÑEDA\r\n"
    "2,ACOLMAN\r\n"
).encode("latin-1")


def test_datasets_registry_has_expected_keys():
    keys = {d["key"] for d in ieem.list_datasets()}
    assert {"municipios", "distritos_locales"} <= keys


def test_distritos_dataset_parses_numbered_catalog():
    csv = (
        "INSTITUTO ELECTORAL DEL ESTADO DE MÉXICO,\r\n"
        "DISTRITOS,\r\n"
        "1,TOLUCA\r\n"
    ).encode("latin-1")
    result = ieem.fetch_dataset("distritos_locales", fetch=lambda url: csv)
    assert result["columns"] == ["Distrito", "Cabecera"]
    assert result["rows"][0] == {"Distrito": "1", "Cabecera": "TOLUCA"}


def test_fetch_dataset_skips_preamble_and_maps_columns():
    result = ieem.fetch_dataset("municipios", fetch=lambda url: CSV)
    assert result["key"] == "municipios"
    assert result["columns"] == ["Clave", "Municipio"]
    # Title/preamble rows ("INSTITUTO…", "MUNICIPIOS") are dropped.
    assert result["count"] == 2
    assert result["rows"][0] == {"Clave": "1", "Municipio": "ACAMBAY DE RUIZ CASTAÑEDA"}
    assert result["rows"][1] == {"Clave": "2", "Municipio": "ACOLMAN"}
    assert "ieem" in result["source"].lower()


def test_fetch_dataset_handles_latin1_encoding():
    # byte 0xc9 = "É" in Latin-1; must not raise UnicodeDecodeError.
    row = ieem.fetch_dataset("municipios", fetch=lambda url: CSV)["rows"][0]
    assert row["Municipio"] == "ACAMBAY DE RUIZ CASTAÑEDA"


def test_unknown_dataset_raises():
    import pytest

    with pytest.raises(KeyError):
        ieem.fetch_dataset("nope", fetch=lambda url: CSV)
