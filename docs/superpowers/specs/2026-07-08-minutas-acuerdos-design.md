# Minutas & Acuerdos — Diseño (Sub-proyecto A)

**Fecha:** 2026-07-08
**Estado:** Aprobado (diseño) — pendiente de plan de implementación
**Contexto:** Flujo #4 "Acuerdos y Minutas" del programa de Digitalización del papel
(San Mateo Atenco 2027). Primera fase de un módulo mayor de gestión de trabajo.

---

## 1. Motivación y alcance

Lucy (COORDINADOR) y su equipo hoy pierden las minutas de reuniones en papel y
WhatsApp, y nadie da seguimiento a los compromisos hasta que se vencen. Este
módulo digitaliza la captura de minutas y el seguimiento de los acuerdos que
salen de ellas.

El módulo completo (según brainstorming) abarca cuatro necesidades:
registrar minutas, dar seguimiento a acuerdos, un tablero ágil de trabajo
(Scrum completo con sprints, backlog, ceremonias, burndown/velocidad) y
visibilidad ejecutiva integrada al Command Center.

Por tamaño, se **decompone en dos sub-proyectos**, cada uno con su ciclo
spec → plan → implementación:

- **Sub-proyecto A — Minutas & Acuerdos** (este documento): la base. Entrega
  valor por sí solo.
- **Sub-proyecto B — Scrum / PM** (spec futura): `WorkItem` (backlog con story
  points Fibonacci), `Sprint`, tablero Kanban, ceremonias como minutas
  tipificadas, botón "convertir acuerdo → WorkItem", burndown/velocidad e
  integración al Command Center.

**Este documento cubre únicamente el Sub-proyecto A.**

### Decisiones de diseño (del brainstorming)

- Minutas y backlog son **entidades separadas pero vinculables** (el vínculo
  formal — convertir un acuerdo en item — llega en B; A deja el gancho listo).
- **Reusar el RBAC existente** de 9 roles; no se añaden roles al enum
  `UserRole`. COORDINADOR = Product Owner + Scrum Master; LIDER/ACTIVISTA = equipo.
- Estimación en **story points (Fibonacci)** — aplica al Sub-proyecto B, no a A.
- Se apoya en el spine (multi-tenancy, campaign scoping, audit, RBAC); no
  modifica sus fundamentos.

### Fuera de alcance (A)

- Tablero Kanban, sprints, story points, burndown, velocidad → Sub-proyecto B.
- Conversión real de acuerdo → item de backlog → Sub-proyecto B (A solo reserva
  la columna `work_item_id`).
- Integración al Command Center ejecutivo → Sub-proyecto B.
- Captura offline (el módulo de captura de activistas tiene su propia cola;
  minutas es de uso interno con conectividad).

---

## 2. Modelo de datos (`app/models/minuta.py`)

Sigue el molde de `Caso`/`CasoEvento` (`app/models/atencion.py`): estados como
`String(20)` (sin enums de PostgreSQL → migración simple y compatible con
SQLite), mixins `UUIDMixin + TenantMixin + CampaignMixin + AuditMixin`.

### `Minuta` (tabla `minutas`)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID (str 36) | UUIDMixin |
| `organization_id` | str 36 | TenantMixin — filtro obligatorio |
| `campaign_id` | str 36 | CampaignMixin |
| `titulo` | `String(255)` | requerido |
| `fecha` | `Date` | fecha de la reunión, requerido |
| `lugar` | `String(255)` | nullable |
| `tipo` | `String(20)` | default `REUNION`. Valores reservados para B: `PLANNING`, `DAILY`, `REVIEW`, `RETRO`. Valor libre adicional: `OTRO` |
| `asistentes` | `JSON` | lista `[{user_id?: str, nombre: str}]` — miembros de la plataforma + invitados externos |
| `cuerpo` | `String` (texto) | notas en markdown |
| `estado` | `String(20)` | default `BORRADOR`; transición única a `PUBLICADA` (fija el acta) |
| `area_id` | str 36, FK `electoral_areas` `SET NULL` | opcional (territorio) |
| `created_at` / `updated_at` / `created_by` | | AuditMixin |

Índices: `(campaign_id, fecha)`, `(campaign_id, estado)`.

