# SP0b-2a — Geometry Loader + Area Resolution — Design Spec

**Date:** 2026-06-19
**Status:** Approved (design) — pending spec review
**Parent:** SP0b sliced (SP0b-1 ingestion engine shipped). This is SP0b-2 sliced into SP0b-2a (spatial foundation).
**Builds on:** SP0b-1 engine (`run_ingest`, `DatasetSpec`, `IngestRun`), SP0a territory (`ElectoralArea` hierarchy, global reference), SP0b-1 census (`CensusMetric.territory_code`/`area_id`).
**Scope:** Backend (ingestion engine extension + geo readers + resolution) + minimal frontend (map level options).

## 1. Goal
Load real territorial geometry (federal/local districts and electoral sections) into `electoral_areas` as global reference via the SP0b-1 engine, and add an `area_id` resolution step that binds tidy facts (starting with census) to the canonical territory by code. Adds Shapefile + GeoJSON geo readers. Unblocks district/section map layers.

## 2. Locked decisions (brainstorming 2026-06-19)
1. **Slice:** SP0b-2a = geometry loader + geo readers (Shapefile/GeoJSON) + `area_id` resolution + map level options. SP0b-2b = tidy facts (election results [global reference, keyed to election identity], socioeconomic, DENUE [Point geometry from file lat/lon, no geocoder], casilla points).
2. **Approach (A):** extend the SP0b-1 engine with a geometry `DatasetSpec` + geo readers, so geometry ingest is governed/traceable via `IngestRun` (not a separate pipeline).
3. **Geo formats:** Shapefile (`pyshp` + `pyproj` reproject to WGS84 + `shapely` for WKT) and GeoJSON. KML deferred.
4. **Geometry scope here:** polygon territory (distrito_federal, distrito_local, seccion) as global reference. Casilla points deferred to SP0b-2b.

## 3. Non-Goals (deferred)
- Election results / socioeconomic / DENUE loaders → SP0b-2b.
- Casilla point geometry + the point-geometry pattern → SP0b-2b (with DENUE).
- KML reader. Address geocoding. Topology repair/validation beyond basic validity.
- A geometry-editing UI. (Cartography is ingested, not authored in-app.)

## 4. Current baseline (relevant)
- `ElectoralArea` (`app/models/electoral_area.py`): nullable `organization_id` (NULL=global reference), `name`, `code`, `level` (AreaLevel incl. distrito_federal/distrito_local/seccion/casilla), `geometry` (PostGIS `Geometry('GEOMETRY', 4326)` on Postgres, Text on SQLite via dialect branch), `parent_id` + redundant FKs (estado_id/municipio_id/distrito_federal_id/distrito_local_id/seccion_id). No `ingest_run_id` on ElectoralArea today.
- SP0b-1 engine `run_ingest(db, ctx, spec, file_path, *, source, extra, replace)` is ROW-oriented; readers return `(rows, header)`. `DatasetSpec{key, model, columns, row_mapper, scope_filter}`. `IngestRun` traceability.
- `scripts/ingest_ine.py cartografia` already ingests GeoJSON → electoral_areas (reference pattern for geometry writing + server-side simplification in `map_service`).
- `/api/maps/areas?level=` already filters by level + simplifies geometry; frontend `MapCanvas`/`MapExplorerPage` render area layers.
- Backend tests: 94 passing.

## 5. Architecture

### 5.1 New dependencies (backend)
`pyshp` (shapefile read), `pyproj` (CRS reproject), `shapely` (geometry → WKT, validity). **Risk:** `pyproj`/`shapely` ship native libs (PROJ/GEOS); the Nixpacks/Railway build must include them — verify the deploy builds (these have manylinux wheels, usually fine, but confirm on first deploy). Added to `backend/requirements.txt`; imported LAZILY in the geo reader so the rest of the app/tests don't hard-depend on them.

