# Deployment — Railway

Ágora deploys as a **single application service** (FastAPI serves both the
`/api/*` JSON API and the built React SPA) plus a **PostgreSQL/PostGIS**
database service. Build is **Nixpacks** (no Dockerfile).

## App service

- **Root directory:** repo root.
- **URL:** https://sma-atenco.up.railway.app (Railway service domain; `CORS_ORIGINS` matches it).
- **Config:** `.railway/railway.ts` — Railway infrastructure as code (builder `NIXPACKS`,
  start command, health check `/api/health`, restart `ON_FAILURE` ×10). Edit it, then
  `railway config plan` / `railway config apply`. The SDK is installed in `.railway/`
  (`cd .railway && npm ci`). Run `railway config …` directly, not under `timeout`
  (the SDK checks the CLI version via `$_`).
- **Build** (`nixpacks.toml`):
  - setup: Node 20 + Python 3.12 + gcc;
  - install: creates `/opt/venv`, `pip install -r backend/requirements.txt`,
    `cd frontend && npm ci`;
  - build: `cd frontend && npm run build` (produces `frontend/dist`).
- **Start:**
  ```
  . /opt/venv/bin/activate && uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT
  ```
  (same command in `.railway/railway.ts`, `nixpacks.toml` and `Procfile`).
- There is **no release step.** All bootstrap runs at startup (see below),
  because Railway private networking (`*.railway.internal`) is only available
  once the service is running.
- The backend locates the SPA via `FRONTEND_DIST` (default `../frontend/dist`)
  and serves `index.html` for any non-`/api` path so React Router deep links work.

## Startup bootstrap (FastAPI lifespan, `app/main.py`)

Runs on every boot; every step is idempotent.

1. `ensure_crypto_ready()` — refuses to start without `FERNET_KEY`.
2. Object storage check (only if storage is enabled).
3. `app/bootstrap.py::run_bootstrap()` (skip with `RUN_DB_BOOTSTRAP=0`):
   wait for the DB → enable PostGIS → Alembic `upgrade head` (Postgres) or
   `create_all` (SQLite) → seed base org + super-admin (only if
   `SEED_ADMIN_PASSWORD` is set) → optional demo users → global privacy notice →
   campaign-membership backfill (every live non-superadmin user joins its org's
   campaigns; non-fatal).
4. `SEED_DEMO_TERRITORY=true` → seed SMA (15076) secciones + 2024 electoral matrix.
5. Municipio intel (`CensusMetric`) and the election date (countdown) — always,
   non-fatal on error.

`scripts/railway_init.py` calls the same bootstrap for local/manual use.

## App variables

```
DATABASE_URL=postgresql://...        # from the Postgres service (driver auto-normalized)
SECRET_KEY=<strong-random-secret>
FERNET_KEY=<fernet key>              # required; app won't start without it
ENVIRONMENT=production
CORS_ORIGINS=https://<your-app-domain>
SEED_ORG_NAME / SEED_ORG_SLUG / SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
SEED_DEMO_TERRITORY=true             # optional
ACCESS_TOKEN_EXPIRE_MINUTES=720      # prod: 12 h sessions
```

Seed passwords only create missing users; after the first boot remove the demo
`SEED_*` user variables (see `STATUS.md` → Production rollout).

The full list lives in `backend/app/core/config.py` and `STATUS.md`.
`config.py` normalizes `postgres://` / `postgresql://` → `postgresql+psycopg://`.

## Database (PostgreSQL + PostGIS)

- Provision PostgreSQL from the **`postgis/postgis`** image.
- The bootstrap runs `CREATE EXTENSION IF NOT EXISTS postgis`.
- Reference the DB connection string into the App service as `DATABASE_URL`.

## Migrations (Alembic)

Migrations run automatically at startup. To create one:
```bash
cd backend
alembic revision --autogenerate -m "message"
```
Follow the enum/idempotency rules in `CLAUDE.md`.

## Post-deploy checklist

- [ ] `/api/health` returns `200`.
- [ ] A freshly created capturista can log in (mixed-case email), change the
      temporary password and open `/captura` (no 403 "Not a member").
- [ ] Startup logs show the bootstrap finished without errors.
- [ ] The app domain serves the SPA and deep links resolve.
- [ ] `SECRET_KEY`, `FERNET_KEY` and `SEED_ADMIN_PASSWORD` are strong, unique secrets.
