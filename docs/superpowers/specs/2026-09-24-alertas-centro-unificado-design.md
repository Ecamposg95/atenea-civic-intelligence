# Alertas · Centro unificado de riesgo — Design

**Fecha:** 2026-09-24 · **Rama sugerida:** `feat/alertas-centro-unificado`
**Programa:** demo de validación para Arturo (superadmin), subproyecto D4 — primer módulo
`soon` en construirse (orden acordado: Alertas → Candidaturas → Participación → Sentimiento).

## 1. Problema

El módulo `riesgo` ("Alertas", `/riesgo`) es un placeholder `ComingSoonPage`. Mientras tanto,
las señales de riesgo existen pero están dispersas y son parciales:

- El War Room solo muestra un tipo de alerta: secciones en rojo (<60% de meta), top 8
  (`operacion_service.seguimiento`, `operacion_service.py:228`).
- Atención calcula `sla_vencidos` como un KPI suelto (`caso_service.py:488`).
- Acuerdos vencidos, activistas inactivos, caída de ritmo o participación atípica no se
  detectan en ningún lado.

Para la demo con un experto electoral, Alertas debe mostrar datos **100% reales** de San Mateo
Atenco (SMA) — sin fixtures ni banner "muestra".

## 2. Decisiones de producto (validadas con el usuario)

- **Centro unificado**: una bandeja con alertas territoriales y operativas, severidad
  (crítica/alta/media), filtro por categoría, cuadrícula por sección y enlace al módulo donde
  se actúa.
- **Cálculo al vuelo (v1)**: sin tabla, sin migración, sin job. Una alerta desaparece sola
  cuando su causa se resuelve. Sin acuse/descartar en v1.
- **Las 7 reglas** del catálogo (§3.2) entran en v1.
- **Enfoque A**: motor de reglas en backend (`alerta_service`) + `GET /alertas`; el frontend
  solo consume (API-first). Descartados: agregación en frontend (B) y extender `seguimiento` (C).
- **Roles**: SUPERADMIN, ADMIN, COORDINADOR. Corrige el registry actual (`INTEL`), que excluía
  a la coordinadora.
- **Sin mapa geográfico**: las secciones de SMA no tienen geometría cargada → cuadrícula de 22
  celdas.

## 3. Diseño

### 3.1 Backend — `app/services/alerta_service.py`

Una alerta es un dict (validado por schema Pydantic en el router):

| Campo | Tipo | Ejemplo |
|---|---|---|
| `clave` | str estable `<REGLA>:<sujeto>` | `T1:4121`, `O3:campaña` |
| `regla` | `T1`…`T2`, `O1`…`O5` | `T1` |
| `categoria` | `territorial` \| `operativa` | `territorial` |
| `severidad` | `critica` \| `alta` \| `media` | `critica` |
| `titulo` | str | `Sección 4121 persuadible con 34% de avance` |
| `detalle` | str (criterio legible de la regla) | `Margen 2024 ≤150 votos y avance <60% de la meta` |
| `seccion` | str \| null | `4121` |
| `valor` / `umbral` | float \| null | `34` / `60` |
| `enlace` | ruta frontend | `/plan-territorial` |

Estructura:

- Una función pura por regla, `_t1_…(db, ctx) -> list[dict]` … `_o5_…(db, ctx)`. Todas usan
  `scoped_query` / servicios existentes, heredando aislamiento org + campaña.
- `seguimiento` se calcula **una vez** en `evaluar` y se pasa a T1/O1/O2 (evita recomputar).
- `evaluar(db, ctx) -> dict`: ejecuta las 7 reglas, deduplica (§3.3), ordena por severidad
  (crítica > alta > media) y luego por magnitud (`umbral − valor`, desc), y arma el resumen.
- Umbrales como constantes al inicio del módulo (sin configuración por UI en v1):
  `AVANCE_ROJO_PCT = 60`, `Z_PARTICIPACION = 1.5`, `MIN_SECCIONES_Z = 5`,
  `CAIDA_RITMO_PCT = 30`, `MIN_RITMO_BASE = 5`, `DIAS_INACTIVIDAD = 7`.
  `persuadible` se reutiliza tal cual de `operacion_service` (`_PERSUADIBLE_UMBRAL = 150`).

### 3.2 Catálogo de reglas

| # | Regla | Categoría | Severidad | Condición | Fuente | Enlace |
|---|---|---|---|---|---|---|
| T1 | Sección persuadible rezagada | territorial | crítica | `semaforo[s].persuadible` y `pct < 60` | `seguimiento` | `/plan-territorial` |
| T2 | Participación atípica | territorial | media | \|z\| > 1.5 de `participacion` 2024 frente a las secciones de la campaña; se omite si hay < 5 secciones con dato | `SeccionElectoral` (vía `list_planes`) | `/municipio` |
| O1 | Sección en rojo | operativa | alta | `status == "rojo"` (pct < 60) y no persuadible | `seguimiento` | `/war-room` |
| O2 | Caída de ritmo semanal | operativa | alta | promovidos de la última semana ISO completa < 70% del promedio de las 4 anteriores; se omite si ese promedio < 5 | deltas de `seguimiento.tendencia` (acumulada) | `/` |
| O3 | Casos con SLA vencido | operativa | alta | `fecha_compromiso < hoy` y `estado ∉ ("ATENDIDO","CERRADO")`; **una** alerta con el conteo | `Caso` (`_TERMINAL_ESTADOS`) | `/atencion/casos` |
| O4 | Activista inactivo | operativa | media | ACTIVISTA/CAPTURISTA activo con membresía en la campaña, dado de alta hace > 7 días y sin `Registro.created_at` en los últimos 7 días; una alerta por persona | `User` + `CampaignMembership` + `Registro` | `/admin/estructura` |
| O5 | Acuerdos vencidos | operativa | media | `fecha_limite < hoy` y `estado ∈ ("PENDIENTE","EN_CURSO")`; **una** alerta con el conteo | `Acuerdo` | `/acuerdos` |

