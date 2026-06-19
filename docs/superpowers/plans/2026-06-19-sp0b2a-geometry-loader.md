# SP0b-2a — Geometry Loader + Area Resolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Load territorial polygon geometry (federal/local districts, sections) into `electoral_areas` as global reference via the SP0b-1 engine, with Shapefile/GeoJSON readers, plus an `area_id` resolution step binding facts (census) to territory by code.

**Architecture:** Extend the SP0b-1 engine with a `reader` hook on `DatasetSpec` (default `read_tabular`) so a `geometria` spec uses `read_features` (GeoJSON / Shapefile→reprojected GeoJSON). Geometry is written dialect-branched (Postgres `ST_GeomFromGeoJSON`, reusing `ine_service`'s pattern; SQLite stores the GeoJSON string). A standalone `resolve_area_ids` matches `territory_code`→`electoral_areas.code`.

**Tech Stack:** SQLAlchemy 2.0 + geoalchemy2/PostGIS, FastAPI, Alembic, pytest, **`pyshp`** (pure-Python shapefile read) + **`pyproj`** (CRS reproject). NO shapely (reproject by recursively transforming GeoJSON coords → fewer native deps). React frontend.

**Spec:** `docs/superpowers/specs/2026-06-19-sp0b2a-geometry-loader-design.md`

---

## Conventions
- Repo root `/mnt/c/Users/ecamp/Devs/agora-civic-intelligence`. Branch `feat/sp0b2a-geometry` (already created; do NOT switch).
- Backend tests from `backend/`: `python3 -m pytest -q`. Commit from repo root via `git -C <root>`. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Do NOT push.
- **Refinement vs spec:** drop `shapely` (spec listed it); use `pyshp` + `pyproj` only. Geometry flows as GeoJSON dicts (not WKT), written via `ST_GeomFromGeoJSON` on Postgres (reusing `app/services/ine_service.py::_feature_geometry_expr`) / JSON string on SQLite.
- Golden rule: org/scope from context, never request body. Geometry = global reference (org NULL).

## File Structure
**Create:** `backend/app/ingestion/geo_readers.py`, `backend/app/ingestion/resolve.py`, tests `backend/tests/test_geo_readers.py`, `backend/tests/test_geometria_ingest.py`, `backend/tests/test_resolve.py`.
**Modify:** `backend/requirements.txt` (+pyshp,+pyproj), `backend/app/ingestion/engine.py` (reader hook + pass db to row_mapper), `backend/app/ingestion/datasets.py` (+`geometria` spec; census mapper signature), `backend/app/models/electoral_area.py` (+ingest_run_id), `backend/alembic/versions/0005_*.py`, `scripts/ingest_file.py` (+`geometria` +`resolve` subcommands), `frontend/src/pages/MapExplorerPage.tsx` (+ level options) + `frontend/src/pages/mapMetrics.ts` if it holds the level list.

---

### Task 1: Geo readers (GeoJSON + Shapefile via pyshp/pyproj)

**Files:** Create `backend/app/ingestion/geo_readers.py`; Modify `backend/requirements.txt`; fixtures `backend/tests/fixtures/areas_min.geojson`; Test `backend/tests/test_geo_readers.py`.

- [ ] **Step 1: deps** — append to `backend/requirements.txt` under `# --- Ingestion ---`: `pyshp==2.3.1` and `pyproj==3.7.0`. Install: `cd backend && pip install pyshp==2.3.1 pyproj==3.7.0`.
- [ ] **Step 2: fixture** `backend/tests/fixtures/areas_min.geojson` (EPSG:4326):
```json
{"type":"FeatureCollection","features":[
 {"type":"Feature","properties":{"NOMBRE":"Distrito 01","CLAVE":"0901"},
  "geometry":{"type":"Polygon","coordinates":[[[-99.1,19.4],[-99.0,19.4],[-99.0,19.5],[-99.1,19.5],[-99.1,19.4]]]}}
]}
```
- [ ] **Step 3: failing test** `backend/tests/test_geo_readers.py`:
```python
from pathlib import Path
from app.ingestion.geo_readers import read_features
FIX = Path(__file__).parent / "fixtures"


def test_read_geojson_features():
    rows, header = read_features(FIX / "areas_min.geojson", name_prop="NOMBRE", code_prop="CLAVE")
    rows = list(rows)
    assert header[:3] == ["name", "code", "geometry"] or {"name", "code", "geometry"} <= set(header)
    assert rows[0]["name"] == "Distrito 01" and rows[0]["code"] == "0901"
    g = rows[0]["geometry"]
    assert g["type"] == "Polygon" and g["coordinates"][0][0] == [-99.1, 19.4]


def test_read_shapefile_reprojects(tmp_path):
    import shapefile  # pyshp
    from pyproj import CRS
    # Write a tiny shapefile in EPSG:3857 (web mercator); expect reprojection to 4326.
    w = shapefile.Writer(str(tmp_path / "s"), shapeType=shapefile.POLYGON)
    w.field("NOMBRE", "C"); w.field("CLAVE", "C")
    # 3857 coords near Mexico City (approx of -99.13,19.43)
    x, y = -11035000.0, 2206000.0
    w.poly([[[x, y], [x + 1000, y], [x + 1000, y + 1000], [x, y + 1000], [x, y]]])
    w.record("Z", "0001"); w.close()
    (tmp_path / "s.prj").write_text(CRS.from_epsg(3857).to_wkt())
    rows, _ = read_features(tmp_path / "s.shp", name_prop="NOMBRE", code_prop="CLAVE")
    g = list(rows)[0]["geometry"]
    lon, lat = g["coordinates"][0][0]
    assert -100 < lon < -98 and 19 < lat < 20  # reprojected into 4326 lon/lat near CDMX
```
- [ ] **Step 4: Run → FAIL** `cd backend && python3 -m pytest tests/test_geo_readers.py -q`.
- [ ] **Step 5: Implement** `backend/app/ingestion/geo_readers.py`:
```python
"""Geo readers: GeoJSON + Shapefile → engine rows with GeoJSON geometry (EPSG:4326)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional


def _reproject_coords(coords, transform):
    """Recursively transform a GeoJSON coordinate array with a (x,y)->(x,y) fn."""
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
    import shapefile  # pyshp, pure-python
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
        geom = sr.shape.__geo_interface__  # GeoJSON geometry in source CRS
        if transform is not None:
            geom = {"type": geom["type"], "coordinates": _reproject_coords(geom["coordinates"], transform)}
        rec = sr.record.as_dict()
        feats.append({"properties": rec, "geometry": geom})
    return _features_to_rows(feats, name_prop, code_prop, parent_prop)


def read_features(path, *, name_prop=None, code_prop=None, parent_prop=None):
    suffix = Path(path).suffix.lower()
    if suffix in (".geojson", ".json"):
        return read_geojson(path, name_prop=name_prop, code_prop=code_prop, parent_prop=parent_prop)
    if suffix in (".shp",):
        return read_shapefile(path, name_prop=name_prop, code_prop=code_prop, parent_prop=parent_prop)
    raise ValueError(f"Unsupported geo format: {suffix}")
```
- [ ] **Step 6: Run → PASS** targeted, then FULL suite `python3 -m pytest -q`.
- [ ] **Step 7: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add backend/app/ingestion/geo_readers.py backend/requirements.txt backend/tests/fixtures/areas_min.geojson backend/tests/test_geo_readers.py
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b2a): geo readers — GeoJSON + Shapefile (pyshp+pyproj reproject to 4326)"
```

---

### Task 2: Engine reader hook + pass db to row_mapper

**Files:** Modify `backend/app/ingestion/engine.py`, `backend/app/ingestion/datasets.py`; Test append to `backend/tests/test_ingestion_engine.py`.

- [ ] **Step 1: Failing test** — append:
```python
def test_engine_reader_hook_used():
    from app.ingestion.datasets import DatasetSpec
    from app.ingestion.validation import ColumnSpec
    from app.models.census import CensusMetric
    calls = {"n": 0}
    def fake_reader(path):
        calls["n"] += 1
        return [{"nivel": "estado", "clave": "01", "indicador": "X", "valor": "5"}], ["nivel","clave","indicador","valor"]
    spec = DatasetSpec(key="census", model=CensusMetric,
                       columns=[ColumnSpec("clave", required=True), ColumnSpec("valor", required=True, coerce="number")],
                       row_mapper=DATASETS["census"].row_mapper, scope_filter=DATASETS["census"].scope_filter,
                       reader=fake_reader)
    db = TestingSessionLocal()
    try:
        run_ingest(db, _Ctx(), spec, "ignored.csv", source=None, extra={"anio": 2020})
        assert calls["n"] == 1
    finally:
        from app.models.ingestion import IngestRun
        db.query(CensusMetric).delete(); db.query(IngestRun).delete(); db.commit(); db.close()
