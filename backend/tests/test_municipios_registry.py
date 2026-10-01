from app.seeds.municipios import MUNICIPIOS, REGIONES, config_de, municipios_de_region


def test_registro_tiene_sma_y_region_atizapan():
    assert MUNICIPIOS["15076"].region == "toluca"
    atz = municipios_de_region("atizapan")
    assert [m.code for m in atz][0] == "15013"
    assert {m.code for m in atz} == {"15013", "15104", "15057", "15060", "15121", "15038", "15046"}
    assert REGIONES["atizapan"] == "Atizapán y periferia"


def test_config_bloques_y_folio():
    atz = config_de("15013")
    assert atz.bloque_propio == "Morena-PVEM-PT" and atz.bloque_rival == "PAN-PRI-PRD"
    assert atz.folio_prefix == "ATZ"
    sma = config_de("15076")
    assert sma.folio_prefix == "SMA" and sma.extra_secciones == ("4127",)
    assert config_de("99999") is None


def test_todos_los_csv_existen():
    for cfg in MUNICIPIOS.values():
        assert (cfg.data_dir / "secciones_2024.csv").exists(), cfg.code
        assert (cfg.data_dir / "intel.csv").exists(), cfg.code
