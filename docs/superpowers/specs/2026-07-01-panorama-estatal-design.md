# Panorama Estatal — Tablero ejecutivo por estado

**Fecha:** 2026-07-01
**Estado:** Diseño aprobado — pendiente plan de implementación
**Autor:** Ecampos + Claude

---

## 1. Objetivo

Un **tablero ejecutivo interactivo**, dentro de la plataforma, que consolide los datos
de la plataforma **a nivel estado (entidad federativa)** para una audiencia ejecutiva
(tipo gobernador), navegable en vivo en una reunión.

- **Entregable:** vista/dashboard interactivo (no un PDF; el export es futuro).
- **Alcance geográfico:** selector de estado. La v1 se arquitecta parametrizada por
  `estado_id` desde el inicio; el selector solo habilita estados con datos cargados.
- **Dominios de datos (v1):** electoral, sociodemográfico, economía, índice cívico +
  estructura territorial propia.
- **Enfoque de arquitectura aprobado:** **A** — API de agregación (un solo payload
  cacheable por estado) + módulo frontend nuevo. Se descartaron B (composición
  client-side de endpoints por dominio: N llamadas, scoping inconsistente, difícil de
  exportar) y C (snapshots materializados: sobredimensionado para v1, es el paso 2).

---

## 2. Realidad de los datos en `main` (restricción de diseño)

Al momento del diseño, los **hechos estructurados** presentes en `main` son:

- `CensusMetric` — censo/demografía. Columnas relevantes: `anio`, `nivel` (string,
  p. ej. `estado`/`municipio`), `territory_code`, `area_id` (FK opcional a
  `ElectoralArea`), `indicador`, `valor`, `organization_id` (nullable → dato base
  global u organizacional).
- `Registro` — captura de activistas, con `seccion`; se agrega a estado vía la
  jerarquía de `ElectoralArea`.
- `ElectoralArea` — cartografía. `AreaLevel`: `estado`, `municipio`,
  `distrito_federal`, `distrito_local`, `seccion`. FKs denormalizadas `estado_id`,
  `municipio_id` para joins de un salto.
- IEEM (Edo. de México) se sirve como CSV crudo vía el router `intel`
  (`/intel/ieem/*`), no como hechos consultables en BD.
- WorldBank / Banxico son indicadores **nacionales** vía `intel`, no estatales.

**No están en `main`:** los loaders de hechos SP0b-2b (`ElectionResult`, `SocioMetric`,
DENUE, casillas + Alembic 0007). Están **construidos pero en la rama
`feat/sp0b2b-tidy-facts`, sin merge**. Por eso no existe migración `0007` ni modelo
`ElectionResult` en `main`.

**Consecuencia de diseño:** la agregación solo puede consolidar lo que está cargado en
BD a nivel estado. Esto se resuelve con el **modelo de proveedores** (sección 3): cada
dominio enciende si su fuente está disponible y muestra un empty-state elegante si no.
Censo y estructura funcionan hoy; electoral y economía encienden automáticamente cuando
SP0b-2b se mergee y se carguen datos — sin cambios en el frontend.

---

## 3. Arquitectura — modelo de proveedores (núcleo)

El endpoint de panorama agrega **4 domain providers** independientes. Cada proveedor
implementa la misma interfaz mínima:

```
class DomainProvider(Protocol):
    key: str                                  # "sociodemografico" | "estructura" | ...
    def available(db, ctx, estado_id) -> bool # ¿hay datos para este estado?
    def data(db, ctx, estado_id) -> dict      # payload del dominio (o {} si vacío)
    def kpis(db, ctx, estado_id) -> list[Kpi] # KPIs de alto nivel para la cabecera
```

El servicio orquestador llama a cada proveedor y ensambla el payload con **banderas de
disponibilidad por dominio**. Un proveedor sin datos nunca lanza error: devuelve
`available=False` y datos vacíos.

