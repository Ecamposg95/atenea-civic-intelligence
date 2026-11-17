"""Unit tests for INE integrations (no network).

Cover the pure logic: level mapping and the source registry shape.
"""

from app.integrations.ine import config
from app.models.electoral_area import AreaLevel


def test_level_mapping_known_and_default() -> None:
    assert config.map_level("seccion") == AreaLevel.PRECINCT
    assert config.map_level("ENTIDAD") == AreaLevel.STATE
    assert config.map_level("distrito_local") == AreaLevel.DISTRICT
    assert config.map_level("municipio") == AreaLevel.MUNICIPALITY
    # Unknown / empty fall back to DISTRICT.
    assert config.map_level("desconocido") == AreaLevel.DISTRICT
    assert config.map_level(None) == AreaLevel.DISTRICT


def test_source_registry_is_well_formed() -> None:
    ids = {s.id for s in config.SOURCES}
    assert {"datos_gob_ckan", "candidaturas_mx", "sige_cartografia", "prep"} <= ids
    for s in config.SOURCES:
        assert s.kind in {"api", "wms", "download", "portal"}
        assert s.base_url
        assert isinstance(s.formats, list)
