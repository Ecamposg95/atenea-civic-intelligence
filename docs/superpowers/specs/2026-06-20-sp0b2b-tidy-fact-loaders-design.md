# SP0b-2b — Tidy Fact Loaders (ElectionResult, SocioMetric, DENUE, Casillas)

**Date:** 2026-06-20
**Status:** Design approved
**Builds on:** SP0b-1 (ingestion engine + governance), SP0b-2a (geometry loader + `area_id` resolution), SP0a (territory hierarchy + catalogs).
**Program context:** `docs/superpowers/specs/2026-06-18-electoral-intelligence-platform-program-design.md` §3.3 (reference facts).

## 1. Goal

Add the remaining batch-ingested **reference fact** loaders on top of the existing
ingestion engine, turning four preview modules into real data-backed modules:

1. **ElectionResult** — historical electoral results (votes per territory + election + party).
2. **SocioMetric** — socioeconomic indicators (marginación, pobreza, ingreso, servicios…).
3. **economic_units (DENUE)** — economic units as map points built from file lat/lon.
4. **Casillas** — polling-booth points, modeled as `electoral_areas` at `level=CASILLA`.

All four are **global reference data** (`organization_id = NULL`), shared across tenants,
ingested via CLI over `railway ssh` (files are large; matches SP0b-1/2a). No new core
engine code — the `DatasetSpec` registry is already generic; this slice adds dataset
specs, mappers, one shared geometry helper, a derived-metrics service, routers, and
frontend wiring.

## 2. Non-goals (deferred)

- **casilla → seccion `parent_id` linkage automation** (casillas land with `code` +
  Point geometry; hierarchical roll-up is SP0b-2c/SP0b-3).
- **Data versioning, dedup, inconsistency detection, quality semaphore** → SP0b-3.
- **Geocoding** — DENUE uses the file's own lat/lon only; no geocoder (matches the
  locked file-ingestion decision).
- **Pre-computed derived metrics** — participación/abstención/margen are computed at
  query time in a service, never stored.
- **PDF/PPTX reports** → SP1.

## 3. Data model (Alembic 0007)

Three new tidy/columnar tables; casillas reuse `electoral_areas`. All follow the
**recovery-hardened migration patterns** (see §7): `_index_exists()` pre-checks (never
`try/except` around `create_index`), dialect-safe geometry, and — since **none of these
tables use Postgres ENUM types** — they are immune to the enum bugs fixed in the prod
recovery. Every fact row carries `ingest_run_id` for traceability and a nullable
`area_id` resolved later.

### 3.1 `election_results` (tidy, global)

| column | type | notes |
|---|---|---|
| id | UUID (str36) | `UUIDMixin` |
| organization_id | str36? | nullable → global; FK organizations CASCADE; indexed |
| ingest_run_id | str36? | FK ingest_runs SET NULL; indexed |
| anio | int | election year |
| nivel | str(20) | territory level of the row (`estado`/`municipio`/`seccion`/…) |
| territory_code | str(40) | INEGI/INE clave; indexed |
| area_id | str36? | FK electoral_areas SET NULL; resolved later |
| eleccion | str(40) | election identity, e.g. `presidencia`, `diputaciones_federales`, `gubernatura`, `ayuntamiento` |
| partido | str(40) | party/coalition code, OR a sentinel: `_LISTA_NOMINAL`, `_TOTAL`, `_NULOS`, `_NO_REGISTRADAS` |
| votos | Numeric | vote count for that party (or the value for a sentinel row) |
| + AuditMixin columns | | |

Index `ix_election_lookup (anio, nivel, territory_code, eleccion, partido)`.

**Turnout via sentinel rows:** per-territory totals are stored as extra rows with a
sentinel `partido` (`_LISTA_NOMINAL`, `_TOTAL`, `_NULOS`, `_NO_REGISTRADAS`). This keeps
the table strictly tidy (one row per territory+election+party) with no per-territory
denormalized columns.

### 3.2 `socio_metrics` (tidy, global)

Same shape as `CensusMetric` (a deliberate, separate domain table per the program spec):
`organization_id?`, `ingest_run_id?`, `anio`, `nivel`, `territory_code`, `area_id?`,
`indicador` str(60), `valor` Numeric. Index `ix_socio_lookup (nivel, territory_code, indicador, anio)`.

