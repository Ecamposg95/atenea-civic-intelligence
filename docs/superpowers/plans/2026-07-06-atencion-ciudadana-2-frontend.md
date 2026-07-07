# Atención Ciudadana — Plan 2: Frontend + addenda

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the Atención Ciudadana frontend — visual form builder, dynamic renderer with on-device OCR assist, cases inbox + Lucy dashboard, election countdown, and the public form UI — plus two small backend addenda (case evidence upload, expose election date).

**Architecture:** New `frontend/src/modules/atencion/` module consuming the Plan-1 API (`/api/forms`, `/api/responses`, `/api/casos`, `/api/public/forms`). Forms are JSON schemas; one dynamic renderer paints any form and validates client-side (mirroring the backend `form_schema` rules). OCR runs on-device (Tesseract.js, lazy-loaded) — the credential photo never leaves the phone. Reuses the militantes capture helpers (PhotoCapture, image compression) and the "Command Center" design system.

**Tech Stack:** React + TS + Vite + Tailwind, axios, Tesseract.js (new frontend dep, lazy). Backend addenda: FastAPI multipart (like militantes doc upload).

## Global Constraints

- Frontend API clients use `apiClient` from `./client`, endpoints WITHOUT `/api` prefix.
- Reuse existing UI: `AppLayout`, `PageHeader`, `Card`, `DataState`, `useAsync`, `AnimatedNumber`, `Sparkline`, `field-input`/`field-label`/`btn-primary`/`card-premium`/`pill`/`metric-chip` classes. Do NOT invent new global CSS/tokens.
- Estados `PENDIENTE|EN_PROCESO|ATENDIDO|CERRADO`; tipos `PETICION|QUEJA|APOYO|OTRO`; canales `INTERNO|PUBLICO|AMBOS`. Estado color semantics: PENDIENTE=neutral, EN_PROCESO=accent/cyan, ATENDIDO=success/teal, CERRADO=muted.
- Field types (must match backend `form_schema.FIELD_TYPES`): `text, textarea, number, date, select, multiselect, boolean, phone, email, seccion, foto`.
- Conditional logic: a field/section with `mostrar_si: {campo, igual}` is shown only when `answers[campo] === igual`.
- OCR is ASSIST ONLY: prefills, always editable, marked "OCR — verifica". Never authoritative.
- Verify each frontend task with `cd frontend && rm -rf dist tsconfig.tsbuildinfo && npm run build && npm run test` (build + vitest green). Frontend agents in the same wave must NOT run build concurrently — the controller builds once, OR run only `npx tsc --noEmit` scoped.
- API read shapes (from Plan 1, verbatim):
  - `FormDefinition`: {id, nombre, descripcion?, tipo, slug, canal, schema: object, is_active, version}
  - `Caso`: {id, folio, tipo, titulo, descripcion?, ciudadano_nombre?, contacto_masked?, seccion?, colonia?, estado, prioridad, fecha_compromiso?, asignado_a?, asignado_nombre?, channel, moderacion}
  - `CasoList`: {items, total, limit, offset, has_territory}
  - `CasoEventoRead`: {id, caso_id, tipo, texto?, evidencia_url?, actor_nombre?}
  - `FormResponseRead`: {id, caso_id?, moderacion}
  - `CasoPanorama`: {kpis:{total,pendientes,en_proceso,atendidos,cerrados,sla_vencidos,tiempo_prom_dias}, por_estado, por_colonia:[...], por_responsable:[...]}
- Endpoints: `GET/POST /forms`, `GET/PATCH /forms/{id}`, `GET /forms/slug/{slug}`; `POST /responses`; `GET /casos`, `GET /casos/panorama`, `GET /casos/{id}`, `PATCH /casos/{id}/estado`, `PATCH /casos/{id}/asignar`, `POST /casos/{id}/eventos`; `GET /public/forms/{slug}`, `POST /public/forms/{slug}/responses`.

---

## Task 1: Backend addenda — case evidence upload + expose election date

**Files:**
- Modify: `backend/app/routers/casos.py` (add a multipart evidence-upload branch/endpoint)
- Modify: `backend/app/services/caso_service.py` (accept evidence bytes in `add_evento`, already supports bytes per Plan 1 — wire the router)
- Modify: `backend/app/services/analytics_service.py` (or the endpoint DashboardPage consumes) to include `election_date`
- Test: `backend/tests/test_casos_api.py` (append), `backend/tests/test_analytics.py` (append or new)

