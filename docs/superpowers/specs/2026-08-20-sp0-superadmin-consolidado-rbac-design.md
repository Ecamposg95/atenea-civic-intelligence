# SP-0 · Superadmin consolidado & RBAC repair — Design

- **Fecha:** 2026-08-20
- **Estado:** Aprobado (diseño validado en chat)
- **Programa:** ATENEA Territorial Intelligence (task pack maestro) — sub-proyecto 0 de 7.
  El orden acordado del programa: SP-0 (este) → SP-1 modelo territorial → SP-2 analytics
  engine → SP-3 intelligence API + territory detail → SP-4 GIS → SP-5 command center /
  compare / watchlist → SP-6 ingestion framework.

---

## 1. Problema

El modo consolidado del SUPERADMIN ("Todas las bases", sin `X-Campaign-Id`) solo funciona
en los routers que usan `AdminCtx` o `Tenant` (`/admin/*`, `/registros/export`,
`/reports/*`, `/arco/*`, analytics/maps/intel/municipio/territory/sources/ingest/audit).
Los ~10 routers que usan `CampaignCtx` — **incluido el Command Center
(`/dashboard/executive`)**, `/registros`, `/promovidos`, `/militantes`, `/casos`,
`/forms`, `/responses`, `/minutas`, `/scrum`, `/operacion` — devuelven
`400 X-Campaign-Id header required`. En consolidado, un superadmin ve *menos* datos
operativos que un coordinador dentro de su campaña.

Además existen inconsistencias de gates detectadas en el análisis RBAC (2026-08-20):

1. `dashboard` en `registry.ts` tiene `roles: ALL`, pero `/dashboard/executive` excluye
   ACTIVISTA/CAPTURISTA → ven "Inicio" en el menú y reciben 403.
2. COORDINADOR puede capturar registros (`CapturaWriteCtx`) pero está excluido de
   `GET /privacy/notice`, que su propia captura requiere consultar.
3. El módulo `captura` (activistas) excluye `coordinador` en el registry aunque el
   backend lo permite (y `captura-rapida` sí lo incluye).
4. Cuatro-cinco listas de roles "intel read" divergentes mantenidas a mano en
   `/intel`, `/analytics`, `/maps`, `/municipio`, `/territory`.
5. `POST /campaigns` con superadmin consolidado → IntegrityError/500
   (`organization_id=None` contra columna NOT NULL).
6. ANALYST y VIEWER jamás se siembran (solo existen en fixtures de tests): su matriz
   nunca se ha validado fuera de CI.
7. Docstring de `exports.py` describe una matriz obsoleta (omite COORDINADOR).
8. Spec RBAC v2 (2026-06-29) desactualizada: el alcance campaña-completa del
   COORDINADOR y su acceso a reveal fueron cambios deliberados posteriores
   (Command Center 2026-07-08) que la spec no refleja.

## 2. Decisiones de producto (validadas con el usuario)

- **Consolidado = todo, agregado cross-tenant.** El superadmin sin base seleccionada ve
  datos de TODAS las organizaciones y campañas en dashboard ejecutivo, registros,
  promovidos, militantes, casos, atención (forms/responses), minutas, scrum y operación,
  con indicación de la base de origen por fila.
- **Consolidado = solo lectura.** Toda escritura (capturar, crear casos, mover tarjetas,
  crear campañas…) exige elegir una base primero; la UI lo comunica con claridad.
  Garantizado por construcción: solo los endpoints GET adoptan el contexto consolidado.
- **Alcance SP-0 incluye** los fixes menú↔backend, la unificación de listas intel,
  la actualización de docs RBAC y las cuentas demo ANALYST/VIEWER.
- **Enfoque técnico: A** — contexto consolidado explícito por endpoint (patrón
  `get_admin_context` generalizado), descartando cambiar la semántica central de
  `CampaignCtx` (default-deny irrenunciable) y la agregación en frontend.

