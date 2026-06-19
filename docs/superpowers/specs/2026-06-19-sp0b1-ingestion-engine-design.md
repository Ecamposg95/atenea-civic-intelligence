# SP0b-1 — Ingestion Engine + Governance Registry — Design Spec

**Date:** 2026-06-19
**Status:** Approved (design) — pending spec review
**Parent program:** `2026-06-18-electoral-intelligence-platform-program-design.md` (SP0, sliced — this is SP0b sliced into SP0b-1).
**Builds on:** SP0a Platform Spine (`2026-06-18-sp0a-platform-spine-design.md`) and supersedes the loose data model of `2026-06-16-file-ingestion-pipeline-design.md`.
**Scope:** Backend (FastAPI/SQLAlchemy/Alembic) + a small frontend status view.

## 1. Goal

A generic, governed **ingestion engine** that converts user-provided files into typed rows, with source registration, per-run traceability, and pre-insert validation — wired to the SP0a spine (tenant/campaign scoping + canonical territory). Two entry points: CLI (bulk reference data via `railway ssh`) and an in-app HTTP upload (smaller campaign files). Ships with ONE proving dataset loader (Census) end-to-end; the remaining loaders are SP0b-2.

## 2. Locked decisions (brainstorming 2026-06-19)
1. **Slice:** SP0b-1 = engine + governance registry + validation + one proving loader. SP0b-2 = remaining loaders (territory geometry, results, DENUE, socio). SP0b-3 = advanced quality (versioning, dedup/inconsistency detection, quality semaphore).
2. **Engine approach (A):** one orchestrator + a pluggable `DatasetSpec` registry; governance lives in the engine, not per loader.
3. **Entry points:** BOTH — CLI (bulk) + HTTP upload (size-limited, in-app).
4. **Governance depth (lean):** `DataSource` registry + `IngestRun` traceability + validation with explicit discard reporting. Defer dedup/inconsistency/semaphore/versioning to SP0b-3.
5. **Proving loader:** Census (`census_metrics`, simplest tidy table).
6. **Spine binding:** reference facts link to canonical territory by CODE (CVEGEO/clave + nivel) with a NULLABLE `area_id` FK resolved when territory exists (decouples from territory-load order). Public data = global reference (org NULL); campaign files = `(tenant, campaign)`-scoped.

## 3. Non-Goals (deferred)
- Other dataset loaders (territory geometry, election results, DENUE, socioeconomic) → SP0b-2.
- Versioning of datasets, duplicate/inconsistency detection, data-quality semaphore → SP0b-3.
- Geocoding (address → lat/lon) → with DENUE in SP0b-2.
- Geo readers (Shapefile/GeoJSON/KML) → with the geometry loader in SP0b-2 (SP0b-1 ships CSV + Excel readers).
- Making the preview frontend modules "real" → as each loader lands (SP0b-2), modules point at real endpoints.

## 4. Current baseline (post-SP0a)
- Spine: `Campaign`/`Contest`/`CampaignMembership`, `CampaignMixin`; territory `ElectoralArea` (hierarchy to seccion/casilla, nullable org = global reference, `code` column, `parent_id`+redundant FKs); catalogs `Cargo`/`Party`.
- Scoping: `app/core/scoping.py` `scoped_query(model, ctx)`; `app/dependencies.py` `Tenant`, `CampaignCtx` (X-Campaign-Id), `require_roles`.
- Alembic in use (`backend/alembic/`, revisions 0001/0002/0003; `bootstrap._migrate`). Mixins `UUIDMixin/TenantMixin/AuditMixin` in `app/models/base.py`.
- Existing: `Historial` frontend module reads `/api/audit?action=ine.ingest.cartografia`; `scripts/ingest_ine.py` (cartografía) is the legacy ingest pattern. Backend test suite: 78 passing.

## 5. Architecture

```
file (CSV/Excel)  →  IngestRun(open)  →  reader → validate(DatasetSpec) → map → bulk insert(batch) → IngestRun(finalize: counts/status)
   CLI or HTTP                                  ↑ discards reported, never silently dropped
```

