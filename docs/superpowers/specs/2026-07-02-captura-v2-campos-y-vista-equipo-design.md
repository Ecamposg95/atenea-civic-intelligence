# Captura v2 — Campos completos + Vista de equipo

**Fecha:** 2026-07-02
**Rama sugerida:** `feat/captura-v2`
**Estado:** Diseño aprobado, pendiente de plan de implementación

---

## 1. Contexto y objetivo

El módulo de captura de activistas (SPA-1→SPA-4) ya está en producción: formulario
responsivo móvil/PC, offline-first (IndexedDB + sync), consentimiento/privacidad,
clave de elector cifrada (Fernet), consola admin, exports y reportes.

Este trabajo **no parte de cero**: agrega valor encima de esa base sin tocar sus
cimientos. Dos objetivos concretos pedidos por el usuario:

1. **Capturar el conjunto completo de campos** que importa al equipo de campo.
2. **Que el líder y puestos arriba (coordinador, admin) vean a los registrados**
   de su estructura, sabiendo quién capturó cada uno.

### Hallazgo clave que moldea el diseño

El scoping jerárquico **ya existe en el backend** (`registro_service._role_scoped`):
un LIDER que consulta `/registros/mios` **ya recibe** los registros de sus
activistas + los suyos; un COORDINADOR vería los de sus líderes y activistas.
El hueco es de **frontend + exposición de datos**:

- La lista no muestra **quién capturó** cada registro (`activista_nombre`).
- No hay filtro "míos vs equipo".
- COORDINADOR está **excluido** del guard de captura (`CapturaCtx`,
  `routers/registros.py:20`) — hoy no puede leer por ese endpoint.

Por tanto la "visibilidad" es sobre todo exponer el capturista y abrir lectura,
no reimplementar permisos.

---

## 2. Campos de captura (los 10 acordados)

Conjunto autoritativo del formulario, en orden de importancia:

| # | Campo | Estado hoy | Acción |
|---|-------|-----------|--------|
| 1 | Nombre completo | existe (`nombre_completo`) | — |
| 2 | Sexo (Masculino/Femenino) | **falta** | **columna nueva `sexo`** |
| 3 | Clave de elector | existe (cifrada) | — |
| 4 | Edad | **falta** | **columna nueva `edad`** |
| 5 | Sección | existe (`seccion`) | — |
| 6 | Domicilio | existe (`direccion`) | — |
| 7 | Barrio o Colonia | existe (`colonia`) | — |
| 8 | Teléfono | existe (`telefono`) | — |
| 9 | Estructura | **falta** | **columna nueva `estructura`** |
| 10 | Observación | **falta** | **columna nueva `observacion`** |

### Decisiones de diseño de datos

- **`estructura` es columna nueva**, no un renombre de `area`. La columna `area`
  existente **se conserva en la BD** (no se borra, evita romper datos/exports
  actuales) pero **sale del formulario de captura**. `estructura` toma su lugar
  en la UI.
- **Sexo**: `String(1)` con valores `"M"` / `"F"` (nullable). La UI muestra
  botones "Masculino" / "Femenino". Se valida en el schema: solo `M`/`F`/None.
- **Edad**: `Integer` nullable, validada `0 ≤ edad ≤ 120` en el schema.
- **Observación**: `String(1000)` nullable, textarea en la UI.
- **Edad y sexo son manuales** (tecleados/seleccionados). El autocompletado desde
  la clave INE (que codifica nacimiento y sexo) queda anotado como mejora futura,
  fuera de alcance.

### Columnas nuevas en `registros` (migración 0013)

```
sexo        String(1)     nullable   # "M" | "F"
edad        Integer       nullable   # 0..120
estructura  String(120)   nullable
observacion String(1000)  nullable
```

Todas nullable → migración aditiva y segura para filas existentes.

---

## 3. Vista de equipo (visibilidad jerárquica)

### 3.1 Exponer el capturista

`RegistroRead` gana dos campos:

```
activista_id: Optional[str]        # ya está en el modelo, hoy no se expone
activista_nombre: Optional[str]    # resuelto por join/lookup a User.full_name
```

`activista_nombre` se resuelve en el service (map de `activista_id → full_name`
sobre el conjunto devuelto, una sola consulta, sin N+1). Para registros sin
activista (huérfanos por `SET NULL`) queda `None`.

### 3.2 Filtro "Mis registros / Todo el equipo"

- El endpoint de lista acepta `scope: Literal["mine","team"] = "team"` (query param).
  - `team` (default): usa el `_role_scoped` actual (equipo completo según rol).
  - `mine`: además restringe a `Registro.activista_id == ctx.user.id`.
- Un ACTIVISTA/CAPTURISTA siempre ve solo lo suyo (el `_role_scoped` ya lo fuerza;
  `scope` no le da más alcance — defensa en profundidad).
- Frontend: toggle en la cabecera de la lista. Solo se muestra a roles con equipo
  (LIDER/COORDINADOR/ADMIN); para el activista se oculta (no aporta).