### 5.2 Geo readers (`app/ingestion/geo_readers.py`)
- `read_geojson(path) -> list[Feature]` where `Feature = {props: dict, geometry_wkt: str}` (geometry assumed EPSG:4326; pass through to WKT via `shapely.geometry.shape` → `.wkt`).
- `read_shapefile(path) -> list[Feature]`: open with `pyshp` (`shapefile.Reader`); read the sibling `.prj` to get the source CRS WKT; build a `pyproj.Transformer(source_crs, "EPSG:4326", always_xy=True)`; for each shape, reproject coordinates and build a `shapely` geometry → `.wkt`; props from the `.dbf` record. Accept a `.zip` bundle (extract to temp) or a `.shp` with siblings present. If `.prj` is absent, assume EPSG:4326 and log a warning (recorded in IngestRun error_summary).
- A common `read_features(path) -> list[Feature]` dispatcher by extension (`.shp`/`.zip` → shapefile, `.geojson`/`.json` → geojson).
- Output rows for the engine: each Feature → a flat dict `{name, code, parent_code, geometry}` where `name`/`code`/`parent_code` are pulled from configurable property names (via `--map`/spec column_map), and `geometry` is WKT.

### 5.3 Geometry DatasetSpec + ElectoralArea adaptation
- Add `ingest_run_id` (nullable FK ingest_runs SET NULL, indexed) to `ElectoralArea` for geometry-load traceability (Alembic migration). 
- A `geometria` `DatasetSpec` variant: because the engine is row-oriented and ElectoralArea geometry needs special handling (WKT → geometry column; PostGIS vs Text), the engine gains a thin hook: the `DatasetSpec` may declare `pre_read` (use `read_features` instead of `read_tabular`) and the `row_mapper` builds `ElectoralArea(level=<from extra>, name=row["name"], code=row["code"], organization_id=None, ingest_run_id=run.id, geometry=<wkt or geometry element>, parent_id=<resolved by parent_code if present>)`.
  - Geometry write: on Postgres, pass WKT via `geoalchemy2`'s `WKTElement(wkt, srid=4326)` (or `func.ST_GeomFromText(wkt, 4326)`); on SQLite (Text column) store the WKT string directly. Branch on dialect (mirror `electoral_area.py`'s existing dialect branch).
  - `level` is supplied per-ingest via `extra={"level": "seccion"}` (one file = one level), like the existing `ingest_ine.py cartografia --level`.
  - `parent_id` resolution: if `parent_code` present, look up the parent ElectoralArea by `(code, level=parent_level)`; set `parent_id` + the matching redundant FK (e.g. seccion → municipio_id). Best-effort; unresolved parent → NULL (counted).
- `--replace` scope for geometry: by `(organization_id IS NULL, level)` → re-ingesting a level replaces that level's global cartography.

### 5.4 Engine hook (minimal, backward-compatible)
Extend `DatasetSpec` with an optional `reader` callable (default = `read_tabular`). `run_ingest` calls `spec.reader(file_path)` instead of hard-coding `read_tabular`. The `census` spec keeps the default; `geometria` sets `reader=read_features`. Validation still runs (geometry specs validate required props like `code`). This keeps geometry ingest inside the same governed `run_ingest` flow (IngestRun, counts, --replace, failure recording).

### 5.5 Area resolution (`app/ingestion/resolve.py` + CLI)
- `resolve_area_ids(db, fact_model, level_map) -> ResolveResult{matched, unmatched}`: for rows in `fact_model` with `area_id IS NULL`, match `fact.territory_code` → `electoral_areas.code` where `electoral_areas.level == level_map[fact.nivel]` and `organization_id IS NULL` (global) ; set `area_id`. Count matched/unmatched. Batched.
- CLI: `scripts/ingest_file.py resolve --dataset census` → runs resolution for census_metrics (nivel "estado"→estado, "municipio"→municipio, "localidad"→... ); prints matched/unmatched. (No new IngestRun for resolution; it logs counts. Could attach to an IngestRun later — YAGNI now.)