**Interfaces:**
- Produces: `POST /api/casos/{cid}/evidencia` (multipart `file` → uploads to bucket → returns `{evidencia_key}`) OR extend eventos to accept multipart; the analytics overview response gains `election_date: str|None` (soonest `Contest.election_date` for the ctx campaign).

- [ ] **Step 1: Evidence upload test** — append to `test_casos_api.py`: a coordinador POSTs a small file to `/api/casos/{id}/evidencia` (multipart), gets `200` + an `evidencia_key`; then `POST /casos/{id}/eventos` with `{tipo:"EVIDENCIA", evidencia_key}` records the evento and `GET /casos/{id}` timeline shows it. Monkeypatch `storage.put_object`/`presigned_get`.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** the multipart `POST /casos/{cid}/evidencia` in `casos.py` (mirror `militantes.py` `upload_doc`: read file, size guard `6MB`, `caso_service` uploads to bucket key `casos/{campaign}/{caso}/ev-{uuid}.jpg`, return the key). Ensure `add_evento` persists `evidencia_key` and `CasoEventoRead.evidencia_url` is a presigned GET (audited).

- [ ] **Step 4: Election date test** — append to analytics tests: the overview endpoint (the one `DashboardPage` calls — find it in `frontend/src/api/analytics.ts` → matches a backend route) returns `election_date` = the soonest non-null `Contest.election_date` for the campaign, or null.

- [ ] **Step 5: Implement** — in `analytics_service` (or the relevant service), query `min(Contest.election_date)` for the campaign's contests and add `election_date` to the overview payload + its Pydantic schema.

- [ ] **Step 6: Run — expect PASS.** `cd backend && python3 -m pytest tests/test_casos_api.py tests/test_analytics.py -q` then `python3 -m pytest -q` (baseline 394).

- [ ] **Step 7: Commit.**

```bash
git add backend/app/routers/casos.py backend/app/services/caso_service.py backend/app/services/analytics_service.py backend/app/schemas/ backend/tests/
git commit -m "feat(atencion): case evidence upload endpoint + expose election_date in overview"
```

---

## Task 2: Frontend API clients + types

**Files:**
- Create: `frontend/src/api/atencion.ts`
- Test: build check.

**Interfaces:**
- Produces: types (`FormDefinition`, `FormSchema`, `FormField`, `Caso`, `CasoEvento`, `CasoPanorama`, `FormResponsePayload`) + functions: `listForms`, `getForm`, `getFormBySlug`, `createForm`, `updateForm`, `submitResponse`, `listCasos`, `getCaso`, `getCasoPanorama`, `setCasoEstado`, `asignarCaso`, `addEvento`, `uploadCasoEvidencia`, `getPublicForm`, `submitPublicResponse`.

- [ ] **Step 1: Implement** `frontend/src/api/atencion.ts` — TS interfaces matching the Global-Constraints read shapes; each function wraps `apiClient` (e.g. `createForm = (p) => apiClient.post("/forms", p).then(r=>r.data)`). `uploadCasoEvidencia(id, blob)` posts multipart to `/casos/{id}/evidencia`. `getPublicForm`/`submitPublicResponse` hit `/public/forms/{slug}` (public flow sends no auth header — the endpoint ignores it). Model `FormField = {key, tipo, label, requerido?, opciones?, sensible?, mostrar_si?}`, `FormSchema = {secciones: {titulo, campos: FormField[]}[]}`.

- [ ] **Step 2: Build check** (`npm run build`) + **Commit.**

```bash
git add frontend/src/api/atencion.ts && git commit -m "feat(atencion): frontend API client + types"
```

---

## Task 3: On-device OCR (Tesseract.js) + INE parser

**Files:**
- Modify: `frontend/package.json` (add `tesseract.js`)
- Create: `frontend/src/modules/atencion/lib/ocr.ts`
- Test: `frontend/src/modules/atencion/lib/__tests__/ocr.test.ts` (parser only, mock OCR text)

**Interfaces:**
- Produces: `runOcr(blob: Blob): Promise<string>` (lazy-imports tesseract, recognizes Spanish), `parseIne(text: string): {nombre?, curp?, clave?, seccion?, domicilio?}` (regex parser — pure, unit-tested), `scanIne(blob): Promise<{fields, confidence}>`.

