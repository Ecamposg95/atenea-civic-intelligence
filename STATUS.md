# Ágora — Status & Runbook

## Focus

The platform runs a single campaign territory: **San Mateo Atenco (SMA, municipio
15076)**, election 2027-06-06. Mock, "coming soon" and demo modules (including the
Atizapán demo) were removed; everything left works on real data. The previous
state is recoverable from git (tag `pre-sma-cleanup`).

Current work: paper-sheet capture (`/captura`) and the SMA section map (`/mapa`) —
see `docs/superpowers/specs/2026-11-17-sma-captura-hojas-mapa-design.md`.

## Modules

**Operación:** Centro de Mando (executive dashboard), promovidos + Excel import,
captura de activistas (offline PWA queue), plan territorial, war room, alertas,
militantes (afiliación), atención ciudadana (casos, formularios, OCR INE),
minutas y acuerdos, scrum (tablero, pendientes, ciclos).

**Territorio:** mapa SMA, panorama municipal SMA. (Los módulos nacionales de
"Inteligencia Electoral" — analítica, fuentes, búsqueda, IEEM, indicadores World
Bank — se eliminaron 2026-11; `/api/analytics/overview` sigue alimentando
`/plataforma`.)

**Administración:** consola admin (registros, reveal auditado, estructura),
reportes, auditoría, ingestas, usuarios, organización, organizaciones, campañas,
configuración, plataforma (technical dashboard).

**Compliance:** Fernet-encrypted clave de elector, versioned privacy notice +
acceptances, ARCO requests, retention purge, masked-by-default exports, PII-safe
logging, rate limiting and security headers.

Territory data lives in `backend/app/seeds/municipios/15076/`
(`secciones_2024.csv`, `intel.csv`, `metas_2027.csv`, `secciones.geojson`).

## Tests

```bash
cd backend && .venv/bin/python -m pytest -q     # SQLite in-memory
cd frontend && npm run build && npm run test    # tsc + Vite build, Vitest
```

## Deploy

Railway, single Nixpacks service + PostGIS. Bootstrap (migrations, seeds) runs
in the FastAPI lifespan; there is no release step. Service config lives in
`.railway/railway.ts` (IaC). URL: https://sma-atenco.up.railway.app. Details:
`docs/deployment.md`.

---

## Environment Variables (Production)

### Required — app will not start without these

| Variable | Description |
|----------|-------------|
| `FERNET_KEY` | Fernet key for clave de elector encryption. Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `SECRET_KEY` | JWT signing secret (HS256). |
| `DATABASE_URL` | PostgreSQL+PostGIS URL (driver auto-normalized). |

### Recommended

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins. |
| `ENVIRONMENT` | `development` | `production` enables HSTS and production guards. |
| `SECURITY_HEADERS_ENABLED` | `true` | CSP / X-Frame-Options / HSTS headers. |
| `RATE_LIMIT_ENABLED` | `true` | Per-IP rate limiting (`slowapi`, in-memory). |
| `LOGIN_RATE_LIMIT` | `5/minute` | Limit for `/auth/login`. |

### Seeds

| Variable | Description |
|----------|-------------|
| `SEED_ORG_NAME` / `SEED_ORG_SLUG` / `SEED_ADMIN_EMAIL` | Base org + superadmin (defaults `Atlas Tech` / `atlas` / `admin@atlas.gov`). |
| `SEED_ADMIN_PASSWORD` | Superadmin password. Absent → superadmin seed skipped. |
| `SEED_LUCY_*`, `SEED_LIDER_*`, `SEED_ACTIVISTA_*`, `SEED_CAPTURISTA_*`, `SEED_DEMO_CAMPAIGN_NAME` | Optional demo users (see `app/bootstrap.py`); each skipped without its password. |
| `SEED_DEMO_TERRITORY` | `true` → seed SMA secciones + 2024 electoral matrix. Municipio intel and the election date are seeded on every boot. |

### Retention (opt-in)

| Variable | Default | Description |
|----------|---------|-------------|
| `RETENTION_ENABLED` | `false` | Must be `true` for the purge script to write changes. |
| `RETENTION_DAYS_AFTER_ELECTION` | `180` | Days after the election before registros are purged. |
| `RETENTION_PURGE_SOFT_DELETED_DAYS` | `30` | Days to keep soft-deleted rows. |

---

## Runbooks

### Retention purge

Run as a one-off or cron job, never in-process:

```bash
python scripts/purge_registros.py --dry-run
RETENTION_ENABLED=true python scripts/purge_registros.py --apply
```

Requires `DATABASE_URL`, `FERNET_KEY`, `RETENTION_ENABLED=true`.

### Load test

```bash
python scripts/loadtest_capture.py --workers 50 --base-url https://qa.example.com
```

Defaults to `localhost:8000`; never omit `--base-url` when targeting prod.

---

## Known Follow-ups

1. PWA icons are placeholders.
2. The offline IndexedDB queue stores the clave de elector in clear.
3. Global PrivacyNotice uniqueness is enforced in the app layer, not by a partial unique index.
4. `slowapi` counters are per-replica; multi-replica needs Redis.
5. CSP still uses `'unsafe-inline'`.
6. No UI to re-submit offline rows marked `failed`.
