# File Ingestion Pipeline — Design

**Date:** 2026-06-16
**Status:** Approved (design)
**Author:** Ágora / Atlas Tech

## Problem

Eight platform modules are stuck in "preview" (sample fixtures) not because of
missing code, but because their external APIs are unreachable from Railway:
DataMéxico/apielectoral DNS fails, datos.gob.mx has a broken SSL chain, and
INEGI/DENUE/Banxico require tokens. The reliable path to make these modules
**real** is to ingest user-provided files (CSV/Excel/Shapefile/GeoJSON).

This spec covers a generic, CLI-driven ingestion pipeline that converts four
priority datasets from preview → real:

1. **Resultados Electorales** (cómputos)
2. **Demografía & Censo** (INEGI Census 2020)
3. **Unidades Económicas** (DENUE)
4. **Geometría de mapa** (distritos / secciones — INE Marco Geográfico)

Out of scope (deferred, stay preview until a source is defined): Economía
Territorial, Macro-financiero (Banxico), Índice Cívico-Territorial, AI Analyst
(AI parked per user directive — no LLM work yet).

## Decisions (locked)

- **Storage:** dedicated typed tables per dataset (Option A).
- **Ingestion mechanism:** extended CLI run via `railway ssh` (Option A). No HTTP
  upload endpoint (files can be hundreds of MB; `railway up` fails for this
  project; PostGIS has no public TCP proxy).
- **Geometry formats:** support both Shapefile (new `pyshp` dep + reprojection to
  WGS84) and GeoJSON (existing path) (Option A).
- **Frontend behavior:** real endpoints from day one; empty DB → honest
  `DataState` "Ingesta pendiente". Sample fixtures removed for the three data
  modules (Option A).

## Architecture

```
CSV/Excel/Shapefile  →  parser+validator  →  dedicated table  →  service  →  router  →  frontend module
   (data/incoming/)      (app/ingestion/)     (SQLAlchemy)       (queries)   (/api/*)    (DataState)
```

Three clean, independently testable layers, mirroring existing patterns
(`analytics_service`/`audit_service`, `ingest_ine.py`):

- **Ingestion** (`backend/app/ingestion/` + `scripts/ingest_file.py`): read file,
  map columns, validate, idempotent bulk insert (`--replace` by scope).
- **Models**: one typed table per dataset, with Atlas-canon mixins
  (UUID / Tenant / Audit) so they respect tenant-scoping and auditing like
  everything else.
- **Service + router**: tenant-scoped queries and aggregations.
- **Frontend**: module reads the real endpoint; empty DB → `DataState`.

## Data Model

All tables use the Atlas-canon mixins (UUID `id`, `org_id` tenant FK,
created/updated/audit timestamps).

### a) `election_results` — tidy (one row per territory+party)

Parties vary per election, so a tidy/long shape keeps it typed and normalized.

| column | type | notes |
|---|---|---|
| id | UUID | PK |
| org_id | UUID | tenant |
| eleccion | text | e.g. "2024-presidencial" |
| nivel | text | estado \| municipio \| distrito \| seccion |
| entidad | text | |
| municipio | text | nullable |
| distrito | text | nullable |
| seccion | text | nullable |
| partido | text | |
| votos | int | |
| lista_nominal | int | nullable |
| total_validos | int | nullable |

Index: `(nivel, entidad, municipio, eleccion)`.

### b) `census_metrics` — tidy (one row per territory+indicator)

The Census has hundreds of indicators; fixed columns are unmanageable.

| column | type | notes |
|---|---|---|
| id | UUID | PK |
| org_id | UUID | tenant |
| anio | int | e.g. 2020 |
| nivel | text | estado \| municipio \| localidad |
| entidad | text | |
| municipio | text | nullable |
| localidad | text | nullable |
| indicador | text | e.g. "POBTOT" |
| valor | numeric | |

Index: `(nivel, entidad, municipio, indicador)`.

### c) `economic_units` (DENUE) — fixed columnar + geometry

Each row is a business with a stable schema; add a Point geometry for the map.

| column | type | notes |
|---|---|---|
| id | UUID | PK |
| org_id | UUID | tenant |
| nombre | text | |
| clase_actividad | text | |
| codigo_actividad | text | nullable |
| estrato | text | size band |
| entidad | text | |
| municipio | text | nullable |
| localidad | text | nullable |
| lat | float | |
| lon | float | |
| geom | Geometry(Point) | for Map Explorer |

Index: `(entidad, municipio)`; spatial index on `geom`.

### d) Geometry (distritos/secciones)

Reuse the existing `electoral_areas` table (already stores `level` + `geom`).
Ingest new levels `district` and `section`; **no new table**.

## Ingestion Layer (CLI)

New `backend/app/ingestion/` package with reusable parsers, driven by
`scripts/ingest_file.py`:

```
ingest_file.py resultados --file <csv> --org atlas --eleccion 2024-presidencial --map <col-mapping> [--replace]
ingest_file.py censo      --file <csv|xlsx> --org atlas --anio 2020 [--replace]
ingest_file.py denue      --file <csv> --org atlas [--replace]
ingest_file.py geometria  --file <zip|geojson> --org atlas --level district --name-prop <p> [--code-prop <p>] [--replace]
```

- **Readers**: CSV (encoding autodetect, latin-1/cp1252 fallback — bit us with
  IEEM), Excel (`openpyxl`), Shapefile (`pyshp` + reproject to WGS84), GeoJSON
  (existing).
- **Configurable column mapping** via `--map` or a small per-dataset preset, to
  tolerate differing column names across sources.
- **Idempotent**: `--replace` deletes by scope (org + eleccion/anio/level) before
  insert, like `ingest_ine.py --replace`.
- **Bulk insert** in batches for large files; runs via `railway ssh` inside the
  container (private networking to PostGIS).
- Files staged under `data/incoming/` (gitignored for large files; small test
  fixtures live under tests).

## API + Frontend

- **New routers**: `/api/resultados`, `/api/census`, `/api/denue` — tenant-scoped,
  paginated, filters by nivel/entidad/municipio + aggregation endpoints for
  charts. DENUE additionally exposes GeoJSON for the map.
- **New services**: `results_service`, `census_service`, `denue_service`
  (pattern: `analytics_service`).
- **Frontend**: modules Resultados / Demografía / DENUE point at the real
  endpoints; empty DB → `DataState` "Ingesta pendiente — sube el CSV". Remove the
  sample fixtures for these three. Map Explorer gains district/section layers once
  `electoral_areas` has those levels; DENUE points layer when data exists.

## Error Handling & Testing

- **Ingestion errors**: pre-validate (required columns, types); report discarded
  rows with explicit counts/logs (no silent truncation); transaction per batch.
- **API**: 502/empty degrade via `DataState`, consistent with the rest.
- **Tests** (keep the suite green — 63 today):
  - parser tests (small CSV/Excel/Shapefile fixtures);
  - service tests (tenant-scoped aggregations on SQLite; geometry→Text as
    conftest already does);
  - router tests (auth + scoping).

## Deployment Notes

- Deploy via GitHub push (not `railway up`).
- Ingest in prod: `railway ssh --service Agora /opt/venv/bin/python /app/scripts/ingest_file.py <subcmd> ...`.
- New dep `pyshp` (and `openpyxl` if not present) added to backend requirements;
  verify the Nixpacks build picks them up.

## Follow-on work (separate from this spec)

Per user request, after the pipeline: backend hardening (Alembic baseline, login
rate-limiting, token refresh), confirm SIGE WMS endpoint, visual polish pass.
