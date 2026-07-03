# Territorio + Promovidos de Lucy (San Mateo Atenco)

**Fecha:** 2026-07-02
**Rama:** `feat/promovidos-territorio`
**Estado:** Diseño aprobado, pendiente de plan de implementación

---

## 1. Contexto y objetivo

Lucy (`lucy@atlastech.mx`, rol **COORDINADOR**) opera el municipio de **San Mateo
Atenco, Estado de México**. Hoy la plataforma no puede:

1. **Asignarle un territorio** — no hay forma de que el superadmin ligue a un
   usuario con un área. Debe ser configurable (no hardcodeado), habilitado y
   revisado por el superadmin.
2. **Mostrarle su tabla de promovidos** — el equipo tiene decenas de Excel
   (`docs/data/separados/*.xlsx`) con el registro de ciudadanos promovidos (a
   quiénes se comprometen a llevar a votar). Esa tabla, **con el contexto
   electoral de cada sección**, es la vista que más importa.

Este spec entrega **ambas cosas juntas** (decisión del usuario): la asignación de
territorio + la importación de promovidos + la tabla enriquecida con la matriz
electoral 2024 por sección.

### Reutiliza el spine existente (no reinventar)

- `Registro` (persona capturada por un activista) — el promovido ES un Registro.
  Ya tiene `nombre_completo, seccion, direccion, colonia, telefono, edad,
  estructura, sexo, observacion, clave_*` (los 4 últimos de Captura v2).
- `ElectoralArea` — ya modela `MUNICIPIO`/`SECCION` con jerarquía (`municipio_id`,
  parent). `organization_id` nullable = cartografía de referencia compartida.
- `_role_scoped` (registro_service) — ya acota registros por jerarquía de rol.
- `Campaign` + `X-Campaign-Id`, `require_roles`, `AuditLog`, `Page[T]`.

### Fuente de datos verificada

- **Estudio** `docs/VG San Mateo Atenco.pdf` (42 pp). Su **matriz seccional 2024**
  (pp. 19-20) trae las 22 secciones con lista nominal, votos, participación, votos
  coalición/Morena, margen y prioridad. Ya extraída a
  `backend/app/seeds/san_mateo_atenco_secciones_2024.csv` (22 filas, autoritativa).
- **Promovidos** `docs/data/separados/*.xlsx` (43 archivos). Cabecera de dos filas
  combinadas; **cada hoja = un promotor**; año de nacimiento a 2 o 4 dígitos; filas
  vacías intercaladas. Contienen PII (nombres, teléfonos, domicilios).

> Nota: los Excel tienen promovidos en secciones (p.ej. **4127**) que **no** están
> en la matriz de 22. Esas filas muestran contexto electoral vacío ("—").

---

## 2. Arquitectura — tres componentes + una integración

```
[A] Asignación de territorio      User.area_id → ElectoralArea (cualquier nivel)
[B] Datos electorales por sección SeccionElectoral (seed 22 filas del PDF)
[C] Import + Tabla de promovidos  CLI Excel→Registro  +  GET /promovidos  +  UI
          └─ integración: scope_area_ids(user) acota [C] a las secciones de [A]
```

Cada componente es entendible y testeable por separado; se unen por el helper de
alcance territorial.

---

## 3. Componente A — Asignación de territorio

### Modelo
- `User.area_id`: FK nullable → `electoral_areas.id`, `ON DELETE SET NULL`. **Un
  territorio por usuario, cualquier nivel** (estado/municipio/sección).
- Relación `User.area` (solo lectura).

### Helper de alcance (reutilizable por C)
- `territory_service.assigned_area(db, user) -> ElectoralArea | None`.
- `territory_service.scope_area_ids(db, user) -> set[str]` — ids del área asignada
  **+ todos sus descendientes** (recorriendo `municipio_id`/parent). Vacío si no
  hay asignación.
- `territory_service.scope_secciones(db, user) -> set[str]` — los `code` de las
  áreas nivel `SECCION` dentro del alcance (para filtrar `Registro.seccion`).

### API (superadmin-only para escritura)
- `PUT /users/{id}/territorio` body `{ "area_id": "<id>" | null }` — set/clear.
  Guard **solo superadmin**. Área inexistente → 404.
- `GET /territory/search?q=&level=` — busca áreas por nombre/nivel para el selector
  (guard admin/superadmin; no expone datos sensibles, solo nombres de áreas).
- `UserRead` gana `area_id`, `area_nombre`, `area_nivel` (para que el superadmin
  **revise** las asignaciones en la lista de usuarios).
- `GET /perfil` incluye `area` (`{id, nombre, nivel}` | null).

### Empty-state
- Usuario sin territorio → la tabla de promovidos y el perfil muestran aviso
  *"Pídele a tu administrador que te asigne un territorio."* (no bloquea el resto
  de la app; solo las vistas acotadas por territorio quedan vacías).

