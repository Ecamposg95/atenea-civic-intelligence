# Scrum / PM — B2: Métricas + Ceremonias + Ejecutivo (Diseño)

**Fecha:** 2026-07-08
**Estado:** Aprobado (diseño) — pendiente de plan de implementación
**Contexto:** Segunda fase del Sub-proyecto B (Scrum/PM). Se apoya en **B1**
(`2026-07-08-scrum-pm-b1-nucleo-agil-design.md`: `Sprint`, `WorkItem` con
`completed_at`, `WorkItemTask`, tablero) y en el módulo de minutas del
Sub-proyecto A (`2026-07-08-minutas-acuerdos-design.md`). **Se implementa después
de B1.**

---

## 1. Motivación y alcance

Con el tablero de B1 funcionando, B2 añade la capa de **medición y ritmo Scrum**:
velocidad y burndown, las **ceremonias** (planning/daily/review/retro) como
minutas ligadas al sprint, y la **visibilidad ejecutiva** en el Command Center de
Lucy. No introduce entidades nuevas de trabajo — mide y conecta lo que B1 creó.

### Decisiones confirmadas

- Métricas derivadas de datos ya existentes en B1 (`completed_at`, `story_points`,
  `Sprint.estado`) — **sin snapshots diarios ni jobs** (burndown se deriva de
  `completed_at`).
- Ceremonias = minutas de A tipificadas (`PLANNING/DAILY/REVIEW/RETRO`, ya
  permitidas por `MINUTA_TIPO`) + un vínculo al sprint.
- La visibilidad ejecutiva se **compone** en el `dashboard_service.executive`
  existente (no un dashboard nuevo).

### Fuera de alcance

- Cualquier cambio al núcleo de B1 (tablero, backlog, sprints) salvo el add de
  `Minuta.sprint_id`.
- Reportes exportables / PDF de sprint (posible follow-up).

---

## 2. Modelo de datos (Alembic 0020)

Una sola alteración; el resto es cómputo sobre datos de B1.

- **`Minuta.sprint_id`** — `String(36)`, FK `sprints` `SET NULL`, nullable.
  Liga una minuta-ceremonia a su sprint. Migración `batch_alter_table` (SQLite-safe)
  que añade la columna + índice `(sprint_id)`; idempotente (`_column_exists`).
- Se extiende `MinutaCreate`/`MinutaRead` con `sprint_id` opcional.

---

## 3. Métricas (`scrum_service` + `routers/scrum.py`)

Todo `scoped_query`, read tier, sin escritura (sin audit).

### Velocidad

- **Por sprint:** suma de `story_points` de `WorkItem` con `estado=HECHO` y
  `sprint_id=<id>` (historias completadas del sprint). Se reporta también el
  comprometido (suma de puntos de todas las historias del sprint) vs. completado.
- **Tendencia de campaña:** velocidad de los últimos N sprints `CERRADO`
  (orden por `fecha_fin`), para media móvil.
- `GET /sprints/{id}/metrics` → `{comprometido, completado, historias_total,
  historias_hechas, por_estado:{POR_HACER,EN_CURSO,HECHO}}`.
- `GET /scrum/velocidad?n=6` → lista de `{sprint_id, nombre, fecha_fin, velocidad}`.

### Burndown

- Del sprint **ACTIVO**: para cada día del rango `[fecha_inicio, fecha_fin]`,
  `restante(día) = total_puntos_sprint − Σ story_points de historias con
  completed_at ≤ fin_de_ese_día`. La línea ideal es interpolación lineal de
  `total_puntos` a 0 sobre los días del sprint.
- `GET /sprints/{id}/burndown` → `{dias:[{fecha, restante, ideal}], total_puntos}`.
- Cómputo puro en Python desde `completed_at`/`story_points`; sin tablas de
  snapshot. (Historias sin `story_points` cuentan 0 en burndown/velocidad; se
  reporta aparte `historias_sin_estimar` para transparencia.)

---

## 4. Ceremonias como minutas ligadas al sprint

Reusa el módulo de minutas de A; solo añade el vínculo `sprint_id`.

- **Crear ceremonia:** `POST /minutas` (endpoint existente de A) aceptando
  `sprint_id` + `tipo` en `{PLANNING,DAILY,REVIEW,RETRO}`. Gating de escritura de
  minutas sin cambios (ADMIN/COORDINADOR/LIDER). Validación: si `tipo` es de
  ceremonia, `sprint_id` es recomendado (no obligatorio) y debe pertenecer a la
  campaña (validado en servicio, mismo patrón que otras FKs).
- **Listar ceremonias del sprint:** `GET /sprints/{id}/ceremonias` → minutas con
  ese `sprint_id` (ordenadas por fecha), scope-aware (reusa el read-scope de
  minutas de A). Alternativamente `GET /minutas?sprint_id=<id>` (se añade el
  filtro al listado existente de A).
- El detalle del sprint en el frontend muestra sus ceremonias con link a la minuta.

---

## 5. Integración ejecutiva (Command Center)

Extiende `dashboard_service.executive(db, ctx)` con un bloque `scrum` (no rompe la
forma existente; solo agrega una clave):

```
"scrum": {
  "sprint_activo": {nombre, fecha_inicio, fecha_fin,
                    comprometido, completado, pct} | null,
  "por_columna": {POR_HACER, EN_CURSO, HECHO},
  "velocidad_ultima": <int|null>,
  "velocidad_tendencia": [<int>, …],   // últimos N sprints CERRADO
  "sin_estimar": <int>,
  "atrasados": <int>   // historias EN_CURSO/POR_HACER en sprint ACTIVO cuyo
                       // sprint.fecha_fin < hoy
}
```

- Si no hay sprint ACTIVO → `sprint_activo: null` y el panel muestra "sin sprint
  activo" (no rompe el dashboard).
- **Frontend:** `DashboardPage.tsx` ("Centro de Mando") añade un **panel Scrum**
  (progreso del sprint activo con barra puntos, mini-tendencia de velocidad,
  conteos por columna, alerta de atrasados) usando el kit/dataviz existente.

---

## 6. Testing

- **Backend** (`tests/test_scrum_metrics.py`, `tests/test_scrum_ceremonias.py`):
  - Velocidad: sprint con historias HECHO/no-HECHO → suma correcta solo de HECHO;
    historias sin puntos cuentan 0 y aparecen en `sin_estimar`.
  - Burndown: serie diaria monótona no creciente; `restante` inicial = total,
    baja según `completed_at`; línea ideal correcta en extremos.
  - `GET /scrum/velocidad` ordena por sprints CERRADO y respeta `n`.
  - Ceremonias: `POST /minutas` con `sprint_id`+`tipo` de ceremonia persiste el
    vínculo; `GET /sprints/{id}/ceremonias` / `GET /minutas?sprint_id` filtran;
    `sprint_id` de otra campaña → rechazado.
  - `dashboard_service.executive` incluye el bloque `scrum` (con y sin sprint
    activo); aislamiento tenant/campaign.
- **Frontend:** `npm run build` limpio; panel Scrum renderiza con sprint activo y
  con el estado "sin sprint".

---

## 7. Dependencias

- Requiere B1 desplegado (entidades + `completed_at`).
- Requiere el módulo de minutas de A (para ceremonias) — ya en prod.
- Alembic 0020 (`down_revision` = la cabeza tras B1, `0019`).
