# Command Center ejecutivo + Visibilidad — Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Frontend tasks that build UI MUST invoke `frontend-design`; chart tasks MUST invoke `dataviz`.

**Goal:** Lucy (COORDINADOR) ve TODA su campaña, con un Command Center ejecutivo (countdown + KPIs de campaña) y tablas de registros más ricas; los bloques técnicos se mueven a un dashboard solo-superadmin.

**Architecture:** Cambios backend campaign-scoped (3 funciones de scope + un endpoint ejecutivo + un seed idempotente de election_date) + reescritura del `DashboardPage` al kit Atenea consumiendo un endpoint ejecutivo, + nueva página técnica gated a superadmin. Sin migración.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React 18 + TS + Vite + Tailwind + kit Atenea (frontend), Vitest, pytest.

## Global Constraints

- **Aislamiento de tenant intacto:** ampliar el scope del COORDINADOR a su CAMPAÑA (org+campaign) NUNCA cruza a otra org/campaña. Toda query sigue pasando por `scoped_query(Model, ctx)`.
- **PII intacta:** clave sigue enmascarada (`clave_masked`), contacto enmascarado; el reveal auditado NO cambia; nunca exponer clave/contacto crudos en listas.
- **Solo COORDINADOR se amplía a campaign-wide.** LIDER/ACTIVISTA/CAPTURISTA sin cambio. ADMIN/superadmin ya ven todo.
- **Kit Atenea + robustez:** usar los componentes del kit; mantener ErrorBoundary/guards; guardar cada nivel de acceso anidado; `npm run build` + `npm run test` + `pytest` verdes por tarea.
- **election_date = 2027-06-06** (primer domingo de junio, LGIPE art. 25).

---

## File Structure

**Backend:**
- Modify `backend/app/services/registro_service.py` — `_role_scoped`: COORDINADOR → campaign-wide.
- Modify `backend/app/services/militante_service.py` — `_militante_role_scoped`: idem.
- Modify `backend/app/services/caso_service.py` — `_caso_role_scoped`: idem.
- Modify `backend/app/services/promovido_service.py` — alinear (el OR de `activista_id IS NULL` para coordinador ya es redundante).
- Create `backend/app/services/dashboard_service.py` — `executive(db, ctx)` compone KPIs.
- Create `backend/app/routers/dashboard.py` — `GET /dashboard/executive`.
- Create `backend/app/seeds/demo_election_date.py` — seed idempotente (Cargo + Contest + election_date).
- Modify `backend/app/main.py` — registrar router + correr el seed (incondicional-idempotente).
- Modify `backend/app/schemas/registro.py` — añadir campos faltantes a `RegistroRead` (contacto_masked, promotor) si no están.

**Frontend:**
- Rewrite `frontend/src/pages/DashboardPage.tsx` — Command Center ejecutivo (kit).
- Create `frontend/src/pages/PlatformDashboardPage.tsx` — dashboard técnico (bloques movidos).
- Create `frontend/src/api/dashboard.ts` — `getExecutiveDashboard()`.
- Modify `frontend/src/modules/registry.ts` — ruta `/plataforma` (superadmin/admin) + ajustar dashboard.
- Modify `frontend/src/modules/promovidos/PromovidosPage.tsx` + `frontend/src/modules/admin/AdminRegistrosPage.tsx` — más columnas.

---

## Task 1: RBAC — COORDINADOR campaign-wide (registros/promovidos)

**Files:**
- Modify: `backend/app/services/registro_service.py` (`_role_scoped`)
- Modify: `backend/app/services/promovido_service.py` (scope alignment)
- Test: `backend/tests/test_scope_coordinador.py`

**Interfaces:**
- Produces: `_role_scoped(ctx)` returns campaign/org-scoped (all) for COORDINADOR; unchanged for other roles.