### Seed (prerrequisito)
- Seed idempotente de **San Mateo Atenco**: un `ElectoralArea` nivel `MUNICIPIO`
  (`code="15076"`, INEGI EdoMex) **+ 22 `ElectoralArea` nivel `SECCION`** hijas
  (una por cada sección del CSV, `municipio_id` → San Mateo Atenco). `organization_id`
  NULL (referencia compartida). Env-gated (`SEED_DEMO_TERRITORY=true`), idempotente.

---

## 4. Componente B — Datos electorales por sección

### Modelo `SeccionElectoral` (nuevo, ligero)
```
seccion        String(20)   index        # "4121"
municipio      String(120)               # "San Mateo Atenco"
anio           Integer                   # 2024
lista_nominal  Integer
votos          Integer
participacion  Float                     # 66.9
coalicion      Integer                   # votos coalición
morena         Integer                   # votos Morena
margen         Integer                   # coalición − Morena (con signo)
prioridad      String(30)                # COMPETITIVA | DEFENDER_EXPANDIR |
                                         # RECUPERAR_OPOSICION | ALTA_PERSUADIBLE
```
- Reference data (sin `organization_id`; es histórico público del IEEM).
- `UniqueConstraint(seccion, anio)`.
- Migración aditiva idempotente.

### Seed
- Carga idempotente desde `backend/app/seeds/san_mateo_atenco_secciones_2024.csv`
  (22 filas, `anio=2024`). Env-gated junto con el seed de territorio.

---

## 5. Componente C — Import de promovidos + tabla

### Nuevo campo en `Registro`
- `promotor`: `String(160)` nullable — el nombre del promotor (hoja del Excel).
  No se crea un usuario por promotor (no son usuarios de la app).

