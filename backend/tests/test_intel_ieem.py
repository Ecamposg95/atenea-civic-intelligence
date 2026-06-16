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
    assert {"municipios", "distritos_locales", "padron_lista_nominal"} <= keys


def test_padron_dataset_skips_preamble_to_real_header():
    # Real shape: decorative preamble rows, then a header starting with ENTIDAD.
    csv = (
        "INSTITUTO ELECTORAL DEL ESTADO DE MÉXICO,\r\n"
        "PADRÓN ELECTORAL Y LISTA NOMINAL ESTADO DE MEXICO,\r\n"
        ",,Fecha de corte: 31 de marzo de 2026\r\n"
        "ENTIDAD,MUNICIPIO,PADRON,LISTA\r\n"
        "15,0,73195,33876\r\n"
        "15,65,1928,1909\r\n"
    ).encode("latin-1")
    result = ieem.fetch_dataset("padron_lista_nominal", fetch=lambda url: csv)
    assert result["key"] == "padron_lista_nominal"
    # The "ENTIDAD" row becomes the header; preamble rows are dropped.
    assert result["columns"] == ["ENTIDAD", "MUNICIPIO", "PADRON", "LISTA"]
    assert result["count"] == 2
    assert result["rows"][0] == {
        "ENTIDAD": "15",
        "MUNICIPIO": "0",
        "PADRON": "73195",
        "LISTA": "33876",
    }


def test_padron_dataset_url_is_percent_encoded():
    # The real file name has spaces + accents; the fetched URL must be encoded.
    captured: dict[str, str] = {}

    def fake_fetch(url: str) -> bytes:
        captured["url"] = url
        return b"Concepto,Total\r\n"

    ieem.fetch_dataset("padron_lista_nominal", fetch=fake_fetch)
    assert " " not in captured["url"]
    assert "%20" in captured["url"]
    assert "%C3%B3" in captured["url"]  # encoded "ó" from "Padrón"


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