```
- [ ] **Step 2: Run → FAIL** (DatasetSpec has no `reader`; row_mapper signature mismatch).
- [ ] **Step 3: Implement** — in `datasets.py`, add `reader` field to `DatasetSpec` (default = `read_tabular`):
```python
from app.ingestion.readers import read_tabular
# in the dataclass:
    reader: Callable = read_tabular   # (path) -> (rows, header)
```
Change census `row_mapper` + `scope_filter` to accept a trailing `db=None` param (so the engine can pass db uniformly): `def _census_mapper(row, ctx, run, extra, db=None):` (body unchanged). `_census_scope(model, ctx, extra)` stays (no db needed). In `engine.py`:
- replace `rows, _header = read_tabular(file_path)` with `rows, _header = spec.reader(file_path)`.
- replace the row build `spec.model(**spec.row_mapper(r, ctx, run, extra))` with `spec.model(**spec.row_mapper(r, ctx, run, extra, db))` (pass db).
- import `read_tabular` stays for the default in datasets.
- [ ] **Step 4: Run → PASS** + FULL suite (census still works via default-reader path AND the hook).
- [ ] **Step 5: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add backend/app/ingestion/engine.py backend/app/ingestion/datasets.py backend/tests/test_ingestion_engine.py
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b2a): engine reader hook on DatasetSpec + pass db to row_mapper (backward-compatible)"
```