### CLI importer `scripts/import_promovidos.py`
Patrón de `scripts/purge_registros.py` (fuera de request; los archivos son
pesados). Uso:
```
python3 scripts/import_promovidos.py --campaign <campaign_id> --dir docs/data/separados [--dry-run]
```
Reglas de parsing (derivadas de los archivos reales):
1. **Detección de cabecera:** localizar la fila que contiene "PRIMER APELLIDO"
   (puede estar en la fila 1 o 3). La fila siguiente trae los sub-encabezados
   (DÍA/MES/AÑO, CALLE/#/BARRIO/SECCIÓN).
2. **Cada hoja = un promotor** → `promotor = nombre de la hoja` (trim). Si la hoja
   se llama "C1"/"A"/"Hoja1" (genéricas), `promotor` = nombre del archivo sin
   sufijo `_Mayus`.
3. **Mapeo de columnas:** `PRIMER APELLIDO + SEGUNDO APELLIDO + NOMBRE` →
   `nombre_completo` (colapsando espacios); `CALLE + " " + #` → `direccion`;
   `BARRIO/COLONIA` → `colonia`; `SECCIÓN` → `seccion`; `TELÉFONO` → `telefono`
   (solo dígitos); `estructura` = nombre del archivo sin `_Mayus`.
4. **Edad:** de `DÍA/MES/AÑO`. Año 2 dígitos → siglo por heurística (`>25` ⇒ 19xx,
   `<=25` ⇒ 20xx, referencia año actual 2026); calcular edad a 2026. Si falta o es
   inválida → `edad=None`.
5. **Saltar filas vacías** (sin apellidos ni nombre) y la fila de sub-encabezados.
6. **Idempotencia:** `client_uuid = sha1(f"{archivo}|{hoja}|{n_fila}")[:32]`. El
   servicio ya deduplica por `client_uuid` → re-importar no duplica.
7. **Consentimiento/privacidad:** el Excel firmado en papel es el soporte del
   consentimiento. El import escribe `consentimiento=True`,
   `aviso_version="import-papel-2024"`, `activista_id=None` (promovido histórico
   sin activista-app), y **un `AuditLog` por lote** (`action="registro.import"`,
   con archivo y conteo). No usa el flujo interactivo de aviso.
8. Reporte final: por archivo/hoja → filas leídas, importadas, saltadas, duplicadas.

> Los `*.xlsx` contienen PII y **no deben committearse al repo público**; el CLI los
> lee de disco. (Fuera de alcance: moverlos/gitignore — nota operativa.)

### API `GET /promovidos`
- Devuelve `Page[PromovidoRead]`: los campos de `Registro` **+** el contexto
  electoral de su sección (join a `SeccionElectoral` por `seccion`, `anio=2024`):
  `participacion, margen, prioridad` (null si la sección no está en la matriz).
- Scope: `_role_scoped` (rol) **∩** `scope_secciones(user)` (territorio). Si el
  usuario no tiene territorio → resultado vacío + flag para el empty-state.
- Filtros query: `seccion`, `promotor`, `prioridad`, `q` (nombre). Paginado.
- Guard: coordinador/líder/admin (mismo tier que la consola).

### Frontend — módulo "Promovidos"
- Nueva página `/promovidos` (registry: `["superadmin","admin","coordinador","lider"]`).
- Tabla: `Nombre · Edad · Sección · Colonia · Teléfono · Promotor · Estructura`
  **+** columna de contexto: `Part. % · Margen · Prioridad` con color por prioridad
  (DEFENDER_EXPANDIR verde, COMPETITIVA ámbar, RECUPERAR_OPOSICION rojo,
  ALTA_PERSUADIBLE violeta).
- Filtros: sección, promotor, prioridad, búsqueda por nombre. Paginación.
- Empty-state si el usuario no tiene territorio asignado.
- Responsivo (la tabla scrollea horizontal en móvil dentro de su contenedor).

---

## 6. Integración A ↔ C

Lucy asignada a San Mateo Atenco (MUNICIPIO) → `scope_secciones` resuelve sus 22
secciones → `GET /promovidos` filtra a esas secciones → cada fila se enriquece con
`SeccionElectoral`. Así "territorio" y "promovidos" son una sola experiencia.

---

## 7. Cambios por capa

### Backend
- `models/user.py` — `area_id` + relación `area`.
- `models/seccion_electoral.py` — modelo nuevo.
- `models/registro.py` — `promotor`.
- `alembic/versions/0014_*.py` — `users.area_id` + `seccion_electoral` +
  `registros.promotor` (una migración aditiva idempotente, `down_revision=0013`).
- `schemas/` — `UserRead` (+area), `PerfilRead` (+area), `PromovidoRead`, `TerritorioAssign`.
- `services/territory_service.py` — `assigned_area`, `scope_area_ids`, `scope_secciones`, `search_areas`.
- `services/promovido_service.py` — `list_promovidos` (join + scope).
- `services/import_service.py` — parsing + upsert idempotente + audit por lote.
- `routers/users.py` — `PUT /users/{id}/territorio` (superadmin).
- `routers/territory.py` — `GET /territory/search`.
- `routers/promovidos.py` — `GET /promovidos`.
- `routers/registros.py` — `/perfil` incluye area.
- `app/seeds/` — CSV + loader de secciones + seed de área San Mateo Atenco.
- `scripts/import_promovidos.py` — CLI.

### Frontend
- `api/promovidos.ts`, `api/territory.ts` (search + assign).
- `modules/promovidos/PromovidosPage.tsx` — tabla.
- `modules/registry.ts` — módulo "Promovidos".
- Users page — selector de territorio (superadmin) + columna.
- Perfil — muestra territorio / empty-state.

### Sin cambios
- Crypto, consentimiento interactivo, ARCO, retention, exports, RBAC de módulos.

---

## 8. Testing

### Backend (pytest, SQLite)
- **A:** migración `area_id`; `PUT /users/{id}/territorio` → superadmin 200, admin/coordinador 403, área inexistente 404; `scope_area_ids`/`scope_secciones` devuelven área+descendientes; `/perfil` trae el área.
- **B:** modelo + seed carga 22 filas idempotente; `UniqueConstraint(seccion,anio)`.
- **C import:** parsing de un XLSX de fixture (cabecera fila-1 y fila-3, hojas múltiples, año 2/4 dígitos, filas vacías) → registros correctos; idempotencia (re-run no duplica vía `client_uuid`); audit por lote escrito; PII nunca logueada.
- **C API:** `GET /promovidos` enriquece con `SeccionElectoral` (y null en 4127); scope por territorio acota sólo a secciones asignadas; usuario sin territorio → vacío; paginación.
- **Golden Rule #9:** la tabla nunca expone `clave_elector` en claro.

### Frontend (vitest / build)
- `npm run build` verde con los tipos nuevos.
- Render: la tabla muestra el color por prioridad; empty-state sin territorio.

---

## 9. Fuera de alcance (YAGNI)

- Subida de Excel por UI (el CLI cubre la carga inicial; UI es mejora futura).
- Crear usuarios-app por cada promotor.
- Múltiples territorios por usuario; validación nivel↔rol.
- Ingesta IEEM completa por sección (se siembra del PDF).
- El "deck" completo del PDF (demografía, pobreza, estrategia 30/60/90) — futura capa.
- Agregados "meta vs turnout" (el usuario eligió "contexto por sección", no el tablero agregado).
- Mover/gitignore los `*.xlsx` con PII (nota operativa, no código).

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Excel sucios rompen el parser | Detección de cabecera por contenido, no por índice fijo; filas inválidas se saltan y se reportan, no abortan el lote. |
| Re-import duplica promovidos | `client_uuid` determinista sha1(archivo\|hoja\|fila) + dedupe existente. |
| PII en logs o en el repo | El import nunca loguea nombres/teléfonos; nota para gitignore de los xlsx; tabla solo `clave_masked`. |
| Migración rompe en prod | Aditiva, nullable, idempotente, `down_revision=0013`, sigue reglas Alembic del CLAUDE.md. |
| Sección sin dato electoral (4127) | `PromovidoRead` deja contexto en null; la UI muestra "—". |
| Coordinador ve promovidos fuera de su territorio | Doble filtro: `_role_scoped` (rol) ∩ `scope_secciones` (territorio). |
