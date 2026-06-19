"""Geo readers: GeoJSON + Shapefile -> engine rows with GeoJSON geometry (EPSG:4326)."""
from __future__ import annotations

import json
from pathlib import Path


def _reproject_coords(coords, transform):
    if not coords:
        return coords
    if isinstance(coords[0], (int, float)):
        x, y = transform(coords[0], coords[1])
        return [x, y]
    return [_reproject_coords(c, transform) for c in coords]


def _features_to_rows(features, name_prop, code_prop, parent_prop):
    rows = []
    for f in features:
        props = f.get("properties", {}) or {}
        rows.append({
            "name": str(props.get(name_prop, "")) if name_prop else "",
            "code": str(props.get(code_prop, "")) if code_prop else "",
            "parent_code": str(props.get(parent_prop, "")) if parent_prop else "",
            "geometry": f.get("geometry"),
        })
    return rows, ["name", "code", "parent_code", "geometry"]


def read_geojson(path, *, name_prop=None, code_prop=None, parent_prop=None):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    feats = data.get("features", []) if data.get("type") == "FeatureCollection" else [data]
    return _features_to_rows(feats, name_prop, code_prop, parent_prop)


def read_shapefile(path, *, name_prop=None, code_prop=None, parent_prop=None):
    import shapefile  # pyshp
    from pyproj import CRS, Transformer
    p = Path(path)
    reader = shapefile.Reader(str(p))
    prj = p.with_suffix(".prj")
    transform = None
    if prj.exists():
        src = CRS.from_wkt(prj.read_text())
        if src.to_epsg() != 4326:
            t = Transformer.from_crs(src, CRS.from_epsg(4326), always_xy=True)
            transform = lambda x, y: t.transform(x, y)
    feats = []
    for sr in reader.shapeRecords():
        geom = sr.shape.__geo_interface__
        if transform is not None:
            geom = {"type": geom["type"], "coordinates": _reproject_coords(geom["coordinates"], transform)}
        feats.append({"properties": sr.record.as_dict(), "geometry": geom})
    return _features_to_rows(feats, name_prop, code_prop, parent_prop)


def read_features(path, *, name_prop=None, code_prop=None, parent_prop=None):
    suffix = Path(path).suffix.lower()
    if suffix in (".geojson", ".json"):
        return read_geojson(path, name_prop=name_prop, code_prop=code_prop, parent_prop=parent_prop)
    if suffix == ".shp":
        return read_shapefile(path, name_prop=name_prop, code_prop=code_prop, parent_prop=parent_prop)
    raise ValueError(f"Unsupported geo format: {suffix}")