---

### Task 3: ElectoralArea.ingest_run_id + Alembic 0005

**Files:** Modify `backend/app/models/electoral_area.py`; Create `backend/alembic/versions/0005_area_ingest_run.py`; Test `backend/tests/test_territory_hierarchy.py` (append).

- [ ] **Step 1: Failing test** — append to `test_territory_hierarchy.py`:
```python
def test_area_has_ingest_run_id():
    from app.models.electoral_area import ElectoralArea
    assert "ingest_run_id" in {c.name for c in ElectoralArea.__table__.columns}
    assert ElectoralArea.__table__.c.ingest_run_id.nullable is True
```
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — add to `ElectoralArea` (after the other columns):
```python
    ingest_run_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("ingest_runs.id", ondelete="SET NULL"), index=True, nullable=True
    )
```
(`String`, `ForeignKey`, `Optional`, `Mapped`, `mapped_column` already imported.) conftest already `create_all`s ElectoralArea (the new column is picked up automatically; ensure `ingest_runs` table is created before — it is, from SP0b-1's conftest additions). If FK ordering on SQLite create_all complains, it won't (SQLite defers FK). 
- [ ] **Step 4: Alembic 0005** — `backend/alembic/versions/0005_area_ingest_run.py` (`revision="0005"`, `down_revision="0004"`): `upgrade()` `op.add_column("electoral_areas", sa.Column("ingest_run_id", sa.String(36), sa.ForeignKey("ingest_runs.id", ondelete="SET NULL"), nullable=True))` + `op.create_index("ix_electoral_areas_ingest_run_id", "electoral_areas", ["ingest_run_id"])`. `downgrade()` drops the index + column. Mirror 0004's dialect-safe style (batch mode for SQLite if the existing revisions use `render_as_batch`/`with op.batch_alter_table` — check 0002's add_column approach and match it; SQLite ALTER ADD COLUMN with FK may need batch_alter_table).
- [ ] **Step 5: Verify** — `python3 -m pytest -q` green; `DATABASE_URL=sqlite:///./scratch_0005.db python3 -m alembic upgrade head && DATABASE_URL=sqlite:///./scratch_0005.db python3 -m alembic downgrade base && rm -f scratch_0005.db`.
- [ ] **Step 6: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add backend/app/models/electoral_area.py backend/alembic/versions/0005_area_ingest_run.py backend/tests/test_territory_hierarchy.py
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b2a): ElectoralArea.ingest_run_id (traceability) + Alembic 0005"
```

---

### Task 4: `geometria` DatasetSpec + CLI subcommand

**Files:** Modify `backend/app/ingestion/datasets.py`, `scripts/ingest_file.py`; Test `backend/tests/test_geometria_ingest.py`.

- [ ] **Step 1: Failing test** `backend/tests/test_geometria_ingest.py`:
```python
from pathlib import Path
from app.ingestion.engine import run_ingest
from app.ingestion.datasets import DATASETS
from app.models.electoral_area import ElectoralArea, AreaLevel
from app.models.ingestion import IngestRun
from tests.conftest import TestingSessionLocal
FIX = Path(__file__).parent / "fixtures"


