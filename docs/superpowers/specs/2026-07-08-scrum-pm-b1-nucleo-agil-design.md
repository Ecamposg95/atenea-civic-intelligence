# Scrum / PM — B1: Núcleo ágil (Diseño)

**Fecha:** 2026-07-08
**Estado:** Aprobado (diseño) — pendiente de plan de implementación
**Contexto:** Sub-proyecto B del módulo de gestión de trabajo (Scrum/PM), que se
apoya en el Sub-proyecto A (Minutas & Acuerdos, ya desplegado). Ver
`2026-07-08-minutas-acuerdos-design.md`. B se decompone en **B1 (núcleo ágil,
este documento)** y **B2 (métricas + ceremonias + ejecutivo)**.

---

## 1. Motivación y alcance

Lucy (COORDINADOR = Product Owner + Scrum Master) necesita gestionar el trabajo
de campaña con Scrum: un backlog priorizado y estimado, sprints, y un tablero
Kanban donde el equipo mueve sus tarjetas. B1 entrega ese núcleo usable; las
métricas (burndown/velocidad), las ceremonias como minutas y la integración al
Command Center son **B2** (spec aparte).

### Decisiones confirmadas (del brainstorming)

- **Scrum completo**, reusando el RBAC de 9 roles (no se añaden roles al enum).
  COORDINADOR/ADMIN = gobierno del backlog (PO+SM); el equipo mueve lo suyo.
- **WorkItem de dos niveles:** `WorkItem` (historia = tarjeta del tablero, con
  story points) → `WorkItemTask` (tareas hijas = checklist, sin puntos).
- **Un solo backlog / sprint activo por campaña** (centralizado; la coordinadora
  lo gobierna). No hay tableros por equipo.
- **El asignado mueve su tarjeta** (cambia el estado/columna de SU historia) y
  marca SUS tareas; el gobierno del backlog (crear/estimar/priorizar/asignar,
  CRUD de sprints, crear tareas) es COORDINADOR/ADMIN.
- **Columnas del tablero:** `POR_HACER / EN_CURSO / HECHO` (3, lean).
- **Estimación:** story points Fibonacci (`1,2,3,5,8,13,21`).
- Tablero **campaign-wide readable** por todos los roles de la campaña (como las
  actas PUBLICADAS de A); la mutación usa scope estricto (ver §4).

### Fuera de alcance (B1 → van a B2)

- Burndown, velocidad, métricas de sprint.
- Ceremonias Scrum como minutas tipificadas ligadas al sprint.
- Integración al Command Center ejecutivo.
- Se **reserva** `WorkItem.completed_at` en B1 (se sella al pasar a HECHO) para
  que B2 calcule burndown/velocidad sin migración adicional de datos.

---

## 2. Modelo de datos (`app/models/scrum.py`, Alembic 0019)

Molde de `Caso`/`Minuta`: estados como `String(20)` (sin enums PG → SQLite-safe),
mixins `UUIDMixin + TenantMixin + CampaignMixin + AuditMixin`.

### `Sprint` (tabla `sprints`)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` / `organization_id` / `campaign_id` | str 36 | mixins |
| `nombre` | `String(120)` | requerido |
| `objetivo` | `String(500)` | nullable (meta del sprint) |
| `fecha_inicio` | `Date` | requerido |
| `fecha_fin` | `Date` | requerido |
| `estado` | `String(20)` | `PLANIFICACION` (default) → `ACTIVO` → `CERRADO` |
| audit | | AuditMixin |

- Índice `(campaign_id, estado)`.
- **Regla:** a lo más **un** sprint `ACTIVO` por campaña; el servicio lo fuerza
  al activar (rechaza si ya hay otro activo). Estados válidos:
  `PLANIFICACION, ACTIVO, CERRADO`.