- [ ] **Step 1: Write the failing parser test** — given a sample OCR text block containing `CLAVE DE ELECTOR XXXX...`, `CURP ...`, `NOMBRE ...`, `SECCION 4127`, `parseIne` extracts the fields. (CURP = 18-char regex `[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]{2}`; clave = 18 uppercase alnum; seccion = 4 digits after "SECCI".)

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `ocr.ts`:
  - `runOcr`: `const { default: Tesseract } = await import("tesseract.js"); const { data } = await Tesseract.recognize(blob, "spa"); return data.text;`
  - `parseIne(text)`: regex-extract nombre/curp/clave/seccion/domicilio (uppercase-normalize; be defensive — missing fields omitted).
  - `scanIne(blob)`: `parseIne(await runOcr(blob))` + a crude confidence (fields found / 5).

- [ ] **Step 4: Run — expect PASS** (`npm run test`).

- [ ] **Step 5: Commit.**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/modules/atencion/lib/ocr.ts frontend/src/modules/atencion/lib/__tests__/ocr.test.ts
git commit -m "feat(atencion): on-device OCR (Tesseract.js) + INE field parser"
```

---

## Task 4: Dynamic form renderer

**Files:**
- Create: `frontend/src/modules/atencion/components/DynamicForm.tsx`
- Test: `frontend/src/modules/atencion/components/__tests__/DynamicForm.test.tsx`

**Interfaces:**
- Consumes: `FormSchema`, `FormField`.
- Produces: `<DynamicForm schema value onChange errors />` — renders each `seccion`/`campo` by type; hides fields whose `mostrar_si` is unmet; `validate(schema, value): Record<key,string>` (required + conditional, mirroring backend `form_schema`).

- [ ] **Step 1: Write the failing test** — render a schema with a `text` required field + a `select` gated by `mostrar_si`; assert the gated field only appears when the trigger equals the value; `validate` flags the missing required field.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `DynamicForm.tsx` — map `tipo`→input (text/textarea/number/date/phone/email→`field-input`; select→`<select>`; multiselect→checkboxes; boolean→toggle; seccion→numeric input; foto→`PhotoCapture` from militantes). Respect `mostrar_si`. Export `validate(schema, value)`.

- [ ] **Step 4: Run — expect PASS.** **Commit.**

```bash
git add frontend/src/modules/atencion/components/DynamicForm.tsx frontend/src/modules/atencion/components/__tests__/DynamicForm.test.tsx
git commit -m "feat(atencion): dynamic JSON-schema form renderer + client validation"
```

---

## Task 5: Visual form builder

**Files:**
- Create: `frontend/src/modules/atencion/FormBuilderPage.tsx`
- Create: `frontend/src/modules/atencion/components/FieldEditor.tsx`

**Interfaces:**
- Consumes: `createForm`, `updateForm`, `getForm`, `DynamicForm` (preview).
- Produces: default export `FormBuilderPage` (route `/atencion/formularios`).

- [ ] **Step 1: Implement** the builder (COORDINADOR/ADMIN): left = field-type palette (the 11 types) + section management (add/rename/reorder sections, add fields into a section); center = the form structure (each field editable via `FieldEditor`: label, key, requerido, opciones for select/multiselect, sensible toggle, `mostrar_si` rule builder referencing earlier fields); right = live **preview** via `<DynamicForm>`. Form meta: nombre, tipo, canal, slug (auto-slugify nombre, editable). Save → `createForm`/`updateForm` with the assembled `schema` JSON. Reordering can be simple up/down buttons (no drag-drop dependency required; drag-drop optional). Use house classes.

- [ ] **Step 2: Build check.** **Commit.**

```bash
git add frontend/src/modules/atencion/FormBuilderPage.tsx frontend/src/modules/atencion/components/FieldEditor.tsx
git commit -m "feat(atencion): visual form builder (field palette, sections, conditional logic, live preview)"
```

---

## Task 6: Capture page (renderer + OCR) — internal channel

**Files:**
- Create: `frontend/src/modules/atencion/CapturaAtencionPage.tsx`

**Interfaces:**
- Consumes: `getForm`/`listForms`, `DynamicForm`, `scanIne` (OCR), `submitResponse`.
- Produces: default export `CapturaAtencionPage` (route `/atencion/captura`, ACTIVISTA+).

- [ ] **Step 1: Implement** — select an active form (list forms with canal INTERNO/AMBOS) → render via `<DynamicForm>`. A prominent **"Escanear credencial (OCR)"** button: opens camera (`PhotoCapture`), runs `scanIne`, prefills the mapped fields (`nombre/curp/clave/seccion/domicilio` → matching form keys), marks them "OCR — verifica" (editable). Submit → `submitResponse` → success screen showing the returned `caso_id`/folio + "Capturar otro". Reuse the militantes capture look; mobile-first; online-first guard.

- [ ] **Step 2: Build check.** **Commit.**

```bash
git add frontend/src/modules/atencion/CapturaAtencionPage.tsx
git commit -m "feat(atencion): internal capture — dynamic form + OCR credential scan"
```

---

## Task 7: Cases inbox + detail drawer

**Files:**
- Create: `frontend/src/modules/atencion/CasosPage.tsx`
- Create: `frontend/src/modules/atencion/components/CasoDetail.tsx`

**Interfaces:**
- Consumes: `listCasos`, `getCaso`, `setCasoEstado`, `asignarCaso`, `addEvento`, `uploadCasoEvidencia`.
- Produces: `CasosPage` (route `/atencion/casos`, COORDINADOR+), `<CasoDetail id onClose onChanged />`.

- [ ] **Step 1: Implement** inbox — filters (estado select, tipo, colonia, asignado, q), paginated table (folio, titulo, tipo, seccion/colonia, estado pill w/ semantics, **SLA badge**: `fecha_compromiso` past & not ATENDIDO/CERRADO → red "vencido", within 2 days → amber, else neutral), `has_territory` empty-state. Row → `CasoDetail`.

- [ ] **Step 2: Implement** detail — header (folio/tipo/estado/prioridad/SLA), ciudadano (contacto_masked), **bitácora timeline** (eventos w/ evidencia_url thumbnails), actions: change estado (`setCasoEstado` + nota), reasignar (`asignarCaso`), add nota/evidencia (`addEvento` / `uploadCasoEvidencia` then evento). `onChanged` refreshes.

- [ ] **Step 3: Build check.** **Commit.**

```bash
git add frontend/src/modules/atencion/CasosPage.tsx frontend/src/modules/atencion/components/CasoDetail.tsx
git commit -m "feat(atencion): cases inbox (SLA semáforo) + detail drawer (bitácora, estado, asignar, evidencia)"
```

---

## Task 8: Lucy dashboard (panorama)

**Files:**
- Create: `frontend/src/modules/atencion/PanoramaAtencionPage.tsx`

**Interfaces:**
- Consumes: `getCasoPanorama`, `useAsync`, `DataState`, chart primitives.
- Produces: `PanoramaAtencionPage` (route `/atencion`, COORDINADOR+).

- [ ] **Step 1: Implement** — KPI row (total, pendientes, atendidos, **SLA vencidos** as hero warning, tiempo_prom_dias) via `metric-chip`/`AnimatedNumber`; blocks: por_estado (donut/bars), **por_colonia** (table/bar = "semáforo territorial"), por_responsable (ranking table w/ pendientes). `PageHeader` eyebrow "Atención Ciudadana", title "Panorama de", accent "Casos". `DataState` wrap.

- [ ] **Step 2: Build check.** **Commit.**

```bash
git add frontend/src/modules/atencion/PanoramaAtencionPage.tsx
git commit -m "feat(atencion): Lucy dashboard — casos por estado/colonia/responsable + SLA semáforo"
```

---

## Task 9: Election countdown on main dashboard

**Files:**
- Create: `frontend/src/components/CountdownElectoral.tsx`
- Modify: `frontend/src/api/analytics.ts` (type gains `election_date`)
- Modify: `frontend/src/pages/DashboardPage.tsx` (render the widget)
- Test: `frontend/src/components/__tests__/CountdownElectoral.test.tsx`

**Interfaces:**
- Produces: `<CountdownElectoral date={string|null} />` — shows **días y horas** remaining to `date`; if null → CTA "configura la fecha de elección". Ticks each minute.

- [ ] **Step 1: Write the failing test** — given a `date` ~2 days + a few hours out (compute from a fixed base passed in, NOT Date.now in the test assertion beyond tolerance), the component renders the correct days; with `date={null}` it renders the config CTA.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `CountdownElectoral.tsx` (compute diff to `new Date(date)`, split into días/horas, `AnimatedNumber` for the day count, hero styling with existing tokens; `setInterval` 60s; handle past date → "Jornada electoral"). Add `election_date` to the analytics overview TS type; in `DashboardPage`, render `<CountdownElectoral date={overview.election_date} />` in the hero area.

- [ ] **Step 4: Run — expect PASS** + build. **Commit.**

```bash
git add frontend/src/components/CountdownElectoral.tsx frontend/src/components/__tests__/CountdownElectoral.test.tsx frontend/src/api/analytics.ts frontend/src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): countdown to election day (días y horas)"
```

---

## Task 10: Public form UI

**Files:**
- Create: `frontend/src/modules/atencion/PublicFormPage.tsx`
- Modify: the router (add a PUBLIC route `/p/:slug` OUTSIDE the authenticated `AppLayout` shell — find the top-level route config, e.g. `App.tsx`/`main.tsx`)

**Interfaces:**
- Consumes: `getPublicForm`, `submitPublicResponse`.
- Produces: `PublicFormPage` (route `/p/:slug`, no auth).

- [ ] **Step 1: Implement** — standalone page (no sidebar/topbar): fetch `getPublicForm(slug)` (404 → friendly "formulario no disponible"), render via `<DynamicForm>`, submit → `submitPublicResponse` → thank-you screen ("Tu petición fue recibida"). Minimal, clean, no PII shown back. Note in a code comment: this route is only reachable when the backend flag `PUBLIC_FORMS_ENABLED` is on; anti-abuse pending.

- [ ] **Step 2: Build check.** **Commit.**

```bash
git add frontend/src/modules/atencion/PublicFormPage.tsx frontend/src/App.tsx
git commit -m "feat(atencion): public form UI (/p/:slug, outside auth shell)"
```

---

## Task 11: Registry + frontend-design pass

**Files:**
- Modify: `frontend/src/modules/registry.ts`
- Modify: the atención module pages/components (design pass)

- [ ] **Step 1: Register** in `registry.ts` (lazy imports, section `ciudadania`, state `active`): `/atencion` (Panorama, COORDINADOR+, end:true), `/atencion/casos` (Casos, COORDINADOR+), `/atencion/captura` (Captura, ACTIVISTA+ via CONSOLE_CAPTURA), `/atencion/formularios` (Builder, COORDINADOR/ADMIN). Labels: "Panorama ciudadano", "Casos", "Atender ciudadano", "Formularios". (Public `/p/:slug` is NOT a registry module — it's a top-level route.)

- [ ] **Step 2: Build + test.** `cd frontend && rm -rf dist tsconfig.tsbuildinfo && npm run build && npm run test`.

- [ ] **Step 3: Invoke the `frontend-design` skill** and apply an intentional pass across the atención module: SLA semáforo color semantics (accessible), the OCR scan affordance as a hero action in capture, the builder's palette/preview clarity, the countdown as a dashboard hero. Keep "Command Center" tokens; no new global CSS. Build + test again.

- [ ] **Step 4: Commit.**

```bash
git add frontend/src && git commit -m "feat(atencion): register modules + frontend-design pass"
```

---

## Self-Review notes (author)

- **Spec coverage (frontend):** builder (T5), renderer (T4), OCR (T3+T6), casos inbox+detail (T7), Lucy dashboard (T8), countdown (T9), public UI (T10), registry+design (T11), evidence upload + election_date addenda (T1), API client (T2). All spec §5/§6 mapped.
- **Deferred/flagged:** OCR accuracy is assist-only (spec §6). Public anti-abuse still deferred (spec §7); the `/p/:slug` route only functions when the backend flag is on. Drag-drop in the builder is optional (up/down reorder acceptable) to avoid a heavy dep.
- **Type consistency:** field types match backend `form_schema.FIELD_TYPES`; estados/tipos/canales identical to Plan 1; `mostrar_si` semantics identical client/server.
- **Deploy (after this plan):** merge feat/atencion-ciudadana → main (Alembic 0016 runs), set `PUBLIC_FORMS_ENABLED` only after anti-abuse; verify e2e. Requires explicit user OK (prod deploy).