class _Ctx:
    organization_id = None
    campaign_id = None
    is_superadmin = True
    class user:  # noqa
        id = "tester"


def test_geometria_ingest_creates_areas_on_sqlite():
    db = TestingSessionLocal()
    try:
        spec = DATASETS["geometria"]
        res = run_ingest(db, _Ctx(), spec, FIX / "areas_min.geojson", source=None,
                         extra={"level": "distrito_federal", "name_prop": "NOMBRE", "code_prop": "CLAVE"}, replace=True)
        assert res.inserted == 1
        a = db.query(ElectoralArea).filter(ElectoralArea.code == "0901").one()
        assert a.level == AreaLevel.DISTRITO_FEDERAL
        assert a.organization_id is None  # global reference
        assert a.geometry is not None  # WKT/GeoJSON text on sqlite
        assert a.ingest_run_id == res.run_id
    finally:
        db.query(ElectoralArea).delete(); db.query(IngestRun).delete(); db.commit(); db.close()
```
- [ ] **Step 2: Run → FAIL** (no `geometria` spec).
- [ ] **Step 3: Implement** — in `datasets.py` add a geometry mapper + spec. The reader must be parameterized by name/code props from `extra`; since `DatasetSpec.reader` is `(path)->(rows,header)`, wrap: the geometria spec's reader reads props from a closure is awkward — instead, make the geometria reader a small function that pulls prop names from a module-level default and let the ROW MAPPER read name/code from the already-mapped row keys. Simplest: the geometria reader calls `read_features(path, name_prop=..., code_prop=...)` — but it needs `extra`. Resolve by having the engine pass `extra` to the reader too OR set props via a fixed convention. CLEANEST: extend the reader hook to `spec.reader(file_path, extra)` (update engine + census default reader to accept/ignore extra). Then:
```python
from app.ingestion.geo_readers import read_features
from app.models.electoral_area import ElectoralArea, AreaLevel
from sqlalchemy import func
import json


def _geo_reader(path, extra):
    return read_features(path, name_prop=extra.get("name_prop", "name"),
                         code_prop=extra.get("code_prop", "code"),
                         parent_prop=extra.get("parent_prop"))


def _geometria_mapper(row, ctx, run, extra, db=None):
    geom = row.get("geometry")
    dialect = db.get_bind().dialect.name if db is not None else "sqlite"
    if dialect == "postgresql" and geom:
        geometry = func.ST_SetSRID(func.ST_GeomFromGeoJSON(json.dumps(geom)), 4326)
    else:
        geometry = json.dumps(geom) if geom else None
    return dict(
        organization_id=None, ingest_run_id=run.id,
        level=AreaLevel(extra["level"]), name=row["name"], code=row["code"], geometry=geometry,
    )


def _geometria_scope(model, ctx, extra):
    return [model.organization_id.is_(None), model.level == AreaLevel(extra["level"])]


DATASETS["geometria"] = DatasetSpec(
    key="geometria", model=ElectoralArea,
    columns=[ColumnSpec("code", required=True)],
    row_mapper=_geometria_mapper, scope_filter=_geometria_scope, reader=_geo_reader,
)
```
And update the engine reader call to `rows, _header = spec.reader(file_path, extra)` and the default `read_tabular` wrapper / census to accept `extra` — make `DatasetSpec.reader` signature `(path, extra)`; change the default to `lambda path, extra: read_tabular(path)`. (Update Task 2's test's `fake_reader` note: it takes `(path)` — adjust the engine to call `spec.reader(file_path, extra)` and make fake_reader accept `extra`; since Task 2 is earlier, define the reader signature as `(path, extra)` from the start in Task 2 to avoid rework — SEE NOTE.) **NOTE for the implementer:** define the reader hook signature as `reader(path, extra)` in Task 2 (default `lambda path, extra: read_tabular(path)`), so Task 4 needs no engine change. Update Task 2's `fake_reader` to `def fake_reader(path, extra):`.
  - **parent resolution** (optional, if `parent_prop`/`parent_level` in extra): after insert, or in the mapper, look up parent by code+level and set parent_id + redundant FK. For SP0b-2a keep it minimal: if `row["parent_code"]` and `extra.get("parent_level")`, the mapper queries `db` for the parent area and sets `parent_id`. Implement only if `db` is available; else skip. (Document that full parent wiring is best-effort.)
- [ ] **Step 4: CLI** — add a `geometria` subcommand to `scripts/ingest_file.py`: flags `--file`, `--level`, `--name-prop`, `--code-prop`, `--parent-prop`, `--source`, `--global`/`--org`, `--replace`. Calls `ingest(dataset="geometria", file=..., extra={"level":..., "name_prop":..., "code_prop":..., "parent_prop":...}, ...)`. (Generalize the existing `ingest()` to accept an `extra` dict instead of just `anio`; census passes `extra={"anio":...}`.)
- [ ] **Step 5: Run → PASS** targeted + FULL suite.
- [ ] **Step 6: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add backend/app/ingestion/datasets.py backend/app/ingestion/engine.py scripts/ingest_file.py backend/tests/test_geometria_ingest.py
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b2a): geometria DatasetSpec (dialect geometry write) + CLI subcommand"
```