| Proveedor | Fuente en `main` hoy | Estado v1 |
|---|---|---|
| `sociodemografico` | `CensusMetric` (por `nivel`/`territory_code`/`area_id`) | **Activo** |
| `estructura` | `Registro` + `ElectoralArea` (rollup sección→estado) | **Activo** |
| `electoral` | `ElectionResult` (llega con SP0b-2b) | Empty-state hasta merge+carga |
| `economia` | `SocioMetric`/DENUE (SP0b-2b) + Banxico | Empty-state hasta merge+carga |

Los proveedores `electoral` y `economia` se implementan en v1 **como stubs que reportan
`available=False`** mientras su modelo/tabla no exista en `main`; cuando SP0b-2b se
mergee, se completa su `data()` sin tocar el orquestador ni el frontend.

---

## 4. Backend

### 4.1 Estructura de archivos

```
backend/app/
├── routers/estado.py                 Router /estado
├── services/estado_service.py        Orquestador de providers + caché
└── services/estado_providers/
    ├── __init__.py                   Registro de providers activos
    ├── base.py                       Protocol DomainProvider + tipos (Kpi, DomainBlock)
    ├── sociodemografico.py           CensusMetric rollup
    ├── estructura.py                 Registro + ElectoralArea rollup (usa _role_scoped)
    ├── electoral.py                  Stub v1 → ElectionResult cuando exista
    └── economia.py                   Stub v1 → SocioMetric/DENUE/Banxico cuando exista
```

### 4.2 Endpoints

| Método | Ruta | Descripción | Respuesta |
|---|---|---|---|
| GET | `/estado/estados` | Lista de estados con bandera `has_data` (habilita/atenúa el selector) | `[{ estado_id, nombre, has_data }]` |
| GET | `/estado/{estado_id}/panorama` | Payload agregado del estado | `PanoramaEstatal` (ver 4.3) |

### 4.3 Esquema de respuesta (`PanoramaEstatal`)

```json
{
  "estado": { "id": "...", "nombre": "México", "clave": "15" },
  "generado_en": "2026-07-01T12:00:00Z",
  "kpis": [ { "key": "poblacion", "label": "Población", "valor": 16992418, "formato": "int" } ],
  "por_municipio": [ { "municipio_id": "...", "nombre": "...", "metricas": { "poblacion": 12345 } } ],
  "dominios": {
    "sociodemografico": { "disponible": true,  "bloques": [ ... ] },
    "estructura":       { "disponible": true,  "bloques": [ ... ] },
    "electoral":        { "disponible": false, "bloques": [] },
    "economia":         { "disponible": false, "bloques": [] }
  }
}
```

### 4.4 Reglas transversales (Golden Rules)

- **Scoping/tenant/rol:** el rollup reusa `scoped_query` / `_role_scoped`; toda consulta
  filtra por `organization_id` del JWT. `CensusMetric` con `organization_id` nullable
  aplica la regla "global OR tenant" que ya usa `scoped_query`.
- **RBAC:** roles INTEL — `superadmin, admin, coordinador, lider, analyst, viewer` — vía
  `require_roles`. Es una vista ejecutiva de **solo lectura y sin PII** (nunca expone
  clave de elector). Gate a nivel router para default-deny en rutas nuevas.
- **Envelopes:** errores `{ "error": { message, status } }`; el endpoint devuelve
  **200 con banderas** cuando el estado no tiene datos (no 404) — la "presentación no se
  rompe".
- **Esquemas Pydantic**, nunca ORM crudo.
- **Caché:** reusa el patrón de caché de `intel` (TTL corto), clave `(org, estado_id)`.

### 4.5 Mapa

El coroplético reusa `GET /maps/areas?level=municipio` filtrado por estado (vía
`ElectoralArea.estado_id`). **No se duplica GeoJSON** en el payload de panorama; el
frontend une geometría (de `/maps/areas`) con métricas (de `por_municipio`) por
`municipio_id`.