### 5.1 Governance models (`app/models/ingestion.py`)
- **`DataSource(UUIDMixin, AuditMixin)`** — `{ id, organization_id (nullable: NULL=global/platform source), name, kind (Enum: file_csv|file_excel|file_shapefile|file_geojson|api), description, owner }`. Unique `(organization_id, name)`.
- **`IngestRun(UUIDMixin, AuditMixin)`** — `{ id, organization_id (nullable: NULL=global reference ingest), campaign_id (nullable FK campaigns), source_id (FK data_sources), dataset (str key, e.g. "census"), file_name, file_hash (sha256), status (Enum: running|success|failed|partial), rows_read, rows_inserted, rows_skipped, rows_failed, error_summary (Text, nullable), started_at, finished_at (nullable) }`. Actor via AuditMixin `created_by`.
- Each ingested fact table carries **`ingest_run_id`** (FK ingest_runs, indexed) → traceability + delete-by-run.

### 5.2 Proving fact table (`app/models/census.py`)
- **`CensusMetric(UUIDMixin, AuditMixin)`** — tidy: `{ id, organization_id (nullable: NULL=global reference), ingest_run_id (FK), anio (int), nivel (str: estado|municipio|localidad), territory_code (str: INEGI clave/CVEGEO, indexed), area_id (nullable FK electoral_areas — resolved later), indicador (str, e.g. "POBTOT"), valor (Numeric) }`. Index `(nivel, territory_code, indicador, anio)`.
- (Note: `census_metrics` here supersedes the 2026-06-16 free-text `entidad/municipio` shape — it keys on `territory_code` + nullable `area_id` so it binds to the SP0a hierarchy.)

### 5.3 Engine (`app/ingestion/`)
- `engine.py` — `run_ingest(db, ctx, spec, file_path_or_buffer, source, scope, replace=False) -> IngestRunResult`: opens an `IngestRun` (status=running), computes file hash, invokes the reader, validates+maps each row via the `DatasetSpec`, bulk-inserts in batches (transaction per batch), tags rows with `ingest_run_id`, finalizes the run (counts + status success/partial/failed). `replace=True` deletes prior rows for the scope key before insert (mirrors `ingest_ine.py --replace`).
- `readers/csv_reader.py`, `readers/excel_reader.py` — encoding autodetect (utf-8 → latin-1/cp1252 fallback, the IEEM lesson); Excel via `openpyxl`. Return an iterator of dict rows + the header.
- `validation.py` — given a `DatasetSpec` (required columns, type coercions), validate each row; collect discards with `{row_index, reason}`; never silently drop (counts + a capped sample of reasons in `error_summary`).
- `datasets/__init__.py` — a `DatasetSpec` dataclass `{ key, model, required_columns, column_map (source→canonical), row_mapper(row, ctx, run) -> model_kwargs, scope_key(run) }` and a registry `DATASETS: dict[str, DatasetSpec]`. SP0b-1 registers `census`.
- `service.py` — `list_runs`, `get_run` (scoped via `scoped_query` on IngestRun).

### 5.4 Entry points
- **CLI** `scripts/ingest_file.py`: `python -m scripts.ingest_file <dataset> --file <path> --source <name> [--org <slug>|--global] [--campaign <id>] [--map k=v ...] [--replace]`. Resolves/creates the `DataSource`, builds a context, calls `run_ingest`, prints the run summary. Runs in prod via `railway ssh`.
- **HTTP** `routers/ingest.py`: `POST /api/ingest/{dataset}` (multipart upload), admin-gated; campaign-scoped via `CampaignCtx` (or platform/global for superadmin); **enforces `MAX_UPLOAD_BYTES`** (e.g. 25 MB — big files must use CLI; return 413 over the limit); streams to a temp file, calls `run_ingest`, returns the `IngestRun` summary. `GET /api/ingest/runs` (list, scoped, paginated) + `GET /api/ingest/runs/{id}` (detail incl. discard summary). `GET /api/ingest/datasets` (registry metadata).

### 5.5 Frontend (minimal)
- The existing **Historial** module switches from `/api/audit?...` to `GET /api/ingest/runs` — real `IngestRun` records (DataTable: dataset, file, status pill, counts, when, actor; row → detail with discard report). Reuses the design system.
- An **upload control** (admin) on Historial (or Configuración): pick dataset + file → `POST /api/ingest/{dataset}` → show the returned run summary. Size hint: large files via CLI.