---

### Task 5: `area_id` resolution + CLI `resolve`

**Files:** Create `backend/app/ingestion/resolve.py`; Modify `scripts/ingest_file.py`; Test `backend/tests/test_resolve.py`.

- [ ] **Step 1: Failing test** `backend/tests/test_resolve.py`:
```python
from app.ingestion.resolve import resolve_area_ids
from app.models.electoral_area import ElectoralArea, AreaLevel
from app.models.census import CensusMetric
from tests.conftest import TestingSessionLocal


def test_resolve_sets_area_id_on_match():
    db = TestingSessionLocal()
    try:
        area = ElectoralArea(name="Edomex", level=AreaLevel.ESTADO, code="15", organization_id=None)
        db.add(area); db.flush()
        m1 = CensusMetric(organization_id=None, anio=2020, nivel="estado", territory_code="15", indicador="POBTOT", valor=1)
        m2 = CensusMetric(organization_id=None, anio=2020, nivel="estado", territory_code="99", indicador="POBTOT", valor=2)
        db.add_all([m1, m2]); db.commit()
        result = resolve_area_ids(db, CensusMetric, {"estado": AreaLevel.ESTADO})
        db.refresh(m1); db.refresh(m2)
        assert m1.area_id == area.id and m2.area_id is None
        assert result.matched == 1 and result.unmatched == 1
    finally:
        db.query(CensusMetric).delete(); db.query(ElectoralArea).delete(); db.commit(); db.close()
```
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `backend/app/ingestion/resolve.py`:
```python
"""Resolve fact rows' area_id by matching territory_code -> electoral_areas.code."""
from __future__ import annotations

from dataclasses import dataclass
from sqlalchemy import select
from app.models.electoral_area import ElectoralArea


@dataclass
class ResolveResult:
    matched: int
    unmatched: int


def resolve_area_ids(db, fact_model, level_map) -> ResolveResult:
    """For fact rows with area_id IS NULL, set area_id where territory_code matches
    a global electoral_areas.code at the level mapped from the fact's `nivel`."""
    rows = db.execute(select(fact_model).where(fact_model.area_id.is_(None))).scalars().all()
    matched = unmatched = 0
    # cache code->id per level
    cache: dict[tuple, str] = {}
    for r in rows:
        level = level_map.get(r.nivel)
        if level is None:
            unmatched += 1
            continue
        key = (level, r.territory_code)
        if key not in cache:
            area = db.execute(
                select(ElectoralArea).where(
                    ElectoralArea.organization_id.is_(None),
                    ElectoralArea.level == level,
                    ElectoralArea.code == r.territory_code,
                )
            ).scalars().first()
            cache[key] = area.id if area else None
        area_id = cache[key]
        if area_id:
            r.area_id = area_id; matched += 1
        else:
            unmatched += 1
    db.commit()
    return ResolveResult(matched=matched, unmatched=unmatched)
```
- [ ] **Step 4: CLI** — add a `resolve` subcommand to `scripts/ingest_file.py`: `--dataset census` → maps to `(CensusMetric, {"estado":AreaLevel.ESTADO, "municipio":AreaLevel.MUNICIPIO, "localidad":AreaLevel.SECCION})` (adapt localidad mapping as appropriate; for now estado+municipio), calls `resolve_area_ids`, prints matched/unmatched.
- [ ] **Step 5: Run → PASS** + FULL suite.
- [ ] **Step 6: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add backend/app/ingestion/resolve.py scripts/ingest_file.py backend/tests/test_resolve.py
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b2a): area_id resolution (territory_code -> electoral_areas.code) + CLI resolve"
```

---

### Task 6: Frontend — map level options for districts/sections

**Files:** Modify `frontend/src/pages/MapExplorerPage.tsx` (and `frontend/src/pages/mapMetrics.ts` if the level list lives there).

- [ ] **Step 1:** Read `MapExplorerPage.tsx` to find the level selector (today: state/municipality). Add options `distrito_federal`, `distrito_local`, `seccion` (labels "Distrito Federal", "Distrito Local", "Sección") to the level control — they flow through `/api/maps/areas?level=` already. Empty levels return empty → existing `DataState`/empty handling covers it (no crash). Keep the default level (state) unchanged.
- [ ] **Step 2: Verify** `cd frontend && rm -rf dist && find . -maxdepth 1 -name '*.tsbuildinfo' -delete; npm run lint && npm run build` → PASS. Reason: selecting a new level requests areas at that level; renders when data exists, empty otherwise.
- [ ] **Step 3: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add frontend/src/pages/MapExplorerPage.tsx frontend/src/pages/mapMetrics.ts
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b2a): map level options for districts/sections"
```

