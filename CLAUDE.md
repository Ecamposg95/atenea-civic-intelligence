# CLAUDE.md — Atenea Civic Intelligence

Developer notes for AI assistants working in this repository.

---

## Quick orientation

Ágora is an API-first GovTech platform. The backend owns all security, authorization,
validation, and business rules. The frontend is a pure consumer of `/api/*`.

**Activist-capture platform** (SPA-1 → SPA-4) is the main feature on the
`feat/spa4-compliance` branch. It layers on top of the existing platform spine
without modifying its foundations.

---

## Activist Module Architecture

### Spine reuse (don't reinvent these)

| Concept | Where |
|---------|-------|
| Multi-tenancy | `Organization` model; every query filters by `organization_id` from the JWT |
| Campaign scoping | `Campaign` model; `X-Campaign-Id` header; `get_admin_context` dependency |
| Auth / JWT | `app/core/security.py` · `app/services/auth_service.py` |
| RBAC | `require_roles(*roles)` dependency factory in `app/dependencies.py` |
| Scoped queries | `scoped_query(db, Model, ctx)` / `_role_scoped(query, ctx)` in services |
| Audit trail | `AuditLog` model; `audit_service.log(db, ...)` |
| Error envelope | `{ "error": { "message", "status" } }` — use `HTTPException` in routers |
| Pagination | `{ items, total, limit, offset }` — `Page[T]` schema |

### New concepts added by SPA-1 → SPA-4

- **`LIDER` / `ACTIVISTA` roles** — added to `UserRole` enum (migration 0008).
  Enum values are stored as uppercase member **NAMES** (`LIDER`, `ACTIVISTA`).
  See enum-hardening rules below.
- **`lider_id`** — nullable self-FK on `User` (a LIDER supervises ACTIVISTAs).
- **`Registro`** — the core entity: a person contacted by an activist.
  `activista_id` is nullable (`SET NULL` on hard-delete); `clave_elector_enc` is
  Fernet-encrypted bytes; `clave_masked` is the display value (always safe to show).
- **Fernet crypto** — `app/core/crypto.py`: `encrypt_clave` / `decrypt_clave` /
  `ensure_crypto_ready` (called at startup lifespan). The app refuses to start if
  `FERNET_KEY` is not set.
- **PrivacyNotice / PrivacyAcceptance** — versioned consent. Every `POST /registros`
  looks up the active notice and writes an acceptance row.
- **ArcoRequest** — ARCO compliance audit trail. `registro_id` is a plain string (not
  a FK) so the trail survives hard-deletion.
- **RetentionService** — soft-delete + post-election hard-purge, fully audited. Run
  via `scripts/purge_registros.py` (CLI), never in-process.
- **Offline queue** (`frontend/src/offline/`) — IndexedDB + background sync for
  captures made without connectivity.

---

## Command Center ejecutivo + Digitalización (2026-07-08)

Layered on top of the activist module for the **San Mateo Atenco 2027** campaign
(user "Lucy" = COORDINADOR). See `docs/superpowers/specs/2026-07-08-command-center-ejecutivo-visibilidad-captura-design.md`.

### RBAC — COORDINADOR is campaign-wide

The COORDINADOR is the **campaign executive**: they see and act on the **entire
campaign**, not just their supervisory sub-tree. This changed the coordinador
branch in every scope helper — `registro_service._role_scoped`,
`militante_service._militante_role_scoped`, `caso_service._caso_role_scoped`,
`promovido_service` — to return `scoped_query(Model, ctx)`, AND removed the
sección **territory gate** for coordinador (`list_promovidos` bypass +
`_bypass_territory` in militante/caso). LIDER and below stay hierarchy-scoped.
Tenant/campaign isolation is untouched (`scoped_query` still filters org+campaign).
The COORDINADOR can now also **capture** (`CapturaWriteCtx` +COORDINADOR) and
**reveal** the clave (`admin.py::RevealCtx` = ADMIN+COORDINADOR, still audited).

### Executive dashboard vs. platform dashboard