## 3. Diseño

### 3.1 Backend — dependency `ConsolidatedReadCtx`

En `app/dependencies.py`:

```python
def get_consolidated_read_context(...) -> CampaignContext:
    """Superadmin sin X-Campaign-Id → contexto consolidado cross-tenant
    (organization_id=None, campaign_id=""). Cualquier otro caso delega en
    get_campaign_context sin cambios. Solo para endpoints de LECTURA."""
```

Mismo comportamiento que `get_admin_context` hoy; se expone como alias anotado
`ConsolidatedReadCtx` y se aplica a los endpoints **GET** de: `dashboard.py`,
`registros.py` (list + detail), `promovidos.py`, `militantes.py`, `casos.py`,
`forms.py`, `responses.py`, `minutas.py`, `scrum.py`, `operacion.py`.
Los endpoints de escritura de esos routers conservan `CampaignCtx` intacto.

`POST /campaigns`: si `ctx.organization_id is None` (superadmin consolidado), responder
`400 {"error": {"message": "Selecciona una base para crear campañas", "status": 400}}`
en lugar del 500 actual.

### 3.2 Backend — servicios y schemas

- `scoped_query` ya devuelve consulta sin filtro org/campaña cuando
  `is_superadmin and organization_id is None`; **no se toca**.
- Auditar cada service convertido (`registro_service`, `promovido_service`,
  `militante_service`, `caso_service`, `form_service`, `response_service`,
  `minuta_service`, `scrum_service`, `operacion_service`, `dashboard_service`) por
  filtros o joins que asuman `ctx.campaign_id` no vacío; corregirlos con el guard
  `if ctx.campaign_id:` (patrón ya usado en los services con soporte AdminCtx).
- Schemas de items de lista: exponer `campaign_id` (la mayoría de modelos ya lo tiene
  vía `TenantMixin`; solo se añade al schema donde falte). El frontend resuelve
  nombre de campaña/org con `/campaigns/mine`, que para superadmin ya devuelve todas
  las campañas de todos los tenants — sin joins nuevos ni N+1.
- `dashboard_service.executive` en consolidado devuelve:

```json
{
  "consolidated": true,
  "global": { "promovidos": 0, "afiliados": 0, "casos": 0, "...": "totales cross-tenant" },
  "campaigns": [
    { "campaign_id": "...", "campaign_name": "...", "organization_name": "...",
      "kpis": { }, "election_date": "...", "days_to_election": 0 }
  ]
}
```

  Countdown, tendencia y alertas viven **por campaña** (no tienen sentido globales).
  Con base seleccionada, la respuesta actual no cambia (`consolidated: false` implícito
  u omitido — el schema actual se conserva como está para no romper el frontend).

### 3.3 Frontend

- Flag `isConsolidated` derivada del store existente del `CampaignSwitcher`
  (base activa === "Todas las bases").
- En consolidado: columna **Base** (nombre de campaña, tooltip con org) en las tablas de
  promovidos, registros admin*, militantes, casos, minutas, tablero scrum (solo lectura)
  y operación; botones de crear/editar/importar ocultos; `DashboardPage` renderiza la
  variante consolidada (KPIs globales + tarjetas por campaña, cada una con su countdown).
  (*la tabla admin ya funciona consolidada; solo gana la columna Base.)
- Fixes de gates:
  - `registry.ts`: `dashboard` excluye `activista`/`capturista`; su ruta post-login pasa
    a la consola de captura (hoy: menú visible + 403 al cargar).
  - `registry.ts`: `captura` añade `coordinador` (alinea con `CapturaWriteCtx`).
  - `plan-territorial`/`war-room` vs `/operacion` `_READ` (analyst/viewer): se
    **documenta como intencional** — el dashboard ejecutivo de ANALYST/VIEWER compone
    `operacion_service.seguimiento`, así que el backend debe permitirles lectura aunque
    el frontend no les muestre las consolas operativas. Sin cambio de código.