### `WorkItem` (tabla `work_items`) — historia / tarjeta

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` / `organization_id` / `campaign_id` | str 36 | mixins |
| `titulo` | `String(255)` | requerido |
| `descripcion` | `String(2000)` | nullable |
| `tipo` | `String(20)` | `HISTORIA` (default) / `TAREA` / `BUG` |
| `story_points` | `Integer` | nullable; solo valores Fibonacci `{1,2,3,5,8,13,21}` (validado en schema) |
| `estado` | `String(20)` | `POR_HACER` (default) / `EN_CURSO` / `HECHO` (columna del tablero) |
| `prioridad` | `String(10)` | `ALTA` / `MEDIA` (default) / `BAJA` |
| `orden` | `Integer` | rank en el backlog (default 0) |
| `sprint_id` | str 36, FK `sprints` `SET NULL` | nullable (null = product backlog, fuera de sprint) |
| `responsable_id` | str 36, FK `users` `SET NULL` | nullable |
| `origin_acuerdo_id` | `String(36)` | nullable — acuerdo del que se convirtió (link a A) |
| `completed_at` | `DateTime(tz)` | nullable — se sella al entrar a `HECHO`, se limpia al salir; **reservado para B2** |
| audit | | AuditMixin |

- Índices: `(campaign_id, sprint_id, estado)`, `(campaign_id, estado)`,
  `(campaign_id, responsable_id)`.
- Estados válidos: `POR_HACER, EN_CURSO, HECHO`. Tipos: `HISTORIA, TAREA, BUG`.

### `WorkItemTask` (tabla `work_item_tasks`) — tarea / checklist

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` / `organization_id` / `campaign_id` | str 36 | mixins (hereda org/campaign de la historia) |
| `work_item_id` | str 36, FK `work_items` `CASCADE` | requerido, indexado |
| `texto` | `String(500)` | requerido |
| `done` | `Boolean` | default false |
| `orden` | `Integer` | default 0 |
| `responsable_id` | str 36, FK `users` `SET NULL` | nullable |
| audit | | AuditMixin |

- Índice `(work_item_id)`.

---

## 3. API (`app/routers/scrum.py`, `app/services/scrum_service.py`)

Reglas del repo: schemas Pydantic (nunca ORM); paginación `{items,total,limit,offset}`;
envelope de error `HTTPException`; `scoped_query`; audit en toda escritura;
org/campaign del contexto, nunca del body. Orden de rutas: literales antes de
`/{id}` (patrón `casos.py`).

### Sprints

| Método | Ruta | RBAC |
|--------|------|------|
| `POST` | `/sprints` | ADMIN, COORDINADOR |
| `GET` | `/sprints` | read tier (todos los roles de campaña) |
| `GET` | `/sprints/{id}` | read tier |
| `PATCH` | `/sprints/{id}` | ADMIN, COORDINADOR |
| `DELETE` | `/sprints/{id}` | ADMIN, COORDINADOR |
| `POST` | `/sprints/{id}/activar` | ADMIN, COORDINADOR (rechaza si ya hay ACTIVO) |
| `POST` | `/sprints/{id}/cerrar` | ADMIN, COORDINADOR |

### WorkItems (historias)

| Método | Ruta | RBAC |
|--------|------|------|
| `POST` | `/workitems` | ADMIN, COORDINADOR (gobierno del backlog) |
| `GET` | `/workitems` | read tier — filtros `sprint_id`, `estado`, `responsable_id`, `tipo`, `q` |
| `GET` | `/tablero` | read tier — historias del sprint ACTIVO agrupadas por `estado` (`{POR_HACER:[…],EN_CURSO:[…],HECHO:[…]}`) |
| `GET` | `/workitems/{id}` | read tier — con sus tareas |
| `PATCH` | `/workitems/{id}` | ADMIN, COORDINADOR (título/desc/puntos/prioridad/orden/sprint/responsable/tipo) |
| `PATCH` | `/workitems/{id}/estado` | **asignado o coordinador** — mover tarjeta de columna |
| `DELETE` | `/workitems/{id}` | ADMIN, COORDINADOR |

### Tareas (checklist)

| Método | Ruta | RBAC |
|--------|------|------|
| `POST` | `/workitems/{id}/tareas` | ADMIN, COORDINADOR |
| `PATCH` | `/workitems/{id}/tareas/{tid}` | **asignado (de la tarea o de la historia) o coordinador** — toggle `done`, editar texto |
| `DELETE` | `/workitems/{id}/tareas/{tid}` | ADMIN, COORDINADOR |

### Puente con A — convertir acuerdo → WorkItem