---

### Task 7: Gate + memory

- [ ] **Step 1:** Full backend `cd backend && python3 -m pytest -q` → green. Frontend `npm run lint && npm run build` → green. Alembic round-trip (0001→0005 up/down/up) on scratch SQLite → clean.
- [ ] **Step 2:** CLI smoke (SQLite scratch): `DATABASE_URL=sqlite:///./scratch.db python3 -m alembic upgrade head` then from repo root `DATABASE_URL=sqlite:///./scratch.db python3 scripts/ingest_file.py geometria --file backend/tests/fixtures/areas_min.geojson --global --level distrito_federal --name-prop NOMBRE --code-prop CLAVE --source "INE MG" --replace` → success inserted=1; then `... resolve --dataset census` runs. Clean up scratch.db.
- [ ] **Step 3:** Update memory `memory/sp0b2a-geometry.md` (geo readers pyshp/pyproj, engine reader hook signature `reader(path, extra)`, geometria spec dialect geometry write, ElectoralArea.ingest_run_id + Alembic 0005, resolve_area_ids, map levels; note shapely dropped) + MEMORY.md pointer. Note SP0b-2b (results/socio/DENUE + casilla points) next.
- [ ] **Step 4:** Hand back for merge + deploy (Railway runs Alembic 0005 + the new pyproj/pyshp native deps build — watch the build). Do NOT push without user say-so.

---

## Self-Review (completed during authoring)
- **Spec coverage:** §5.1 deps→T1; §5.2 geo readers→T1; §5.3 geometry DatasetSpec + ElectoralArea.ingest_run_id→T3,T4; §5.4 engine reader hook→T2; §5.5 resolution→T5; §5.6 frontend→T6; §6 data flow→T4/T5/T7 smoke; §7 edge cases: missing .prj (geo_readers warns/assumes 4326), invalid geometry (Postgres ST_GeomFromGeoJSON validates; sqlite stores text), SQLite text geometry (T4 test), --replace by level (T4 scope_filter), parent best-effort (T4), resolution unmatched counted (T5); §8 testing→per-task; §9 rollout→task order.
- **Placeholder scan:** no TBD/TODO. The reader-hook signature decision (`reader(path, extra)`) is fixed explicitly in Task 2 with a NOTE so Task 4 needs no rework. Alembic 0005 add_column gives exact ops (batch mode flagged for SQLite). CLI/frontend give concrete flag/option lists.
- **Type/name consistency:** `read_features(path, *, name_prop, code_prop, parent_prop)`, `DatasetSpec.reader(path, extra)`, `_geometria_mapper(row,ctx,run,extra,db)`, `resolve_area_ids(db, fact_model, level_map) -> ResolveResult{matched,unmatched}`, `AreaLevel.DISTRITO_FEDERAL`, `extra` keys (level/name_prop/code_prop/parent_prop/anio), `ingest()` generalized to take `extra` — consistent across tasks. census mapper/scope updated to the `extra`/`db` signatures in T2.
- **Known risk:** pyproj native build on Railway/Nixpacks (manylinux wheels usually fine) — flagged for the deploy gate (T7/handback). shapely intentionally dropped to reduce native-dep surface.