Notas:
- T2 marca atípicas en ambas direcciones (muy alta o muy baja participación); el `titulo`
  indica cuál.
- O4 expone el **nombre del activista** (personal de campaña, no ciudadano). Ningún dato de
  ciudadanos (nombre, contacto, clave) aparece en ninguna alerta.

### 3.3 Deduplicación

T1 y O1 son mutuamente excluyentes por construcción (O1 exige "no persuadible"), así que una
sección rezagada produce exactamente una alerta: crítica si es persuadible, alta si no. No
hay otra deduplicación: las demás reglas tienen sujetos distintos.

### 3.4 Backend — `app/routers/alertas.py`

- `GET /alertas` (`CampaignCtx` + `require_roles(ADMIN, COORDINADOR)`; superadmin pasa
  siempre). Sin `X-Campaign-Id` → 400 (comportamiento estándar de `get_campaign_context`).
- Respuesta (`AlertasResponse`):
  ```json
  {
    "resumen": {"critica": 3, "alta": 7, "media": 5,
                "territorial": 4, "operativa": 11,
                "secciones_afectadas": 9, "secciones_total": 22},
    "secciones": [{"seccion": "4121", "severidad_max": "critica"}, ...],
    "items": [Alerta, ...],
    "evaluado_en": "2026-09-24T18:02:11Z"
  }
  ```
  `secciones` lista **todas** las secciones del semáforo (con `severidad_max: null` si no
  tienen alertas) para pintar la cuadrícula sin lógica en el frontend.
- Sin paginar: el volumen es de decenas (misma excepción que `seguimiento`).
- Sin `audit_log`: lectura agregada, sin PII de ciudadanos.
- Registrar `alertas` en la tupla de `_register_routers` (`main.py:231`).

### 3.5 Frontend

- `registry.ts`: `riesgo` pasa a `state: "active"`, `element: AlertasPage`,
  `roles: ["superadmin", "admin", "coordinador"]`; se elimina su bloque `soon`.
- `api/alertas.ts`: `getAlertas()` con tipos espejo del schema.
- `modules/alertas/AlertasPage.tsx` (kit del War Room: `AppLayout`, `PageHeader`,
  `MetricCard`, `SectionHeading`, `DataState`, `useAsync`):
  1. Encabezado "Alertas · <campaña>" con "evaluado hace N min" y botón ⟳ (re-fetch).
  2. Fila de `MetricCard`: Críticas · Altas · Medias · Secciones afectadas `9/22`.
  3. Filtro de categoría: Todas / Territoriales / Operativas.
  4. Cuadrícula de secciones (celdas coloreadas por `severidad_max`); clic en una celda filtra
     la lista a esa sección; clic de nuevo quita el filtro.
  5. Lista: chip de severidad, código de regla (tooltip con `detalle`), título,
     `valor` vs `umbral`, enlace `→` al módulo.
  6. Estados: sin campaña seleccionada → aviso "Selecciona una campaña" (sin pedir al
     backend); lista vacía → "Sin alertas: todo en verde"; error → `DataState`.
- `DashboardPage.tsx` (Inicio): chip "🔴 N alertas críticas" que enlaza a `/riesgo`, visible
  solo para roles con acceso y cuando N > 0 (una llamada a `getAlertas`).
- Colores de severidad desde los tokens existentes del kit Atenea (rojo/ámbar/amarillo
  equivalentes a los del semáforo del War Room); sin paleta nueva.

## 4. Fuera de alcance (v1)

- Persistencia, acuse, descartar, asignar responsable o historial de alertas.
- Umbrales configurables por campaña/UI.
- Notificaciones (push, correo, WhatsApp).
- Mapa geográfico por sección (requiere cargar geometría seccional; va con SP-4 GIS).
- Anomalías históricas por sección (solo hay 2024 a nivel sección).
- Acceso de LIDER (alertas acotadas a su sub-árbol) y de roles de solo lectura.

## 5. Pruebas

Backend (pytest, fixtures existentes 2 orgs × 2 campañas de `tests/conftest.py`):

1. Por regla, un caso que **dispara** y uno que **no** (T1, T2, O1, O2, O3, O4, O5).
2. T1/O1: sección persuadible rezagada → solo T1; no persuadible → solo O1.
3. T2 se omite con < 5 secciones; O2 se omite con base < 5.
4. Orden: crítica antes que alta antes que media; dentro, mayor brecha primero.
5. `resumen` y `secciones` cuadran con `items`.
6. Aislamiento: el coordinador de Alpha nunca ve alertas de datos de Beta.
7. RBAC: ADMIN/COORDINADOR/superadmin → 200; ACTIVISTA, LIDER, CONSULTA, ANALYST → 403;
   sin `X-Campaign-Id` → 400.
8. Ninguna alerta contiene campos de ciudadanos (nombre de registro, teléfono, clave).

Frontend: `npm run build` (type-check) + Vitest del filtrado por categoría y por sección.

## 6. Riesgos

- **Datos delgados en SMA** (7 militantes, pocos casos/acuerdos): varias reglas operativas
  pueden salir en cero en la demo. Es honesto; el subproyecto D2 (datos de operación) lo
  resuelve en una campaña "Demo" separada, sin contaminar la de Lucy.
- **Costo por request**: `seguimiento` + 4 consultas agregadas; aceptable a escala de una
  campaña municipal. Si crece, cachear por campaña unos minutos (no en v1).
- **Tendencia acumulada**: O2 depende de derivar deltas semanales; se prueba explícitamente.