### 5.6 Frontend (minimal)
- Map Explorer's level selector exposes `distrito_federal` / `distrito_local` / `seccion` options (they already flow through `/api/maps/areas?level=`); show them when areas of that level exist (or just add the options — empty levels return empty + DataState handles it). No new components; reuse the existing map level UI.

## 6. Data flow
1. Admin (CLI, bulk via railway ssh) runs `ingest_file.py geometria --file distritos_federales.shp --global --level distrito_federal --source "INE Marco Geografico" --map name=NOMBRE code=CLAVE [--replace]` → geo reader reproject→WKT → `run_ingest` writes ElectoralArea rows (global) tagged with the IngestRun → IngestRun records counts.
2. Repeat per level (distrito_local, seccion), parents resolved by code.
3. `ingest_file.py resolve --dataset census` → census rows get `area_id` set where codes match.
4. Map Explorer shows the new levels; facts can join to areas via `area_id`.

## 7. Error handling & edge cases
- **Missing `.prj`:** assume 4326, warn in IngestRun.error_summary (don't fail).
- **Invalid geometry:** `shapely` validity check; invalid features counted as discards (not silently dropped); optionally `.buffer(0)` to fix simple self-intersections (log when applied).
- **Reprojection failure** (unknown CRS): record FAILED run with the CRS string in error_summary.
- **SQLite tests:** geometry column is Text → store WKT string; geo-reader tests use a tiny GeoJSON in 4326 + a programmatically-built shapefile; PostGIS-specific WKTElement path is dialect-guarded and validated manually/prod.
- **Large shapefiles** (secciones ~68k): batched insert (engine already batches at 5000); run via CLI/railway ssh, not HTTP.
- **--replace by level** must not delete other levels or tenant custom areas (scope: org IS NULL AND level==X).
- **parent resolution** unresolved → NULL, counted; never fabricated.
- **area_id resolution** ambiguity (same code at multiple levels) avoided by filtering on the mapped level.

## 8. Testing & verification
- pytest: geo_readers (GeoJSON→WKT; shapefile built in-test via pyshp + a known CRS reprojected to 4326 — assert coords transformed); geometry DatasetSpec end-to-end on SQLite (features → ElectoralArea rows with WKT text + level + ingest_run_id; --replace by level idempotent; parent_code resolution sets parent_id); `resolve_area_ids` (census rows matched/unmatched counts; area_id set only on matches); engine `reader` hook backward-compat (census still uses read_tabular). Keep suite green (94 → +N). `pyproj`/`shapely`/`pyshp` available in the test env (pip install).
- Alembic: revision adds `electoral_areas.ingest_run_id`; round-trip on scratch SQLite.
- Frontend: `npm run lint`/`build`; map level options present.
- Manual/prod: ingest a real INE shapefile via railway ssh; verify reprojected geometry renders on the map; verify deploy builds with the new native deps.

## 9. Rollout (within SP0b-2a)
1. Add deps + `geo_readers.py` (GeoJSON + Shapefile) + tests.
2. Engine `reader` hook (backward-compatible) + tests.
3. `ElectoralArea.ingest_run_id` + Alembic revision.
4. `geometria` DatasetSpec (dialect-guarded geometry write, level via extra, parent resolution) + CLI `geometria` subcommand + tests.
5. `resolve.py` + CLI `resolve` subcommand + tests.
6. Frontend map level options.
7. Gate (pytest + alembic round-trip + frontend build) + memory.
Each step: subagent-driven, TDD, reviewed; branch `feat/sp0b2a-geometry`. Deploy via main→Railway when green (watch native-dep build).

## 10. Open questions (resolve in plan, not blocking)
- Exact reprojection lib call shape (pyproj Transformer from .prj WKT) — confirm in plan.
- Whether to attach resolution to an IngestRun (deferred; counts printed for now).
- `.zip` shapefile bundle handling (extract to temp) vs requiring unzipped `.shp` + siblings — support `.zip` for CLI convenience.
- Property-name mapping defaults per INE source (via `--map`).
