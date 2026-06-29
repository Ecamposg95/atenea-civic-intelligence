# Ágora — Activist Platform: Status & Runbook

> **Branch:** `feat/spa4-compliance`  
> **Last updated:** 2026-06-29  
> **Baseline tests:** 250 passed

---

## Program State

The activist-capture platform was built across four sub-projects (SPA-1 → SPA-4),
all integrated on the current `feat/spa4-compliance` branch and ready for QA→beta→prod
promotion.

### SPA-1 — Núcleo de Captura de Activistas

Delivered the **core capture flow**: new `LIDER` and `ACTIVISTA` roles extending
`UserRole`; `lider_id` self-FK on `users`; the `Registro` model (person contacted by
an activist — `nombre_completo`, `telefono`, `seccion`, `clave_elector_enc`,
`clave_masked`, `consentimiento`, `area`, `programa`); Fernet encryption at rest
(`clave_elector_enc`, fail-fast startup guard); mandatory consent (422 if false);
`client_uuid` idempotency key; `POST /registros` endpoint scoped to campaign; and
the mobile-first `Captura` frontend module.

**Migration:** `0008_activistas` (down_revision: 0006).

### SPA-2 — Consola Admin / Superadmin

Delivered the **admin console**: admin dashboard with totals + daily-trend and
per-sección charts (Recharts); admin registros table with search/filters and an
audited reveal of the clave de elector (ADMIN/SUPERADMIN only); admin estructura tree
for assigning lider/sección to users; superadmin cross-tenant mode (no
`X-Campaign-Id` → consolidated view across all bases); base-switcher persisted in
Zustand; the `Admin` frontend module (`/admin/*`).

**Migration:** `0009_widen_client_uuid_unique` — widened the unique constraint to
`(campaign_id, activista_id, client_uuid)` for SPA-3 multi-activista sync.

### SPA-3 — Offline PWA / IndexedDB Sync

Delivered **offline-first capture**: service-worker registration; an IndexedDB queue
(`offline/db.ts`) that persists captures when the device has no connectivity;
a background sync worker (`offline/sync.ts`) that drains the queue on reconnection;
reconciliation of `stranded`/`syncing` rows; permanent-4xx termination (no data
loss on server rejections); clave whitespace trimming at capture; and the
`Offline` status indicator in the capture UI.

### SPA-4 — Compliance / Export / QA

Delivered all **Fase 7–9 compliance** work:

| Task | What was built |
|------|---------------|
| T2/T3 | `PrivacyNotice` model + versioned aviso endpoint; `PrivacyAcceptance` trail wired into `create_registro`; global v1 notice seeded at bootstrap |
| T4 | `ArcoRequest` model + `POST /arco/requests` + `POST /arco/requests/{id}/ejecutar` (audited hard-delete); trail survives registro deletion |
| T5 | `RetentionService` + `scripts/purge_registros.py` CLI (soft-deleted purge + post-election purge, dry-run mode, fully audited) |
| T6 | `configure_logging` (no PII in log lines); validation-error redaction (clave never echoed); log/URL hygiene test suite |
| T7 | `GET /registros/export` (CSV + XLSX); masked-by-default; ADMIN+LIDER scoped; reveal flag gated to ADMIN+SUPERADMIN; audited |
| T8 | `GET /reports/secciones` — COUNT GROUP BY sección, no PII, scope-aware (LIDER sees own estructura) |
| T9 | `slowapi` login rate limiter (`LOGIN_RATE_LIMIT`); `SecurityHeadersMiddleware` (CSP, HSTS in prod, X-Frame-Options); `RATE_LIMIT_ENABLED` / `SECURITY_HEADERS_ENABLED` gates |
| T10 | `test_integration_flows.py` (end-to-end activist+admin flows); `scripts/loadtest_capture.py` (concurrent httpx load test, throughput + latency percentiles) |
| T11 | This document + `CLAUDE.md` |

**Migrations:** `0010_privacy` (down_revision: 0009) · `0011_arco` (down_revision: 0010).

---

## Fase 7 Compliance Checklist