- [ ] **Step 1: Write the failing test**
```python
# tests/test_scope_coordinador.py
from sqlalchemy import select
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers
from app.models.registro import Registro
from app.models.organization import Organization

def _hdr(client, email):
    return {**auth_headers(client, email), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}

def test_coordinador_sees_registro_outside_own_hierarchy(client):
    # a registro captured by an activista NOT under coord's hierarchy, same campaign
    db = TestingSessionLocal()
    try:
        org = db.execute(select(Organization).where(Organization.slug == "alpha")).scalar_one()
        db.add(Registro(organization_id=org.id, campaign_id=ALPHA_CAMPAIGN_ID,
                        nombre_completo="Fuera De Jerarquia", seccion="7777",
                        consentimiento=True, activista_id=None))
        db.commit()
    finally:
        db.close()
    r = client.get("/api/promovidos?q=Fuera&limit=5", headers=_hdr(client, "coord@alpha.gov"))
    assert r.status_code == 200
    names = [i["nombre_completo"] for i in r.json()["items"]]
    assert "Fuera De Jerarquia" in names
    # cleanup
    db = TestingSessionLocal()
    from sqlalchemy import delete
    db.execute(delete(Registro).where(Registro.seccion == "7777")); db.commit(); db.close()
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd backend && python3 -m pytest tests/test_scope_coordinador.py -v`
Expected: FAIL (coordinador currently hierarchy-scoped; the unowned registro is gated by territory).

- [ ] **Step 3: Implement** — in `registro_service._role_scoped`, change the `COORDINADOR` branch to return the campaign-scoped base (no hierarchy filter):
```python
    if role == UserRole.COORDINADOR:
        # Campaign executive: sees ALL registros of the campaign (tenant isolation
        # is still enforced by scoped_query). LIDER/below stay hierarchy-scoped.
        return stmt
```
Also in `promovido_service`, the COORDINADOR branch's `or_(..., activista_id.is_(None))` is now redundant — simplify so COORDINADOR reuses the campaign-wide `_role_scoped(ctx)` directly. Leave LIDER as-is.

- [ ] **Step 4: Run test to verify it passes**
Run: `cd backend && python3 -m pytest tests/test_scope_coordinador.py -v`
Expected: PASS.

- [ ] **Step 5: Tenant-isolation regression** — add a test asserting a coordinador in org "alpha" does NOT see a registro from another org/campaign (use an existing beta/other fixture or create one). Run it; expect PASS (scoped_query still isolates).

- [ ] **Step 6: Commit**
```bash
git add backend/app/services/registro_service.py backend/app/services/promovido_service.py backend/tests/test_scope_coordinador.py
git commit -m "feat(rbac): COORDINADOR sees campaign-wide registros/promovidos"
```

---

## Task 2: RBAC — COORDINADOR campaign-wide (militantes + casos)

**Files:**
- Modify: `backend/app/services/militante_service.py` (`_militante_role_scoped`)
- Modify: `backend/app/services/caso_service.py` (`_caso_role_scoped`)
- Test: extend `backend/tests/test_scope_coordinador.py`

**Interfaces:**
- Consumes: same campaign-wide semantics as Task 1.
- Produces: `_militante_role_scoped`/`_caso_role_scoped` return campaign-scoped for COORDINADOR.