### 3.3 `economic_units` (DENUE, columnar + Point)

| column | type | notes |
|---|---|---|
| id | UUID | |
| organization_id | str36? | nullable → global |
| ingest_run_id | str36? | FK ingest_runs SET NULL |
| clave | str(40) | DENUE establishment id; indexed |
| nombre | str(300) | |
| actividad | str(20)? | SCIAN code |
| actividad_desc | str(300)? | |
| estrato | str(60)? | employee-count bucket |
| territory_code | str(40) | municipio/seccion clave; indexed |
| area_id | str36? | FK electoral_areas SET NULL |
| lat | Numeric? | from file |
| lon | Numeric? | from file |
| geometry | Geometry(POINT,4326) on PG / Text on SQLite | built from lon/lat |
| + AuditMixin | | |

### 3.4 Casillas → `electoral_areas` (no new table)

Casillas are ingested as `electoral_areas` rows with `level = CASILLA` (the enum value
already exists), `organization_id = NULL`, `geometry` = a Point built from the file's
lon/lat, `code` = casilla clave, `name` = label. They flow through the existing
`/api/maps/areas?level=casilla` and the map layer selector. `parent_id` linkage to the
seccion is deferred.

## 4. Engine integration (`app/ingestion/`)

No change to `engine.py` (already generic: open run → read → validate → batched insert →
finalize; `--replace` deletes by `scope_filter` in the same txn). This slice adds, in
`datasets.py`:

- **Shared Point helper** `_point_geometry(lon, lat, db)` — dialect-branched, mirroring
  `_geometria_mapper`: PG → `func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)`;
  SQLite/other → JSON text `{"lon":…, "lat":…}` (or `None` when lat/lon missing).
- **Mappers** `_resultados_mapper`, `_socio_mapper`, `_denue_mapper`, `_casillas_mapper`
  — signature `(row, ctx, run, extra, db=None)`, returning model kwargs; coerce numeric
  fields; raise explicit `ValueError` on missing required `extra` (e.g. `anio`/`eleccion`).
- **`ColumnSpec` lists** per dataset (required columns, `coerce="number"` for
  votos/valor/lat/lon).
- **`scope_filter`s** for `--replace`:
  - resultados → `(org, anio, eleccion, nivel)`
  - socio → `(org, anio, nivel)`
  - denue → `(org)` (full global replace; or by a `--scope` extra if provided)
  - casillas → `(org IS NULL, level == CASILLA)`
  Each guards against an empty scope (no unconditional DELETE), matching SP0b-1.
- **`DatasetSpec` registrations**: `resultados`, `socio`, `denue`, `casillas`.
  `casillas` reuses the `read_tabular` reader (lat/lon CSV), `model=ElectoralArea`.

## 5. `area_id` resolution (`app/ingestion/resolve.py`)

`resolve_area_ids(db, fact_model, level_map)` is already generic (matches
`territory_code` → global `electoral_areas.code` at the mapped level; sets `area_id`
only where NULL; never fabricates). Extend the CLI `resolve` subcommand with
`--dataset {resultados, socio, denue}` and the appropriate `level_map`
(estado→ESTADO, municipio→MUNICIPIO, seccion→SECCION). Casillas are territory, not
facts → not resolved here.

## 6. Entry points

### 6.1 CLI (`scripts/ingest_file.py`)

New subcommands, each delegating to the importable `ingest()` with an `extra` dict:
- `resultados` — `--anio`, `--eleccion`, `--map col=field`, `--global/--org/--campaign`, `--replace`.
- `socio` — `--anio`, `--map`, scope flags, `--replace`.
- `denue` — `--map`, `--lat-prop`, `--lon-prop`, `--replace`.
- `casillas` — `--map`, `--lat-prop`, `--lon-prop`, `--code-prop`, `--name-prop`, `--replace`.

Run in bulk via `railway ssh --service Agora /opt/venv/bin/python /app/scripts/ingest_file.py …`.

### 6.2 HTTP routers + services

