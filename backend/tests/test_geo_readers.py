from pathlib import Path
from app.ingestion.geo_readers import read_features
FIX = Path(__file__).parent / "fixtures"


def test_read_geojson_features():
    rows, header = read_features(FIX / "areas_min.geojson", name_prop="NOMBRE", code_prop="CLAVE")
    rows = list(rows)
    assert {"name", "code", "geometry"} <= set(header)
    assert rows[0]["name"] == "Distrito 01" and rows[0]["code"] == "0901"
    g = rows[0]["geometry"]
    assert g["type"] == "Polygon" and g["coordinates"][0][0] == [-99.1, 19.4]


def test_read_shapefile_reprojects(tmp_path):
    import shapefile  # pyshp
    from pyproj import CRS
    w = shapefile.Writer(str(tmp_path / "s"), shapeType=shapefile.POLYGON)
    w.field("NOMBRE", "C"); w.field("CLAVE", "C")
    x, y = -11035000.0, 2206000.0  # EPSG:3857 near CDMX
    w.poly([[[x, y], [x + 1000, y], [x + 1000, y + 1000], [x, y + 1000], [x, y]]])
    w.record("Z", "0001"); w.close()
    (tmp_path / "s.prj").write_text(CRS.from_epsg(3857).to_wkt())
    rows, _ = read_features(tmp_path / "s.shp", name_prop="NOMBRE", code_prop="CLAVE")
    g = list(rows)[0]["geometry"]
    lon, lat = g["coordinates"][0][0]
    assert -100 < lon < -98 and 19 < lat < 20  # reprojected to 4326 lon/lat


def test_unsupported_format_raises(tmp_path):
    import pytest
    p = tmp_path / "x.txt"; p.write_text("nope")
    with pytest.raises(ValueError):
        read_features(p)
