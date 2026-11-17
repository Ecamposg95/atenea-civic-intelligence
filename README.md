# Atenea — Civic Intelligence

> API-first GovTech platform for civic, electoral and territorial intelligence.
> A premium, institutional command center for governed, auditable public-sector data.

Built by **Atlas Tech** for production GovTech development.

---

## Overview

Atenea unifies **maps**, **executive dashboards**, **electoral data governance**,
**civic participation analytics** and an **institutional AI analyst** behind a
single, API-first spine. The backend owns all security, authorization,
validation and business rules; the frontend is a pure consumer of `/api/*`.

**Principles:** API-first · backend-owned security · multi-tenant from day 1 ·
privacy-by-design · auditability · Railway-first (single service serves API +
SPA).

## Tech stack

| Layer     | Technology                                                        |
|-----------|-------------------------------------------------------------------|
| Backend   | Python 3.12 · FastAPI · SQLAlchemy 2.0 · Pydantic v2 · Alembic    |
| Database  | PostgreSQL + PostGIS (GeoAlchemy2, SRID 4326)                     |
| Auth      | PyJWT (HS256) · passlib[bcrypt] · OAuth2 bearer · RBAC            |
| Frontend  | Vite · React 18 · TypeScript · React Router v6 · Zustand · Axios  |
| UI        | Tailwind CSS · MapLibre GL JS (maps) · Recharts (charts)          |
| Deploy    | Railway · Nixpacks + Procfile · `postgis/postgis` database        |

## Architecture

```
                  Railway App service (single)
   FastAPI ── /api/*  Routers → Services → Models (SQLAlchemy 2.0)
           └─ /*      built React SPA (StaticFiles + catch-all)
                              │
                   PostgreSQL + PostGIS

   Dev: Vite (5173) ──proxy /api──▶ FastAPI (8000)
```

The backend serves the built SPA and returns `index.html` for any non-`/api`
path so React Router deep-links work. See [`docs/architecture.md`](docs/architecture.md).

### Golden Rules (enforced in code)
1. Every business-entity query filters by `organization_id`.
2. `organization_id` on writes comes from the JWT, never from input.
3. Endpoints return Pydantic schemas, never raw ORM objects.
4. RBAC is enforced in the API layer (dependencies), not the frontend.
5. Sensitive operations emit an `audit_log` row.
6. No hardcoded secrets — all config from env.
7. Paginated lists: `{ items, total, limit, offset }`.
8. Error envelope: `{ "error": { "message", "status" } }`.

## Repository structure

```
agora-civic-intelligence/
├── backend/      FastAPI app (models+mixins, schemas, routers, services), Alembic, tests
├── frontend/     Vite + React + TS + Tailwind + MapLibre + Recharts
├── docs/         architecture, product-brief, data-model, deployment
├── scripts/      railway_init.py (idempotent bootstrap/seed), dev helpers
├── nixpacks.toml Build (Node + Python, builds SPA)
├── Procfile      web (uvicorn) + release (railway_init)
└── railway.json  Railway service config
```

## Local setup

### Prerequisites
- Python 3.12+ · Node.js 20+ · PostgreSQL 15+ with **PostGIS**

### 1. Database
```bash
createdb agora
psql agora -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### 2. Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                  # set DATABASE_URL / SECRET_KEY
python ../scripts/railway_init.py     # create tables + seed (set SEED_ADMIN_PASSWORD)
uvicorn app.main:app --reload         # http://localhost:8000
```
API docs: <http://localhost:8000/api/docs>

### 3. Frontend (dev)
```bash
cd frontend
npm install
cp .env.example .env                  # VITE_API_URL=/api (Vite proxies to :8000)
npm run dev                           # http://localhost:5173
```

### Production-style (backend serves the SPA)
```bash
cd frontend && npm run build          # → frontend/dist
cd ../ && uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
# open http://localhost:8000  (API + SPA on one origin)
```

## Environment variables

### Backend
| Variable                      | Example                                              |
|-------------------------------|------------------------------------------------------|
| `DATABASE_URL`                | `postgresql://...` (driver auto-normalized to psycopg) |
| `SECRET_KEY`                  | `change-me-in-production`                             |
| `ALGORITHM`                   | `HS256`                                               |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60`                                                 |
| `ENVIRONMENT`                 | `development` \| `production`                         |
| `CORS_ORIGINS`                | `http://localhost:5173` (comma-separated)            |
| `FRONTEND_DIST`               | `../frontend/dist`                                   |
| `SEED_ORG_*`, `SEED_ADMIN_*`  | optional — used by `railway_init.py`                 |

### Frontend
| Variable        | Example   | Notes                                          |
|-----------------|-----------|------------------------------------------------|
| `VITE_API_URL`  | `/api`    | Dev uses the Vite proxy; prod is same-origin.  |

## Backend commands
```bash
uvicorn app.main:app --reload            # dev server
pytest                                    # health + auth + tenancy + pagination
python scripts/railway_init.py            # idempotent bootstrap/seed
alembic revision --autogenerate -m "msg"  # create migration
alembic upgrade head                      # apply migrations
```

### Key endpoints
| Method | Path                      | Purpose                          |
|--------|---------------------------|----------------------------------|
| GET    | `/api/health`             | Health / readiness               |
| POST   | `/api/auth/login`         | Authenticate, issue JWT          |
| GET    | `/api/auth/me`            | Current user                     |
| GET    | `/api/users`              | Tenant-scoped users (paginated)  |
| GET    | `/api/organizations`      | Organizations (paginated)        |
| GET    | `/api/maps/areas`         | Electoral areas as GeoJSON       |
| GET    | `/api/analytics/overview` | Civic intelligence KPIs          |

## Frontend commands
```bash
npm run dev        # dev server (5173, proxies /api → 8000)
npm run build      # type-check + production build → dist/
npm run preview    # serve the production build
npm run lint       # type-check only
```

## Railway deployment

Two services: an **App** service (repo root, Nixpacks — builds the SPA and runs
FastAPI, which serves API + SPA) and a **PostgreSQL** service from the
`postgis/postgis` image.

- Build: `nixpacks.toml` installs Node + Python, builds `frontend/dist`,
  installs `backend/requirements.txt`.
- Start: `web: uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT`
- No release step: migrations and seeds run idempotently in the FastAPI
  lifespan at startup (`app/bootstrap.py`).
- Health check: `/api/health`.

Full guide: [`docs/deployment.md`](docs/deployment.md).

---

© Atlas Tech · GovTech. All rights reserved.