- **`GET /dashboard/executive`** (`dashboard_service.executive`) — campaign KPIs
  (promovidos/afiliados/casos/cobertura + countdown `election_date` + trend +
  alerts), composed from `operacion_service.seguimiento` + militante/caso panoramas.
  Frontend: `pages/DashboardPage.tsx` ("Centro de Mando", executive, Atenea kit).
- **`pages/PlatformDashboardPage.tsx`** (route `/plataforma`, gated superadmin/admin) —
  the moved **technical** blocks (audit log, data sources, cartography, governance).
- **`app/seeds/demo_election_date.py`** — idempotent seed (Cargo+Contest,
  `election_date=2027-06-06`), run unconditionally in the lifespan so the
  countdown always has a date. `DEMO_CAMPAIGN_ID` env override.

### Promovidos — richer views

- `PromovidoRead` returns all Excel-imported fields (incl. `created_at`,
  `direccion`, `promotor`); the table shows them all.
- **Detail drawer** `modules/promovidos/components/PromovidoDetail.tsx` — click a
  row → `GET /registros/:id` (full `RegistroRead`) grouped by section; includes an
  audited **Revelar clave** button (coordinador+).

### Digitalización del papel ("digitize Lucy's paper") — program

Four flows; **1 and 2 shipped**, 3 and 4 pending.

1. **Captura rápida** — `modules/captura/CapturaRapidaPage.tsx` (route
   `/captura-rapida`, gated `CONSOLE_CAPTURA`). Lean mobile-first form reusing
   `POST /registros`; "guardar y capturar otro" keeps sección+promotor. `promotor`
   was added to `RegistroCreate` + service so it persists via the create API.
2. **Importación masiva** — `POST /promovidos/import` (router promovidos, gated
   ADMIN+COORDINADOR) reuses `import_service.parse_workbook`/`import_rows` (fixed
   paper template; dedup by `basename(file)`+sheet+row → re-upload never dupes;
   batch-audited `registro.import`). `commit=false`→preview, `commit=true`→import.
   Frontend `modules/promovidos/ImportarPromovidosPage.tsx` (route `/promovidos/importar`).
3. **OCR scan** (pending) — reuse Atención on-device INE OCR for paper forms.
4. **Acuerdos y Minutas** (pending) — new module, own spec.

---

## Where Things Live

### Backend

```
backend/app/
├── core/
│   ├── config.py          Settings (pydantic-settings, all env vars)
│   ├── crypto.py          Fernet encrypt/decrypt/ensure_crypto_ready
│   ├── logging.py         configure_logging (PII-safe structured logs)
│   └── rate_limiting.py   slowapi limiter singleton (RATE_LIMIT_ENABLED gate)
├── middleware/
│   └── security_headers.py  SecurityHeadersMiddleware (CSP, HSTS, etc.)
├── models/
│   ├── user.py            User (lider_id, seccion, UserRole enum)
│   ├── registro.py        Registro (clave_elector_enc, clave_masked, consentimiento)
│   ├── privacy.py         PrivacyNotice, PrivacyAcceptance
│   └── arco.py            ArcoRequest (ArcoTipo, ArcoEstado enums)
├── routers/
│   ├── registros.py       POST/GET /registros (capture + list)
│   ├── admin.py           /admin/* dashboard, registros, reveal, estructura
│   ├── privacy.py         /privacy/notices (versioned aviso)
│   ├── arco.py            /arco/requests (ARCO create + ejecutar)
│   ├── exports.py         GET /registros/export (CSV/XLSX, masked-by-default)
│   └── reports.py         GET /reports/secciones (aggregated, no PII)
├── services/
│   ├── registro_service.py   create_registro + list (Fernet, consent, scoping)
│   ├── admin_service.py      admin list/reveal/estructura
│   ├── privacy_service.py    get_active_notice + record_acceptance
│   ├── arco_service.py       create_request + ejecutar (hard-delete + audit)
│   ├── export_service.py     build_csv / build_xlsx (masked-by-default)
│   ├── report_service.py     secciones_report (GROUP BY scope-aware)
│   └── retention_service.py  purge_soft_deleted / purge_post_election
└── alembic/versions/
    ├── 0008_activistas.py    Registro + LIDER/ACTIVISTA (down_revision: 0006)
    ├── 0009_widen_client_uuid_unique.py  (down_revision: 0008)
    ├── 0010_privacy.py       PrivacyNotice + PrivacyAcceptance (down_revision: 0009)
    └── 0011_arco.py          ArcoRequest (down_revision: 0010)
```

