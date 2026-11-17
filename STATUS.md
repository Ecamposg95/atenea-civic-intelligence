# Ágora — Status & Runbook

## Focus

The platform runs a single campaign territory: **San Mateo Atenco (SMA, municipio
15076)**, election 2027-06-06. Mock, "coming soon" and demo modules (including the
Atizapán demo) were removed; everything left works on real data. The previous
state is recoverable from git (tag `pre-sma-cleanup`).

Current work: paper-sheet capture (`/captura`) and the SMA section map (`/mapa`) —
see `docs/superpowers/specs/2026-11-17-sma-captura-hojas-mapa-design.md`.

## Modules (menu as shipped)

Sidebar shows one entry per group; the group's modules render as tabs
(`modules/registry.ts` `GROUPS`, `components/layout/GroupTabs.tsx`).

| Menu | Tabs |
|---|---|
| Inicio | executive dashboard (capturista → redirected to `/captura`) |
| Captura | paper sheets C1 (líder + 10 activistas) and Familia (activista + 7 promovidos) |
| Mapa SMA | Mapa · Panorama · Plan · War Room · Alertas |
| Personas | Lista · Estructura (paper tree) · Importar |
| Militantes | Panorama · Lista · Afiliar |
| Atención | Panorama · Casos · Atender · Formularios |
| Reuniones | Minutas · Acuerdos |
| Tareas | Tablero · Pendientes · Ciclos |
| Usuarios | full CRUD (ADMIN) |
| Sistema | Campañas · Organización · Configuración · Auditoría · Ingestas · Plataforma · Organizaciones |

National "Inteligencia Electoral" modules were removed 2026-11
(`/api/analytics/overview` still feeds `/plataforma`).

**Branding:** campaign blue (CSS tokens in `src/index.css`); the candidate brand
is the fixed string **"ViGar"** (`components/brand/CampaignBrand.tsx`; the DB
campaign name/candidato are not shown). "Desarrollado por Atlas Tech" credit in
the **Atlas Horizon** identity (black, amber horizon light, Inter light) lives
only in `components/brand/AtlasCredit.tsx`.

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
| `RATE_LIMIT_ENABLED` | `true` | Per-IP rate limiting (`slowapi`, in-memory). Client IP = right-most `X-Forwarded-For` hop (the one Railway's edge appends), so users don't share the proxy's bucket. |
| `LOGIN_RATE_LIMIT` | `20/minute` | Limit for `/auth/login`, per client IP. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | JWT lifetime; **prod sets `720`** (12 h) so capturistas aren't logged out mid-sheet. No refresh token. |

### Seeds

| Variable | Description |
|----------|-------------|
| `SEED_ORG_NAME` / `SEED_ORG_SLUG` / `SEED_ADMIN_EMAIL` | Base org + superadmin (defaults `Atlas Tech` / `atlas` / `admin@atlas.gov`). |
| `SEED_ADMIN_PASSWORD` | Superadmin password. Absent → superadmin seed skipped. |
| `SEED_LUCY_*`, `SEED_LIDER_*`, `SEED_ACTIVISTA_*`, `SEED_CAPTURISTA_*`, `SEED_DEMO_CAMPAIGN_NAME` | Optional demo users (see `app/bootstrap.py`); the whole demo seed is skipped unless both `SEED_LUCY_PASSWORD` and `SEED_ACTIVISTA_PASSWORD` are set. Seeds only **create** missing users (by email, deleted rows included) — they never reset an existing password. **Production: remove these** (see Rollout). |
| `SEED_DEMO_TERRITORY` | `true` → seed SMA secciones + 2024 electoral matrix. Municipio intel and the election date are seeded on every boot. |

### Retention (opt-in)

| Variable | Default | Description |
|----------|---------|-------------|
| `RETENTION_ENABLED` | `false` | Must be `true` for the purge script to write changes. |
| `RETENTION_DAYS_AFTER_ELECTION` | `180` | Days after the election before registros are purged. |
| `RETENTION_PURGE_SOFT_DELETED_DAYS` | `30` | Days to keep soft-deleted rows. |

---

## Production rollout (2026-11-17)

URL https://sma-atenco.up.railway.app (renamed from `agora-gobtech`, which now
404s). Campaign "SMA 2027" (municipio 15076) in the base org.

**Accounts**
- Superadmin: Emmanuel (seed). Admin: **Roberto González** (created 2026-11-17,
  temporary password, forced change on first login).
- Coordinadora: **Lucía González** (seeded as "Lucy"; still on the
  `@atlastech.mx` seed email — update to her real email and reset her password,
  because her current password is the `SEED_LUCY_PASSWORD` value).
- Demo líder / activista / capturista: **deactivated**. 2 analysts and 1 admin
  (`@atlastech.mx`) still active — pending decision.

**Access model**
- Every user must hold a `CampaignMembership`, else every campaign-scoped call
  returns 403 "Not a member of this campaign". `users_service` now adds it on
  create / update / restore (`ensure_campaign_memberships`), and the boot
  sequence repairs any user missing one (`backfill_campaign_memberships`).
- Emails are stored lower-case; login is case/space-insensitive (by email).
- New users get a temporary password and must change it (API returns 428 until
  `POST /users/me/change-password`). No self-service reset: an ADMIN resets from
  Usuarios.
- Hand out **Capturista, Coordinador and Administrador** accounts only. LIDER
  accounts see an empty Estructura (rows are tied to the capturing user and the
  LIDER territory gate) — don't issue them yet.

**Pending ops (manual, Railway dashboard)**
1. Delete `SEED_LUCY_PASSWORD`, `SEED_LIDER_*`, `SEED_ACTIVISTA_*`,
   `SEED_CAPTURISTA_*` from the Agora service variables.
2. Rename the campaign row (still "Campaña Demo 2027"; cosmetic, not shown in UI —
   no update endpoint exists).
3. Never rotate `SECRET_KEY`: `clave_hash` / `curp_hash` are HMACs keyed from it;
   rotating silently breaks duplicate detection.

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
7. LIDER users see nothing in Estructura (link LIDER *User* ↔ LIDER *Registro*).
8. `PUT /registros/{id}` bypasses hoja validation (duplicate clave possible) and a
   capturista can delete own rows whose children stay linked; no DB unique index
   on `clave_hash` (two concurrent hojas could both pass).
9. `/users` lists the whole org (email/phone) to LIDER and COORDINADOR (read-only);
   `/captura/personas` shows other capturistas' líderes/activistas (name,
   sección, phone) to any capturista.
10. Executive dashboard promovidos meta (475) ≠ map meta (28,000); its total
    counts líderes/activistas too.
11. ADMIN can create/manage other ADMINs (by design; revisit).
12. No `/auth/logout` (client-side only) and no refresh token.