- [ ] **Step 1: Write failing tests** — coordinador sees a militante and a caso created outside their hierarchy in the same campaign (mirror Task 1's registro test with Militante + Caso).
- [ ] **Step 2: Verify fail** — Run: `cd backend && python3 -m pytest tests/test_scope_coordinador.py -v` → FAIL on the new cases.
- [ ] **Step 3: Implement** — in both `_militante_role_scoped` and `_caso_role_scoped`, change the COORDINADOR branch to return `scoped_query(Model, ctx)` (campaign-wide), leaving LIDER/ACTIVISTA branches unchanged.
- [ ] **Step 4: Verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(rbac): COORDINADOR sees campaign-wide militantes + casos"`

---

## Task 3: election_date seed (countdown)

**Files:**
- Create: `backend/app/seeds/demo_election_date.py`
- Modify: `backend/app/main.py` (run seed unconditional-idempotent, next to the municipio-intel seed)
- Test: `backend/tests/test_election_date_seed.py`

**Interfaces:**
- Produces: `seed_election_date(db)` — idempotent; ensures a Cargo (`presidencia_municipal`) + a Contest with `election_date=date(2027,6,6)` for the demo campaign (id from env `DEMO_CAMPAIGN_ID`, default `616b72dd-268a-42d9-8c66-008a0780cda8`) if that campaign has no dated contest.

- [ ] **Step 1: Write failing test** — seed against the test DB creates a Contest with election_date 2027-06-06 for a campaign; running twice does not duplicate. (Reuse the Cargo/Contest models; guard existence.)
- [ ] **Step 2: Verify fail** → FAIL (function missing).
- [ ] **Step 3: Implement** the seed, mirroring `scripts/setup_election_2027.py`'s logic (upsert Cargo by key, create Contest only if the campaign has no non-deleted contest, set election_date). Wire it in `main.py` lifespan inside a `try/except` (like the municipio-intel seed), always-run + idempotent. Skip gracefully if the campaign row is absent.
- [ ] **Step 4: Verify pass** → PASS (+ idempotency assertion).
- [ ] **Step 5: Commit** — `git commit -m "feat(seed): idempotent election_date 2027-06-06 for countdown"`

---

## Task 4: Executive dashboard endpoint

**Files:**
- Create: `backend/app/services/dashboard_service.py`
- Create: `backend/app/routers/dashboard.py`
- Modify: `backend/app/main.py` (register router)
- Test: `backend/tests/test_dashboard_executive.py`

**Interfaces:**
- Produces: `GET /dashboard/executive` (campaign-scoped, gated coordinador+) →
```
{
  "election_date": "2027-06-06" | null,
  "promovidos": {"total": int, "meta": int|null, "pct": int|null},
  "afiliados": {"total": int, "validados": int, "meta": int|null},
  "casos": {"total": int, "abiertos": int, "sla_vencidos": int},
  "cobertura": {"secciones": int, "en_riesgo": int, "al_dia": int, "pct_global": int|null},
  "tendencia": [{"semana": str, "promovidos": int}],
  "por_seccion_top": [{"seccion": str, "promovidos": int}],
  "casos_por_estado": [{"estado": str, "n": int}],
  "alertas": [{"seccion": str, "faltan": int}]
}
```

- [ ] **Step 1: Write failing test** — GET /dashboard/executive as coord (with X-Campaign-Id) → 200 with the keys above; unauth → 401.
- [ ] **Step 2: Verify fail** → FAIL.
- [ ] **Step 3: Implement** `dashboard_service.executive(db, ctx)` composing existing services: promovidos total (`promovido_service.list_promovidos` count or a count query), `militante_service.panorama` kpis, `caso_service.panorama` kpis + por_estado, `operacion_service.seguimiento` (cobertura/tendencia/alertas), and `election_date` (min non-null Contest.election_date, campaign-scoped). Router gated `require_roles(ADMIN, COORDINADOR, LIDER, ANALYST, VIEWER)` (superadmin auto). Register in `main.py`.
- [ ] **Step 4: Verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(dashboard): executive campaign endpoint"`

---

## Task 5: Executive Command Center (frontend)

**Files:**
- Create: `frontend/src/api/dashboard.ts`
- Rewrite: `frontend/src/pages/DashboardPage.tsx`
- Test: build + vitest

**Interfaces:**
- Consumes: `GET /dashboard/executive` (Task 4 shape).

- [ ] **Step 1:** Invoke `frontend-design` + `dataviz`. Create `api/dashboard.ts` with `getExecutiveDashboard()` typed to Task 4's shape.
- [ ] **Step 2:** Rewrite `DashboardPage.tsx` to the executive layout with the Atenea kit: `CountdownElectoral` hero (from `election_date`), a KPI row (`MetricCard` v2: promovidos+meta, afiliados, casos abiertos/SLA, cobertura), charts (`AreaTrend` tendencia, `Bars` por_seccion_top, `Donut` casos_por_estado via `ChartFrame`), and an "alertas / qué necesita atención" block from `alertas`. Keep `AppLayout title="Centro de Mando"`. REMOVE the audit-log / fuentes / cartografía blocks (they move to Task 6). Guard every nested access (`data?.x?.y ?? …`).
- [ ] **Step 3:** Verify `cd frontend && npm run build` PASS + `npm run test` PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(dashboard): executive Command Center for campaign roles"`

---

## Task 6: Technical dashboard (superadmin)

**Files:**
- Create: `frontend/src/pages/PlatformDashboardPage.tsx`
- Modify: `frontend/src/modules/registry.ts`
- Test: build + vitest

- [ ] **Step 1:** Invoke `frontend-design`. Move the removed blocks (audit-log activity, pulso operativo, gobernanza/alertas, cobertura territorial + fuentes de datos catalog) from the old DashboardPage into `PlatformDashboardPage.tsx` (reuse the same data hooks: analytics overview + getSources). Keep the Atenea kit styling.
- [ ] **Step 2:** In `registry.ts`, add a module `{ key: "plataforma", path: "/plataforma", label: "Plataforma", section: "administracion", icon: DatabaseIcon, state: "active", element: PlatformDashboard, roles: ["superadmin", "admin"] }`.
- [ ] **Step 3:** Verify build + vitest PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(dashboard): superadmin platform dashboard (moved technical blocks)"`

---

## Task 7: Richer registros/promovidos tables

**Files:**
- Modify: `backend/app/schemas/registro.py` (add `contacto_masked`, `promotor` to `RegistroRead` if missing) + the service that builds it
- Modify: `frontend/src/modules/promovidos/PromovidosPage.tsx`
- Modify: `frontend/src/modules/admin/AdminRegistrosPage.tsx`
- Test: build + vitest; pytest for the schema field

- [ ] **Step 1:** Confirm which fields the promovidos/registros list responses already include (`RegistroRead` has activista_nombre, clave_masked, created_at, seccion, colonia). Add any missing SAFE display fields (`contacto_masked`, `promotor`) to the Read schema + the service mapping — never the raw clave/contacto.
- [ ] **Step 2:** In `PromovidosPage` and `AdminRegistrosPage`, add columns for the newly-available fields: **fecha de captura** (`created_at`, formatted), **contacto** (masked), **promotor/activista**, **colonia**, and the section's **prioridad electoral** (already available via the enriched promovido response). Keep the Atenea table shell + pagination + PII masking.
- [ ] **Step 3:** Verify `cd backend && python3 -m pytest -q` + `cd frontend && npm run build && npm run test` PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(registros): richer columns (fecha/contacto/promotor/colonia/prioridad)"`

---

## Task 8: Integration verify + deploy

- [ ] **Step 1:** Full gates — `cd backend && python3 -m pytest -q` (all green) + `cd frontend && npm run build && npm run test`.
- [ ] **Step 2:** Merge branch → main → push (Railway deploy). The election_date seed runs on boot (countdown lights up); RBAC change is code-only.
- [ ] **Step 3:** Prod e2e: login lucy → Command Center shows countdown + campaign KPIs (no audit/sources); superadmin sees `/plataforma`; search a promovido outside prior scope now appears; tables show new columns.

---

## Self-Review

- **Spec coverage:** §4.1 RBAC → Tasks 1-2; §4.7 election_date → Task 3; §4.2 executive dashboard → Tasks 4-5; §4.3 technical→superadmin → Task 6; §4.4 richer tables → Task 7; verification/deploy → Task 8. §4.5/§4.6 (captura rápida + import masivo) son **Fase 2** — plan aparte, no aquí.
- **Placeholders:** ninguno; código concreto en las tareas backend (RBAC one-liner, seed, endpoint shape); las tareas frontend son de reescritura/conformidad al kit ejecutadas leyendo la página actual.
- **Type consistency:** `getExecutiveDashboard()` ↔ el shape del endpoint (Task 4) usado en Task 5; `RegistroRead` fields (Task 7) ↔ columnas frontend.