### Frontend

```
frontend/src/
├── modules/
│   ├── captura/     Activist capture form (mobile-first, offline-aware)
│   └── admin/       Admin console (dashboard, registros, reveal, estructura)
└── offline/
    ├── db.ts        IndexedDB schema + queue helpers
    ├── queue.ts     Enqueue / status management
    └── sync.ts      Background sync (drain queue, reconcile stranded rows)
```

---

## Running Tests

### Backend

```bash
cd backend
python3 -m pytest           # all tests (250 baseline)
python3 -m pytest -q        # quiet summary
python3 -m pytest tests/test_registros.py -v   # single file
```

Tests use SQLite (in-memory) via `conftest.py`. `FERNET_KEY` and
`RATE_LIMIT_ENABLED=false` are set in `conftest.py` before imports — do not remove
these.

### Frontend

```bash
cd frontend
npm run build     # TypeScript type-check + Vite production build
npm run test      # Vitest unit tests (offline/sync + queue)
npm run dev       # dev server (port 5173, proxies /api → 8000)
```

---

## Alembic / Migration Rules

These rules come from hard-won production incidents (see
`prod-recovery-alembic-enums.md`). Violating them causes crashes in PostgreSQL.

### 1. Enum values must use uppercase NAMES

```python
# Wrong — stores lowercase values, crashes if PG enum has uppercase entries:
class UserRole(str, enum.Enum):
    lider = "lider"

# Correct — stores NAME (uppercase) to match what PostgreSQL has:
class UserRole(str, enum.Enum):
    LIDER = "LIDER"
```

When adding new enum values in a migration, use uppercase:
```python
op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'LIDER'")
```

### 2. ALTER TYPE … ADD VALUE must not run inside a transaction

```python
# Wrap in autocommit_block (established pattern from 0003_area_level_values.py):
with op.get_context().autocommit_block():
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'LIDER'")
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ACTIVISTA'")
```

### 3. CREATE TYPE in migrations: use `create_type=False`

When creating a new enum type explicitly with `CREATE TYPE … IF NOT EXISTS`, use
`postgresql.ENUM(create_type=False)` in `op.create_table` to prevent Alembic from
issuing a duplicate `CREATE TYPE` and crashing with `DuplicateObject`:

```python
from sqlalchemy.dialects import postgresql

op.execute("CREATE TYPE IF NOT EXISTS arco_tipo AS ENUM ('ACCESO', 'RECTIFICACION', ...)")
op.create_table(
    "arco_requests",
    sa.Column("tipo", postgresql.ENUM("ACCESO", ..., name="arco_tipo", create_type=False)),
    ...
)
```

### 4. All migrations must be idempotent

Guard every DDL statement:
```python
def _table_exists(name): ...
def _index_exists(name): ...

if not _table_exists("registros"):
    op.create_table(...)
if not _index_exists("ix_registros_campaign_id"):
    op.create_index(...)
```

### 5. SQLite compatibility

Tests run on SQLite. Use `op.batch_alter_table` for constraint changes. The
`autocommit_block` / `DO $$` pattern is PostgreSQL-only; guard with dialect checks
or rely on the `IF NOT EXISTS` clause which SQLite silently accepts for types.

---

## Golden Rules (project-wide, enforced in code)

1. Every business-entity query filters by `organization_id`.
2. `organization_id` on writes comes from the JWT, never from user input.
3. Endpoints return Pydantic schemas, never raw ORM objects.
4. RBAC is enforced in the API layer (`require_roles` dependency), not the frontend.
5. Sensitive operations emit an `audit_log` row.
6. No hardcoded secrets — all config from env (`app/core/config.py`).
7. Paginated lists: `{ items, total, limit, offset }`.
8. Error envelope: `{ "error": { "message", "status" } }`.
9. Clave de elector is **never** logged, never echoed in error responses, and
   never exposed in list endpoints — only in explicit audited reveal flows.