### 3.3 Mostrar el capturista en la lista

En `PersonRow`, cuando el viewer tiene equipo (LIDER/COORDINADOR/ADMIN) y el
registro tiene `activista_nombre`, se muestra un badge con el nombre de quien
capturó. El activista simple no ve badges (todo es suyo).

### 3.4 Abrir lectura a COORDINADOR

Se **separa el guard** de lectura y escritura en `routers/registros.py`:

- **Escritura** (`POST/PUT/DELETE /registros`): guard actual sin cambios
  → `ACTIVISTA, CAPTURISTA, LIDER, ADMIN`. COORDINADOR sigue **sin poder capturar**.
- **Lectura** (`GET /registros/mios`, `GET /registros/{id}`): guard nuevo que
  **añade COORDINADOR** → `ACTIVISTA, CAPTURISTA, LIDER, COORDINADOR, ADMIN`.

El `_role_scoped` ya sabe scopear a un coordinador, así que solo cambia el gate.

> **Nota de auditoría:** revelar la clave de elector sigue siendo exclusivo del
> flujo de reveal auditado de la consola admin. Esta vista de equipo solo muestra
> `clave_masked`. Golden Rule #9 intacta.

---

## 4. Cambios por capa

### Backend
- `models/registro.py` — 4 columnas nuevas.
- `alembic/versions/0013_captura_v2.py` — migración aditiva idempotente
  (`down_revision = "0012"`), guardas `_column_exists`, compatible SQLite.
- `schemas/registro.py`:
  - `RegistroCreate` / `RegistroUpdate`: + `sexo`, `edad`, `estructura`,
    `observacion` con validadores (sexo ∈ {M,F}; edad 0..120).
  - `RegistroRead`: + los 4 campos + `activista_nombre`.
- `services/registro_service.py`:
  - `create_registro` / `update_registro`: persistir los 4 campos nuevos.
  - `list_registros`: aceptar `scope`; resolver `activista_nombre` en lote;
    devolver estructura enriquecida.
- `routers/registros.py`: guard de lectura separado (con COORDINADOR); pasar
  `scope` al service.

### Frontend
- `api/registros.ts`: tipos `Registro`, `RegistroCreate` + los 4 campos y
  `activista_nombre`; `listMisRegistros(scope, q)`.
- `modules/captura/CapturaPage.tsx`:
  - Form: botones Sexo M/F, input Edad (numérico), input Estructura, textarea
    Observación. Layout responsivo consistente (grid 1col móvil → 2col desktop).
  - Lista: toggle scope (solo roles con equipo), badge de capturista en `PersonRow`.
- `offline/` — el payload encolado incluye los campos nuevos (son parte de
  `RegistroCreate`, se propaga solo; verificar `sync.ts`/`queue.ts`).

### Sin cambios
- Crypto, consentimiento/privacidad, ARCO, retention, exports (siguen leyendo
  `area`), reportes. La consola admin no cambia (opcionalmente puede sumar las
  columnas nuevas más adelante — fuera de alcance).

---

## 5. Testing

### Backend (pytest, SQLite)
- Migración 0013 aplica sobre BD con filas existentes sin pérdida.
- Crear registro con los 4 campos nuevos → persisten y se leen.
- Validación: sexo fuera de {M,F} → 422; edad -1 / 121 → 422.
- `scope=mine` para un LIDER devuelve solo los suyos; `scope=team` devuelve
  activistas + los suyos.
- COORDINADOR puede **leer** (`GET /registros/mios`) pero **no crear**
  (`POST` → 403).
- `activista_nombre` correcto para registros de otros; `None` para huérfanos.
- Golden Rule #9: la lista nunca expone `clave_elector` en claro (solo masked).

### Frontend (vitest / build)
- `npm run build` (type-check) pasa con los tipos nuevos.
- Test de que el payload offline incluye los campos nuevos.
- (Opcional) render: el toggle de scope solo aparece para roles con equipo.

---

## 6. Fuera de alcance (YAGNI)

- Autocompletado de edad/sexo desde la clave INE.
- Escaneo de credencial por cámara / OCR.
- Geolocalización GPS en el form (el modelo ya tiene `lat/lng`; no se toca).
- Metas/cuotas por activista y tableros de avance.
- Migrar/borrar la columna `area` o retirarla de exports.
- Catálogo (dropdown administrado) para Estructura — por ahora es texto libre.

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Migración rompe en PostgreSQL prod | Aditiva, todas nullable, idempotente con guardas `_column_exists`; sigue reglas Alembic del CLAUDE.md. |
| Coordinador obtiene más de lo debido al abrir lectura | El scope real lo impone `_role_scoped` (ya probado en RBAC v2); solo cambia el gate de rol. |
| Fuga de PII en la vista de equipo | Solo `clave_masked`; reveal sigue exclusivo de la consola auditada. |
| Registros offline viejos sin campos nuevos | Campos nullable; el sync no falla por ausencia. |