| Método | Ruta | RBAC |
|--------|------|------|
| `POST` | `/acuerdos/{aid}/convertir` | ADMIN, COORDINADOR, LIDER (tier de escritura de acuerdos) |

- Crea un `WorkItem` (`tipo=HISTORIA`, `titulo`= texto del acuerdo, `responsable_id`
  y sin sprint) y enlaza en ambos sentidos: `acuerdo.work_item_id = wi.id` y
  `wi.origin_acuerdo_id = acuerdo.id`. Idempotente: si el acuerdo ya tiene
  `work_item_id`, devuelve 409 (ya convertido). El acuerdo conserva su propio
  estado; el WorkItem es el trabajo rastreado.

### Reglas de negocio / semántica de mutación

- **Mover tarjeta (`PATCH /workitems/{id}/estado`):** permitido si el actor es
  COORDINADOR/ADMIN **o** `wi.responsable_id == actor.id`. Al entrar a `HECHO` se
  sella `completed_at`; al salir de `HECHO` se limpia. Cualquier otro cambio de
  campos de la historia es gobierno (COORDINADOR/ADMIN).
- **Toggle tarea:** permitido si COORDINADOR/ADMIN, o el actor es
  `task.responsable_id` o el `responsable_id` de la historia padre.
- **Scoping:** lecturas via `scoped_query` (campaign-wide para el tablero). Las
  mutaciones de gobierno usan `scoped_query` + gate de rol; las mutaciones del
  asignado añaden el check de propiedad descrito arriba. Tenant/campaign
  isolation intacto.
- **Un ACTIVO:** `activar` verifica que no exista otro `ACTIVO` en la campaña
  (si existe → 409).

---

## 4. Frontend (`frontend/src/modules/scrum/`, kit Atenea)

- **`BacklogPage`** (`/backlog`) — lista priorizada del product backlog (sin
  sprint) + items del sprint; crear/editar historia, estimar (selector Fibonacci),
  asignar responsable, mover a sprint, reordenar. Gobierno visible solo a
  coordinador/admin.
- **`TableroPage`** (`/tablero`) — Kanban de 3 columnas del sprint ACTIVO;
  arrastrar (o botones) para mover **tu** tarjeta; tarjeta muestra puntos,
  responsable, progreso de tareas. Consume `GET /tablero`.
- **`SprintsPage`** (`/sprints`) — crear/editar sprints, activar, cerrar
  (coordinador/admin).
- **`WorkItemDetail`** (drawer, desde tablero/backlog) — historia + checklist de
  tareas (toggle) + link "convertido desde acuerdo" si aplica.
- Cliente `api/scrum.ts` espejo de los schemas.
- Nav en sección `ciudadania`, gated: tablero/backlog/sprints en read tier
  (`MINUTAS_READ`-equivalente, incluye activista); las acciones de gobierno se
  ocultan/deshabilitan salvo coordinador/admin (el backend es la autoridad).

---

## 5. Testing

- **Backend** (`tests/test_scrum.py`, `tests/test_scrum_api.py`, SQLite):
  - Sprint: un solo ACTIVO por campaña (activar un 2º → 409); ciclo
    PLANIFICACION→ACTIVO→CERRADO.
  - WorkItem: crear (gobierno), estimar sólo Fibonacci (rechaza 4/7), mover
    estado por el asignado (permitido) y por un no-asignado no-coordinador
    (denegado); `completed_at` se sella/limpia al entrar/salir de HECHO.
  - Tareas: toggle por asignado/coordinador; denegado para ajeno.
  - Convertir acuerdo→WorkItem: enlaza ambos ids; 2ª conversión → 409.
  - Aislamiento tenant/campaign.
  - API: RBAC deny (activista no crea historia ni sprint; activista SÍ mueve su
    tarjeta), `GET /tablero` shape, audit rows.
- **Frontend:** `npm run build` limpio.

---

## 6. Ganchos que consume B2

- `WorkItem.completed_at` (burndown/velocidad).
- `Sprint.estado=CERRADO` + story points en HECHO (velocidad).
- B2 añadirá `Minuta.sprint_id` (ceremonias) y el bloque `scrum` del dashboard
  ejecutivo — no requieren cambios de B1 salvo lo ya reservado aquí.
