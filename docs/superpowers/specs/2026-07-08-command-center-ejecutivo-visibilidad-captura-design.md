# Diseño — Command Center ejecutivo + Visibilidad y Captura (Lucy)

**Fecha:** 2026-07-08
**Autor:** Emmanuel Campos (con Claude)
**Estado:** Aprobado en brainstorming — pendiente de revisión de spec

---

## 1. Contexto y objetivo

Lucy es la **coordinadora / ejecutiva** que corre la campaña real de San Mateo Atenco 2027 sobre Atenea. Hoy su experiencia tiene tres fricciones:

1. **El Command Center no es ejecutivo.** `pages/DashboardPage.tsx` muestra actividad del *audit log*, catálogo de *fuentes de datos*, ingesta y cartografía/"gobernanza de datos" — un panel de **plataforma/superadmin**, no de campaña. No hay promovidos/afiliados/casos/metas/countdown útiles.
2. **No ve toda su campaña.** El scope RBAC del COORDINADOR está limitado a su **jerarquía** (`_role_scoped`), así que ve ~3,159 de 3,502 promovidos; ~343 (y afiliados/casos capturados fuera de su sub-árbol o territorio) quedan invisibles — p.ej. un promovido "Víctor Garduño" reciente.
3. **La captura no escala.** Los flujos de captura (form grande de militante, import previo de promovidos) no facilitan meter volumen en campo.

**Objetivo:** volver el Command Center un **tablero ejecutivo de campaña**, darle a Lucy visibilidad **de toda su campaña** con **tablas más ricas**, y **ampliar la captura** (rápida individual + masiva por Excel). El countdown electoral debe verse funcionando.

## 2. Decisiones cerradas (brainstorming)

- **Alcance del COORDINADOR = campaña completa.** Ve todos los promovidos/afiliados/casos de su campaña (no solo su jerarquía). LIDER se mantiene jerárquico. Cambia la semántica del coordinador en toda la plataforma; válido para campañas con un coordinador-líder (San Mateo). Multi-coordinador por campaña se afina después.
- **Dashboard técnico se MUEVE a un dashboard solo-superadmin** (audit/fuentes/cartografía/gobernanza). El Command Center de Lucy queda 100% ejecutivo. Nada se elimina, se reubica por rol.
- **Captura = AMBAS**: captura rápida (form mínimo, mobile-first) + importación masiva (Excel/CSV con mapeo + validación + preview).
- **Countdown**: setear `election_date = 2027-06-06` (primer domingo de junio) para la campaña, de forma idempotente.

## 3. Alcance y NO-goals

**En alcance (SP A+B):** RBAC coordinador campaign-wide; Command Center ejecutivo; dashboard técnico superadmin; tablas de registros/promovidos con más columnas; captura rápida; importación masiva; seed idempotente del `election_date`.

**Fuera (sub-proyectos aparte, ya decomponidos):** 🅲 **Acuerdos y Minutas** (módulo nuevo) y 🅳 **CRM Político** (módulo nuevo) — cada uno con su propio spec → plan.

**No-goals:** no rehacer el modelo RBAC de 9 roles (solo ampliar el scope del coordinador); no tocar el cifrado/PII (clave sigue enmascarada + reveal auditado); no romper los módulos existentes.

## 4. Diseño

### 4.1 RBAC — COORDINADOR campaign-wide
- `backend/app/services/registro_service.py::_role_scoped`: para `COORDINADOR`, devolver `scoped_query(Registro, ctx)` (campaña/org completa) en vez del filtro de jerarquía. LIDER/ACTIVISTA/CAPTURISTA sin cambio.
- Revisar y alinear el mismo criterio en `promovido_service` (el OR con `activista_id IS NULL` ya no hace falta para coordinador), `militante_service` y `caso_service` (panorama/listas) para que "todo de la campaña" sea consistente en promovidos, afiliados y casos.
- Tests: un coordinador ve registros de activistas fuera de su sub-árbol dentro de su campaña; NO ve otra campaña/org (aislamiento de tenant intacto).

### 4.2 Command Center ejecutivo (`DashboardPage`)
- **Hero:** `CountdownElectoral` prominente (días/horas a la jornada) + título de campaña.
- **KPIs de campaña** (`MetricCard` v2, kit Atenea): Promovidos (+meta/avance %), Afiliados/militantes (+meta), Casos abiertos (+en riesgo SLA), Cobertura seccional, Secciones en riesgo (del War Room).
- **Gráficas:** ritmo de captura semanal (`AreaTrend`, acumulado), promovidos por sección top (`Bars`), casos por estado (`Donut`).
- **"Qué necesita atención":** alertas del seguimiento (secciones rezagadas), casos SLA vencidos.
- **Backend:** endpoint `GET /dashboard/executive` (campaign-scoped) que compone los KPIs ya calculables (reutiliza `promovido/militante/caso/operacion_service`) + `election_date`. Alternativa: el frontend compone de endpoints existentes; se prefiere un endpoint para una sola llamada.
- Gating: coordinador+ (la vista ejecutiva es la default para todos los roles de campaña; superadmin/admin también la ven).