Estados válidos: `BORRADOR`, `PUBLICADA`.
Tipos válidos (A): `REUNION`, `OTRO` (+ reservados de B, no usados aún en UI).

### `Acuerdo` (tabla `acuerdos`)

Compromiso dentro de una minuta. `UUIDMixin + TenantMixin + CampaignMixin + AuditMixin`.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID (str 36) | |
| `organization_id` / `campaign_id` | str 36 | scoping (heredado de la minuta al crear) |
| `minuta_id` | str 36, FK `minutas` `CASCADE` | requerido, indexado |
| `texto` | `String(2000)` | requerido |
| `orden` | `Integer` | default 0, para ordenar dentro de la minuta |
| `responsable_id` | str 36, FK `users` `SET NULL` | opcional |
| `fecha_limite` | `Date` | opcional |
| `estado` | `String(20)` | default `PENDIENTE`; flujo `PENDIENTE → EN_CURSO → CUMPLIDO`; `CANCELADO` terminal alterno |
| `work_item_id` | `String(36)` nullable | **gancho reservado** para B (string plano, sin FK) |
| `created_at` / `updated_at` / `created_by` | | AuditMixin |

Índices: `(minuta_id)`, `(campaign_id, responsable_id, estado)`.

Estados válidos: `PENDIENTE`, `EN_CURSO`, `CUMPLIDO`, `CANCELADO`.

---

## 3. API

Router `app/routers/minutas.py`, servicio `app/services/minuta_service.py`,
schemas `app/schemas/minuta.py` (o el módulo de schemas que use el proyecto).

Reglas del proyecto: endpoints devuelven schemas Pydantic (nunca ORM crudo);
paginación `{items, total, limit, offset}`; envelope de error
`{ "error": { "message", "status" } }`; `scoped_query(db, Model, ctx)` en todas
las lecturas; `audit_service.log(...)` en toda escritura sensible;
`organization_id`/`campaign_id` vienen del JWT/contexto, nunca del body.

| Método | Ruta | RBAC (`require_roles`) | Descripción |
|--------|------|------------------------|-------------|
| `POST` | `/minutas` | ADMIN, COORDINADOR, LIDER | Crear minuta (opcionalmente con acuerdos inline) |
| `GET` | `/minutas` | + ACTIVISTA | Lista paginada, scope-aware; filtros: `tipo`, `estado`, `desde`/`hasta` |
| `GET` | `/minutas/:id` | scope-aware | Detalle con sus acuerdos |
| `PATCH` | `/minutas/:id` | ADMIN, COORDINADOR, LIDER (mutate-scope; ver abajo) | Editar / publicar (cambio de `estado`) |
| `DELETE` | `/minutas/:id` | ADMIN, COORDINADOR únicamente | Eliminar (auditado) |
| `POST` | `/minutas/:id/acuerdos` | ADMIN, COORDINADOR, LIDER | Añadir acuerdo |
| `PATCH` | `/minutas/:id/acuerdos/:aid` | ADMIN, COORDINADOR, LIDER | Editar acuerdo / cambiar estado — un responsable ACTIVISTA/CAPTURISTA **no** gestiona el estado de su propio acuerdo (decisión de producto confirmada) |
| `DELETE` | `/minutas/:id/acuerdos/:aid` | ADMIN, COORDINADOR, LIDER (mutate-scope) | Eliminar acuerdo |
| `GET` | `/acuerdos` | scope-aware | Vista transversal (**por vencer / mis acuerdos**); filtros: `responsable_id`, `estado`, `vence_antes` |

### Scoping (regla del repo: COORDINADOR es campaign-wide)

- **COORDINADOR / ADMIN / SUPERADMIN**: ven y mutan toda la campaña
  (`scoped_query(Model, ctx)` sin gate de sub-árbol).
- **LIDER / ACTIVISTA**: ven minutas que crearon, o donde figuran como asistente
  (`user_id` en `asistentes`) o como `responsable_id` de algún acuerdo.
- Tenant/campaign isolation intacto (`scoped_query` filtra org+campaign siempre).
- **Lectura vs. mutación**: una minuta `PUBLICADA` es visible **campaign-wide**
  para cualquier rol de lectura (es el acta oficial de la campaña), pero una
  `BORRADOR` sigue acotada a jerarquía/propiedad (autor o equipo del LIDER).
  Las escrituras y el borrado usan un scope **más estricto** ("mutate-scope")
  que nunca aplica el ensanche de `PUBLICADA`: solo COORDINADOR/ADMIN, o el
  autor/su jerarquía LIDER, pueden alcanzar la fila para editarla o borrarla —
  esto evita que un no-propietario use la visibilidad de lectura de una
  `PUBLICADA` para mutarla o mutar sus acuerdos.