## 6. Scoping & isolation
- `IngestRun`/`DataSource`/`CensusMetric` have a nullable `organization_id` (NULL = global reference). `scoped_query` already handles nullable-org reference models (global OR tenant). Campaign files set `campaign_id`.
- HTTP upload: superadmin may ingest global reference (no campaign); tenant admins ingest into their `(tenant, campaign)` only. Enforced via `CampaignCtx`/`require_roles`, never from request body.
- `list_runs`/`get_run` use `scoped_query` → a tenant never sees another tenant's runs (global runs visible to all, like reference data).

## 7. Error handling & edge cases
- **Bad file/encoding:** reader tries utf-8 then latin-1/cp1252; unreadable → IngestRun status=failed with error_summary, HTTP 422.
- **Validation failures:** invalid rows are skipped and counted (`rows_skipped`), with a capped reason sample in `error_summary`; status=`partial` if some inserted + some skipped, `failed` if zero inserted. NO silent truncation.
- **Oversized HTTP upload:** 413 before processing (`MAX_UPLOAD_BYTES`).
- **Transaction per batch:** a failing batch is rolled back and counted; the run continues to the end, then finalizes with accurate counts (so one bad batch doesn't lose the whole file). The IngestRun row itself is committed at finalize.
- **`--replace`:** deletes the prior rows for the scope key (e.g. census: org + anio + nivel) in a transaction before insert; if the new insert fails, the run is `failed` and the delete is part of the same logical operation (document the chosen transactionality: delete+insert wrapped so a failure leaves prior data intact OR clearly leaves an empty scope — choose wrap-to-preserve).
- **area_id resolution:** left NULL at ingest; a later resolution step (SP0b-2, once territory loaded) matches `territory_code`→`electoral_areas.code`. SP0b-1 ships the column + index only.
- **SQLite tests:** new tables are PostGIS-free (census has no geometry); conftest create_all includes them; Alembic revision added.
- **Multi-tenant:** isolation tests mandatory (a tenant cannot list/read another tenant's runs/metrics).

## 8. Testing & verification
- **pytest (real):** readers (small CSV utf-8 + latin-1 + Excel fixtures), validation (required-column missing → discard with reason; type coercion), engine end-to-end (ingest a small census CSV → rows in `census_metrics` tagged with the run; counts correct; `--replace` idempotent), router (auth + scoping + 413 oversize + run list/detail), **isolation** (tenant A cannot see tenant B's runs; global runs visible). Keep the suite green (78 → +N).
- **Alembic:** new revision creates data_sources, ingest_runs, census_metrics; `upgrade head`/`downgrade base` round-trip on scratch SQLite.
- **Frontend:** `npm run lint`/`build`; Historial renders real runs; upload control posts and shows the summary; dark+light intact.
- **CLI:** `python -m scripts.ingest_file census --file <fixture.csv> --global --source "INEGI 2020" --replace` works locally against SQLite.

## 9. Rollout (within SP0b-1)
1. Governance models (`DataSource`, `IngestRun`) + `census_metrics` + Alembic revision + conftest tables.
2. Engine: readers (csv/excel), validation, `DatasetSpec` registry + the `census` spec, `run_ingest`.
3. CLI `scripts/ingest_file.py` (census) + tests.
4. HTTP router (`/api/ingest/*`) + service + size limit + tests (incl. isolation).
5. Frontend: Historial → real runs + upload control.
6. Full gate (pytest + alembic round-trip + frontend build) + memory.
Each step: subagent-driven, TDD, reviewed; branch `feat/sp0b1-ingestion`. Deploy via main→Railway when green.

## 10. Open questions (resolve in plan, not blocking)
- Exact `MAX_UPLOAD_BYTES` (start 25 MB).
- Whether DataSource auto-creation in the CLI is by name (yes, idempotent get-or-create).
- Batch size for bulk insert (start 5000).
- `--replace` transactionality wording (wrap delete+insert to preserve prior data on failure) — confirm in plan.