---

## 5. Frontend — módulo `panorama-estatal`

### 5.1 Registro y ruta

- Ruta `/estado`, sección **"inteligencia"**, `state: "active"`, roles **INTEL**.
- Registrado en `frontend/src/modules/registry.ts` siguiendo el patrón existente.
- Carpeta `frontend/src/modules/panorama-estatal/`.

### 5.2 Layout ejecutivo (usa tokens de theming + UI premium existentes)

1. **Selector de estado** (superior) — solo estados con `has_data` habilitados; el resto
   atenuados con tooltip "sin datos cargados".
2. **Cabecera de KPIs** — 4–6 tarjetas de alto impacto. Set v1 propuesto (los que el
   proveedor pueda calcular; los demás se ocultan):
   - Población total (socio)
   - Nº de municipios (cartografía)
   - Participación histórica (electoral — vacío hasta SP0b-2b)
   - Cobertura de estructura: registros / meta o % secciones con actividad (estructura)
   - Índice cívico-territorial compuesto (calculado, ver 5.3)
3. **Mapa coroplético por municipio** — reusa componentes de Map Explorer; métrica
   seleccionable (población, cobertura, etc.).
4. **4 secciones temáticas** (una por dominio) — cada una renderiza sus `bloques` o su
   **empty-state elegante** si `disponible=false`.

### 5.3 Índice cívico

En v1 se calcula **client-side** reusando `frontend/src/modules/indice/score.ts` sobre
el payload de panorama (insumos socio + estructura). Mover el cálculo a backend queda
como mejora futura (para que el export lo herede).

### 5.4 Empty-state elegante

Sección atenuada con ícono + texto "Datos de [dominio] aún no cargados para [estado]".
Nunca produce error ni deja hueco roto en la presentación.

---

## 6. Testing (TDD)

### Backend
- **Por proveedor:** activo con datos → rollup correcto a nivel estado; sin datos →
  `available=False` y bloque vacío (no excepción).
- **Endpoint `/estado/{id}/panorama`:** respeta scoping por rol/tenant; estado sin datos
  → **200** con banderas `disponible=false`, no 404/500.
- **Endpoint `/estado/estados`:** `has_data` refleja correctamente disponibilidad.
- **RBAC:** rol fuera de INTEL (p. ej. `activista`, `capturista`, `consulta`) → **403**.
- **Sin fuga de PII:** el payload nunca incluye clave de elector ni campos sensibles de
  `Registro` (solo conteos/agregados).

### Frontend
- Render del tablero con **payload completo** (todos los dominios disponibles).
- Render con **payload parcial** → empty-states en los dominios no disponibles, sin
  romper el layout.
- Lógica del **selector**: estados sin `has_data` deshabilitados.

---

## 7. Fuera de alcance v1 (futuro explícito)

- **Export a PDF / slides** del panorama (paso 2; el diseño de payload único lo facilita).
- **Snapshots materializados "al corte del día X"** (enfoque C) para reproducibilidad y
  rendimiento.
- **Cálculo del índice cívico en backend** (para que el export lo herede).
- **Carga de datos multi-estado** — el selector queda listo, pero poblar los 32 estados
  es trabajo de ingesta aparte (y el merge de SP0b-2b habilita los dominios electoral y
  economía).

---

## 8. Dependencias y notas

- **Habilitación de dominios:** `electoral` y `economia` pasan de empty-state a activos
  al **mergear `feat/sp0b2b-tidy-facts`** (aporta `ElectionResult`/`SocioMetric`/DENUE +
  Alembic 0007) y cargar datos por estado. El contrato de proveedor no cambia.
- **Sin nuevas migraciones en v1** salvo que el rollup de estructura requiera un índice
  de apoyo; de necesitarse, seguir las reglas de Alembic del `CLAUDE.md` (idempotencia,
  enums por NAME en mayúsculas, `autocommit_block` para `ADD VALUE`).
