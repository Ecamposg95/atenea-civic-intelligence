from app.seeds.municipios import MUNICIPIOS, REGIONES, config_de, municipios_de_region


def test_registro_solo_sma():
    assert list(MUNICIPIOS) == ["15076"]
    assert MUNICIPIOS["15076"].region == "toluca"
    assert [m.code for m in municipios_de_region("toluca")] == ["15076"]
    assert REGIONES["toluca"] == "Valle de Toluca"


def test_config_bloques_y_folio():
    sma = config_de("15076")
    assert sma.bloque_propio == "Coalición" and sma.bloque_rival == "Morena"
    assert sma.folio_prefix == "SMA" and sma.extra_secciones == ("4127",)
    assert config_de("15013") is None
    assert config_de("99999") is None


def test_todos_los_csv_existen():
    for cfg in MUNICIPIOS.values():
        assert (cfg.data_dir / "secciones_2024.csv").exists(), cfg.code
        assert (cfg.data_dir / "intel.csv").exists(), cfg.code