### 3.4 Backend — gates menores + unificación intel

- `routers/privacy.py`: añadir COORDINADOR al gate de `GET /privacy/notice`.
- `app/dependencies.py`: dos constantes compartidas que reemplazan las listas locales:
  - `INTEL_READ_ROLES = (SUPERADMIN, ADMIN, ANALYST, VIEWER, LIDER)` → usada por `/intel`.
  - `INTEL_OPS_READ_ROLES = INTEL_READ_ROLES + (COORDINADOR,)` → usada por `/analytics`,
    `/maps`, `/municipio`, `/territory` (lecturas).
  Comportamiento actual **preservado** (la exclusión de COORDINADOR en `/intel` es
  decisión UX-4 deliberada); el cambio es de mantenibilidad, no de permisos.
- `routers/exports.py`: corregir docstring (incluye COORDINADOR sin reveal).

### 3.5 Seeds y documentación

- `bootstrap.py` (o seed equivalente): cuentas demo opt-in
  `analyst@demo.agora.mx` / `viewer@demo.agora.mx`, gate por `SEED_ANALYST_PASSWORD` /
  `SEED_VIEWER_PASSWORD` (mismo patrón que los seeds de Lucy: ausente → se omite,
  sin contraseñas default).
- Nuevo `docs/RBAC-MATRIX.md`: matriz real vigente (rol → endpoints backend, módulos
  frontend, alcance de datos), incorporando los cambios de esta spec. Nota al inicio de
  la spec RBAC v2 (2026-06-29) apuntando a ese doc como fuente de verdad viva.

## 4. Fuera de alcance

- Revertir las divergencias deliberadas del COORDINADOR (alcance campaña-completa,
  reveal): comportamiento vigente por decisión del Command Center; solo se documentan.
- `scrum._MOVE == _READ` (propiedad validada en service): se verifica en tests, pero
  cualquier endurecimiento es trabajo futuro.
- `coordinador_id` como columna sin uso en scoping: se documenta; no se elimina.
- Todo lo relativo al modelo territorial, analytics, GIS, etc. (SP-1 en adelante).

## 5. Pruebas

Backend (pytest, fixture nueva de 2 organizaciones × 2 campañas con datos en cada una):

1. Por cada endpoint GET convertido: superadmin consolidado recibe filas de ambas orgs;
   con base seleccionada, solo la campaña elegida (sin cambio de comportamiento).
2. **No-regresión de aislamiento**: coordinador/admin de la org A jamás ve filas de la
   org B en esos mismos endpoints.
3. Escrituras de esos routers sin `X-Campaign-Id` (superadmin) → 400 con mensaje claro,
   nunca 500.
4. `POST /campaigns` consolidado → 400 con mensaje.
5. COORDINADOR puede `GET /privacy/notice` (y el flujo de captura completo).
6. Dashboard ejecutivo consolidado: estructura `global` + `campaigns[]` correcta;
   con base, schema actual intacto.
7. `scrum`: mover tarjeta ajena como ACTIVISTA → verificado el comportamiento del
   service (documentar resultado).
8. Seeds ANALYST/VIEWER: presentes solo con las env vars; login y matriz básica.

Frontend: `npm run build` (type-check) + tests unitarios de `isConsolidated` y del
render condicional (columna Base visible, botones de escritura ocultos).

## 6. Riesgos

- **Servicios con supuestos ocultos de campaña**: mitigado por la auditoría dirigida
  (3.2) y la fixture 2×2 que hace fallar cualquier fuga o filtro roto.
- **Volumen en listas consolidadas**: la paginación existente (`Page[T]`) aplica igual;
  no se introducen endpoints sin paginar.
- **PII en consolidado**: las reglas actuales no cambian — clave de elector siempre
  enmascarada en listas; reveal sigue siendo flujo explícito auditado (`RevealCtx`).