### Reglas de negocio

- Una minuta `PUBLICADA` no permite editar `cuerpo`/`titulo`/`fecha`
  (solo COORDINADOR/ADMIN puede revertir a `BORRADOR` si hace falta corregir).
  Los acuerdos sí pueden cambiar de estado tras publicar (el seguimiento vive
  después de la reunión).
- Al crear un acuerdo se heredan `organization_id`/`campaign_id` de la minuta
  padre; nunca del body.
- `GET /acuerdos?vence_antes=<fecha>` ordena por `fecha_limite` ascendente y
  marca implícitamente vencidos (la UI calcula el badge).

---

## 4. Frontend (`frontend/src/modules/minutas/`, Atenea kit)

- `MinutasListPage.tsx` — ruta `/minutas`. Lista de minutas (título, fecha, tipo,
  estado, nº de acuerdos pendientes) + botón "Nueva minuta".
- `MinutaEditorPage.tsx` — crear/editar: metadatos (título, fecha, lugar, tipo),
  selector de asistentes (miembros + invitados de texto libre), editor de notas
  markdown, y lista de acuerdos inline (texto, responsable, fecha límite).
  Mobile-first.
- `MinutaDetailPage.tsx` — acta `PUBLICADA` en solo lectura, con acuerdos y su
  estado.
- `MisAcuerdosPage.tsx` — ruta `/acuerdos`. Seguimiento transversal: acuerdos
  agrupados/filtrados por estado y vencimiento, con badges
  (vencido / hoy / próximos 7 días / sin fecha). Consume `GET /acuerdos`.
- Navegación: gated por un nuevo permiso de consola `CONSOLE_MINUTAS`
  (siguiendo el patrón de `CONSOLE_CAPTURA`).

Cliente API en el patrón existente (`frontend/src/**/api` o equivalente),
tipos TS espejo de los schemas Pydantic.

---

## 5. Migración

- **Alembic 0018** (`down_revision: "0017"`).
- Crea tablas `minutas` y `acuerdos` con sus índices.
- **Idempotente**: guardas `_table_exists` / `_index_exists` antes de cada DDL
  (regla del repo).
- **Compatible SQLite**: solo columnas `String`/`Date`/`Integer`/`JSON`; sin
  `ALTER TYPE`, sin `autocommit_block` (no hay enums de PG en este módulo).
- FKs con `ondelete` explícito (`acuerdos.minuta_id` → CASCADE;
  `responsable_id`/`area_id` → SET NULL).

---

## 6. Testing

### Backend (pytest, SQLite en memoria)

- `tests/test_minutas.py` (servicio):
  - Crear minuta + acuerdos inline; herencia de org/campaign en acuerdos.
  - Ciclo de estado del acuerdo (`PENDIENTE → EN_CURSO → CUMPLIDO`; `CANCELADO`).
  - Publicar minuta bloquea edición de cuerpo para no-coordinador.
  - Scoping: COORDINADOR ve toda la campaña; LIDER solo lo suyo/asignado.
  - Aislamiento de tenant (org B no ve minutas de org A).
- `tests/test_minutas_api.py` (endpoints):
  - RBAC deny (ACTIVISTA no puede `POST /minutas`; usuario ajeno no ve `:id`).
  - Paginación y filtros de `GET /minutas` y `GET /acuerdos`.
  - Filas de `audit_log` en create/publish/delete.
- El baseline de pytest (250+) debe seguir verde.

### Frontend

- Build limpio (`npm run build`) y test unitario mínimo si aplica al patrón.

---

## 7. Ganchos hacia el Sub-proyecto B

- `Minuta.tipo` ya admite `PLANNING/DAILY/REVIEW/RETRO` (ceremonias Scrum).
- `Acuerdo.work_item_id` reservado para el vínculo acuerdo → item de backlog.
- La vista `GET /acuerdos` será la semilla del panel de seguimiento ejecutivo
  que B integrará al Command Center.