### 4.3 Dashboard técnico → superadmin
- Nueva página `pages/PlatformDashboardPage.tsx` (o mover los bloques): audit-log/actividad, fuentes de datos, cartografía/cobertura de ingesta, gobernanza. Ruta `/plataforma` (o `/admin/plataforma`), gated **solo superadmin/admin** en `registry.ts`.
- Sacar esos bloques de `DashboardPage`.

### 4.4 Tablas de registros/promovidos con más datos
- Promovidos (`PromovidosPage`) y Registros (`AdminRegistrosPage`): añadir columnas de campos ya disponibles en el modelo/respuesta pero no mostrados: **contacto_masked**, **promotor**, **fecha de captura** (`created_at`), **colonia**, **prioridad electoral** de la sección, **activista/capturó**. Respetar PII (clave sigue enmascarada; contacto enmascarado; reveal auditado sin cambio).
- Si un campo no viene en la respuesta de lista, agregarlo al `Read` schema del endpoint (sin exponer PII cruda).

### 4.5 Captura rápida
- Nueva vista/modo **"Captura rápida"** (mobile-first): formulario mínimo para promovido y para afiliado (nombre, sección, teléfono/contacto, promotor), envío veloz con "guardar y capturar otro" (reset y foco). Reusa los endpoints de captura existentes; sin OCR ni fotos (eso queda en el flujo completo).
- Entrada prominente para Lucy y roles de campo.

### 4.6 Importación masiva (Excel/CSV)
- Flujo de import: subir archivo → **mapeo de columnas** (nombre, sección, teléfono, promotor, colonia…) → **validación + preview** (filas válidas/erróneas, duplicados por nombre+sección) → **commit** (crear en lote, idempotente por `client_uuid`/hash) → resumen.
- Reusar el **motor de ingestión** existente (`DataSource`/`IngestRun`, `scripts/ingest_*`) donde aplique, o un endpoint dedicado `POST /promovidos/import` + `POST /militantes/import`. Auditar el lote.
- Es la pieza más grande de captura; puede ir en una fase posterior.

### 4.7 election_date (countdown)
- Seed idempotente que asegura, para la campaña demo (id `616b72dd-…`), un `Cargo` + `Contest` con `election_date = 2027-06-06` (reusa la lógica de `scripts/setup_election_2027.py`). Correrlo incondicional-idempotente en el arranque (patrón del census de San Mateo) para no depender de flags. El overview ya lee `min(Contest.election_date)`.

## 5. Fases sugeridas (para el plan)

- **Fase 1 — Ver todo + ejecutivo (núcleo):** RBAC coordinador campaign-wide (§4.1) + `election_date` seed (§4.7) + Command Center ejecutivo (§4.2) + dashboard técnico superadmin (§4.3) + tablas más ricas (§4.4). Sin migración.
- **Fase 2 — Captura:** captura rápida (§4.5) + importación masiva (§4.6). La masiva puede sub-dividirse.

## 6. Verificación

- Backend: `pytest` (nuevos tests de scope coordinador campaign-wide + aislamiento de tenant + import). Frontend: `npm run build` + `npm run test`.
- E2e en prod: Lucy ve el countdown corriendo, KPIs de campaña, y encuentra a "Víctor Garduño"; superadmin ve el dashboard técnico; captura rápida crea un promovido; import de un Excel de prueba.
- Regla dura: PII intacta (clave enmascarada + reveal auditado), aislamiento de tenant intacto, kit Atenea + robustez (ErrorBoundary/guards) mantenidos.

## 7. Riesgos

- **Scope coordinador global:** amplía visibilidad de TODOS los coordinadores a su campaña completa. Deliberado; documentar. Si un tenant necesita multi-coordinador aislado, se añade un flag después.
- **Import masivo:** validación/dedup/PII — cuidar cifrado de contacto/clave y no duplicar. Es la pieza de mayor superficie; aislar en su fase.
- **Mover bloques del dashboard:** no perder funcionalidad; los módulos Auditoría/Fuentes/Territorios ya existen — el dashboard técnico superadmin es un resumen, no la única puerta.