| AC | Requirement | Status | Implementing task |
|----|-------------|--------|-------------------|
| AC-7.1 | Clave de elector masked by default in all list/detail responses | ✓ | T6 (log-hygiene sweep; masked field in all serializers) |
| AC-7.2 | Versioned privacy notice — every capture records acceptance of the active version | ✓ | T2 (PrivacyNotice model + seeding) / T3 (PrivacyAcceptance wired into create_registro) |
| AC-7.3 | ARCO hard-delete — data subject can request deletion; admin executes it; audit trail persists | ✓ | T4 (ArcoRequest + `/arco` router) |
| AC-7.4 | Configurable data retention purge (post-election + soft-deleted) | ✓ | T5 (RetentionService + purge_registros.py CLI) |
| AC-7.5 | Log and URL hygiene — no PII in log lines, error bodies, or 422 responses | ✓ | T6 (configure_logging + validation-error redaction) |
| AC-7.6 | Export masked by default; reveal requires elevated role (ADMIN/SUPERADMIN) and is audited | ✓ | T6 (masked serializer) / T7 (export router reveal-flag gate) |

## Fase 8 Checklist

| AC | Requirement | Status | Task |
|----|-------------|--------|------|
| AC-8.1 | CSV export of registros (scoped, masked) | ✓ | T7 |
| AC-8.2 | XLSX export of registros (scoped, masked) | ✓ | T7 |
| AC-8.3 | Aggregated sección report (no PII) | ✓ | T8 |

## Fase 9 Checklist

| AC | Requirement | Status | Task |
|----|-------------|--------|------|
| AC-9.1 | Integration/load test — concurrent captures at scale | ✓ | T10 |
| AC-9.2 | Security hardening — rate limiting + security headers | ✓ | T9 |
| AC-9.3 | Deploy runbook + compliance docs | ✓ | T11 (this) |

---

## Environment Variables (Production)

### Required — app will not start without these

| Variable | Description |
|----------|-------------|
| `FERNET_KEY` | Fernet key for clave de elector encryption. **App refuses to start if absent.** Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `SECRET_KEY` | JWT signing secret (HS256). Use a long random string. |
| `DATABASE_URL` | PostgreSQL+PostGIS URL (`postgresql://...` or `postgres://...` — driver auto-normalized). |

### Recommended

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed origins. Set to your public domain in prod. |
| `ENVIRONMENT` | `development` | Set to `production` to enable HSTS and production guards. |
| `SECURITY_HEADERS_ENABLED` | `true` | Add CSP / X-Frame-Options / HSTS headers. |
| `RATE_LIMIT_ENABLED` | `true` | Enable per-IP rate limiting (uses `slowapi` in-memory; see known follow-ups for multi-replica). |
| `LOGIN_RATE_LIMIT` | `5/minute` | Limit string for the `/auth/login` endpoint (e.g. `10/minute`). |

### Seed — admin bootstrap

| Variable | Description |
|----------|-------------|
| `SEED_ORG_NAME` | Tenant org name (default: `Atlas Tech`). |
| `SEED_ORG_SLUG` | Tenant org slug (default: `atlas`). |
| `SEED_ADMIN_EMAIL` | Superadmin email (default: `admin@atlas.gov`). |
| `SEED_ADMIN_PASSWORD` | Superadmin password. **Absent → superadmin seed skipped.** |

### Seed — demo activists (opt-in)

| Variable | Description |
|----------|-------------|
| `SEED_LUCY_EMAIL` | LIDER demo account (default: `lucy@demo.agora.mx`). |
| `SEED_LUCY_PASSWORD` | **Required to enable demo seed** — absent → entire demo seed skipped. |
| `SEED_ACTIVISTA_EMAIL` | ACTIVISTA demo account (default: `activista@demo.agora.mx`). |
| `SEED_ACTIVISTA_PASSWORD` | **Required to enable demo seed** — absent → skipped. |
| `SEED_DEMO_CAMPAIGN_NAME` | Demo campaign name (default: `Campaña Demo 2027`). |

### Retention (opt-in)

| Variable | Default | Description |
|----------|---------|-------------|
| `RETENTION_ENABLED` | `false` | **Gate.** Must be `true` for the purge script to write any changes. |
| `RETENTION_DAYS_AFTER_ELECTION` | `180` | Days after the campaign's election date before all registros are purged. |
| `RETENTION_PURGE_SOFT_DELETED_DAYS` | `30` | Days to keep soft-deleted rows before hard deletion. |

---

## Alembic Migration Chain

```
0001_baseline
└─ 0002_sp0a_spine
   └─ 0003_area_level_values
      └─ 0004_ingestion
         └─ 0005_area_ingest_run
            └─ 0006_area_org_nullable_sqlite     ← prod head before this branch
               └─ 0008_activistas               ← SPA-1: Registro + LIDER/ACTIVISTA roles
                  └─ 0009_widen_client_uuid_unique  ← SPA-3: (campaign_id, activista_id, client_uuid)
                     └─ 0010_privacy            ← SPA-4 T2/T3: PrivacyNotice + PrivacyAcceptance
                        └─ 0011_arco            ← SPA-4 T4: ArcoRequest audit trail
```