- **`/api/resultados`** (`routers/resultados.py` + `resultados_service.py`): list/query
  election_results (filters `anio`/`nivel`/`territory_code`/`eleccion`); a derived view
  computes per-territory **participación** = (Σ votos real parties + `_NULOS`) /
  `_LISTA_NOMINAL`, **abstención** = 1 − participación, **margen** = top1 − top2 (real
  parties). Empty DB → `DataState` "Ingesta pendiente".
- **`/api/socio`** (`routers/socio.py` + service): query socio_metrics (mirrors the
  census read path).
- **`/api/denue`** (`routers/denue.py` + service): query economic_units by territory;
  return GeoJSON points for the map (server-side, capped/paginated).
- **Casillas**: served by the existing `/api/maps/areas?level=casilla`.

All reads org-scoped (global rows visible to all tenants) and admin-gated per the
existing router patterns; runs/ingest endpoints unchanged.

## 7. Alembic 0007

Create `election_results`, `socio_metrics`, `economic_units` (casillas need no DDL).
Apply the recovery-hardened rules:
- `_index_exists()` pre-checks before every `create_index` — **never** `try/except`
  (a swallowed error still aborts the whole PG transaction).
- `_table_exists()` guards before `create_table` (idempotent).
- Dialect-safe geometry: `geoalchemy2 Geometry("POINT", 4326)` on PG, `Text` on SQLite.
- **No ENUM types** in these tables → the enum double-creation / case bugs do not apply.
- Round-trip verified `0001 → 0007` up/down/up on both PG and SQLite.

## 8. Frontend

Wire the preview modules to the real endpoints with graceful empty states
(`useAsync` + `DataState`), removing their sample fixtures (real-from-day-one, per the
locked file-ingestion decision):
- **Resultados** → `/api/resultados` + derived metrics (participación/abstención/margen).
- **Demografía / Socioeconómico** → `/api/socio` (alongside census).
- **Unidades Económicas (DENUE)** → `/api/denue` (map points + table).
- **Map**: add `casilla` to the level selector (flows through `/api/maps/areas`).

## 9. Testing (TDD, subagent-driven)

- **Mappers** (unit): correct kwargs, numeric coercion, missing-column / missing-`extra`
  errors, Point geometry built from lat/lon (PG vs SQLite branch).
- **Engine integration**: ingest each dataset; `--replace` deletes only the scoped rows;
  empty-scope guard; counts/status on the IngestRun.
- **Resolve**: matched/unmatched counts; only NULL `area_id` set; no fabrication.
- **Routers**: org-scoping/global visibility, empty → DataState contract, derived-metric
  math (participación/abstención/margen) on a fixture.
- **Alembic**: round-trip `0001→0007` on SQLite (conftest maps Geometry→Text for the new
  tables); CLI smoke for all four subcommands.

## 10. File layout

```
backend/app/models/election_result.py     # ElectionResult
backend/app/models/socio.py               # SocioMetric
backend/app/models/economic_unit.py       # EconomicUnit
backend/app/ingestion/datasets.py         # +4 specs, mappers, _point_geometry helper
backend/app/ingestion/resolve.py          # +resolve level maps (CLI)
backend/app/services/resultados_service.py # derived metrics
backend/app/services/socio_service.py
backend/app/services/denue_service.py
backend/app/routers/{resultados,socio,denue}.py
backend/alembic/versions/0007_tidy_facts.py
scripts/ingest_file.py                     # +4 subcommands
frontend/src/modules/{resultados,demografia,unidades-economicas}/  # real wiring
frontend/src/api/{resultados,socio,denue}.ts
backend/tests/…                            # per above
```

## 11. Sub-decisions locked during brainstorming

- Scope: all four loaders in this slice.
- ElectionResult: **global tidy**, election identity via plain columns (`anio`,
  `eleccion`, `nivel`), `partido` as a plain code; no FK to `Contest`.
- Derived metrics: **raw facts only**, derive in service at query time.
- Casillas: **`electoral_areas` at `level=CASILLA`** with Point geometry (not a separate table).
- Tables: **Approach A** — separate typed tables; `socio_metrics` is its own table (not a
  `CensusMetric` discriminator).