> **Deploy gotcha:** Migration `0007` (SP0b-2b tidy-fact loaders: ElectionResult,
> SocioMetric, DENUE, casillas) lives on the separate, unmerged branch
> `feat/sp0b2b-tidy-facts`. If that branch is ever merged, a **merge-migration**
> with two `down_revisions` (`[0006, 0007]` → `0008`) will be required.
> Do not upgrade head on a DB that has 0007 without first creating the merge-migration.

---

## Running the Retention Purge

The purge script lives at `scripts/purge_registros.py` and is designed to run as a
Railway one-off command or a scheduled cron job — **not** inside the app process.

```bash
# Preview what would be deleted — no changes written, safe to run at any time:
python scripts/purge_registros.py --dry-run

# Actually purge (RETENTION_ENABLED must be "true"):
RETENTION_ENABLED=true python scripts/purge_registros.py --apply
```

**Railway cron example** (in `railway.toml`):
```toml
[cron.retention]
schedule = "0 3 * * 0"   # weekly, Sunday 03:00 UTC
command   = "python scripts/purge_registros.py --apply"
```

Required env vars for the script: `DATABASE_URL`, `FERNET_KEY`, `RETENTION_ENABLED=true`.

---

## Running the Load Test

```bash
# 20 concurrent activists against localhost (default):
python scripts/loadtest_capture.py

# Custom concurrency + target:
python scripts/loadtest_capture.py --workers 50 --base-url https://qa.example.com

# Verbose (print every request result):
python scripts/loadtest_capture.py --verbose
```

Env-var overrides: `LOADTEST_BASE_URL`, `LOADTEST_WORKERS`, `LOADTEST_EMAIL`,
`LOADTEST_PASSWORD`, `LOADTEST_CAMPAIGN`.

> **Safety:** defaults to `localhost:8000`. Never omit `--base-url` when targeting prod.

---

## Demo Login Credentials

These are created by the optional demo seed (requires `SEED_LUCY_PASSWORD` +
`SEED_ACTIVISTA_PASSWORD` to be set).

| Email | Role | How to configure |
|-------|------|-----------------|
| `lucy@demo.agora.mx` (or `SEED_LUCY_EMAIL`) | `LIDER` | Set `SEED_LUCY_PASSWORD` |
| `activista@demo.agora.mx` (or `SEED_ACTIVISTA_EMAIL`) | `ACTIVISTA` | Set `SEED_ACTIVISTA_PASSWORD` |
| `admin@atlas.gov` (or `SEED_ADMIN_EMAIL`) | `SUPERADMIN` | Set `SEED_ADMIN_PASSWORD` |

All passwords are set via the corresponding `SEED_*_PASSWORD` env vars — no default
password exists; absent vars → that seed step is skipped.

---

## Known Follow-ups

These items were identified during per-task reviews and are intentionally deferred:

1. **PWA icons** — placeholder icons in use; real branded icons needed before marketing launch.
2. **On-device IndexedDB PII encryption** — offline queue stores clave de elector in IndexedDB in clear; should be encrypted with a device-derived key.
3. **PrivacyNotice global uniqueness** — the `(org_id IS NULL, version, is_active)` invariant is enforced at the application layer; a PostgreSQL partial unique index (`WHERE organization_id IS NULL`) would make it a database constraint.
4. **Rate-limit Redis storage** — `slowapi` uses in-memory storage by default; counters are per-replica. For multi-replica deployments, configure a shared Redis backend.
5. **CSP nonces** — current CSP uses `'unsafe-inline'` for compatibility; tighter nonce-based CSP is the ideal follow-up.
6. **UI to re-submit "failed" offline rows** — the offline queue marks permanently-rejected rows as `failed`; there is no UI to review and manually re-submit or discard them.
7. **Raw-UUID admin filter inputs** — admin filter fields accept raw UUID strings for `activista_id`; a name-search autocomplete would improve UX.
8. **`window.confirm` → toast** — ARCO ejecutar confirmation uses `window.confirm`; should be replaced with a non-blocking toast/modal.

---

## Next Steps

- Merge `feat/spa4-compliance` → `main` after QA gate passes.
- Configure Railway environments (qa / beta / prod): set per-environment `FERNET_KEY`, `SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGINS`.
- Schedule retention cron on beta/prod via Railway cron or one-off.
- If `feat/sp0b2b-tidy-facts` merges, create a merge-migration before upgrading head.
- Address follow-ups above in priority order for the next sprint.
