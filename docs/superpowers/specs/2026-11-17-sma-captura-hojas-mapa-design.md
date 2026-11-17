# San Mateo Atenco 2027 — Captura de hojas, mapa seccional y limpieza

Fecha: 2026-11-17 · Rama: `feat/sma-captura-mapa`
Fuentes: `docs/activismos vg 2027.pdf` (Carpeta de Activismo), `docs/VG San Mateo Atenco.pdf` (estudio estratégico).

## 1. Intención

La app pasa a ser **exclusivamente la herramienta de la campaña de San Mateo Atenco (SMA) 2027**.
Hay mucho papel por capturar (Formato C1 y Formato Activista), así que lo primero es:

1. **Ver el mapa de SMA con sus 22 secciones**, con regiones, prioridades, metas y avance.
2. **Capturar las hojas de papel** con un formulario sencillo, hecho a la medida para capturistas.

Lo demás (módulos "próximamente", pantallas con datos inventados, demos de otros municipios) se elimina.

Éxito = un capturista transcribe una hoja completa (líder + 10 activistas, o activista + 7 promovidos) en
pocos minutos sin errores de clave/sección/teléfono, y Lucy ve en el mapa cómo avanza cada sección contra la meta.

## 2. Usuarios y roles (sin cambios de RBAC, solo configuración)

| Persona | Rol | Qué hace |
|---|---|---|
| Emmanuel Campos | SUPERADMIN | Control total |
| Roberto González | ADMIN (org de SMA) | Administra y crea usuarios (capturistas, etc.) desde **Usuarios** |
| Lucía González (Lucy) | COORDINADOR | Ve toda la campaña (ya es campaign-wide), mapa, promovidos, reportes |
| Capturistas | CAPTURISTA | Solo capturan hojas y ven sus propias hojas recientes |

Roberto y los capturistas se crean desde la pantalla Usuarios (ya existe; ADMIN ya puede crear usuarios).
Un CAPTURISTA que entra a `/` se redirige a la captura de hojas.

## 3. Datos de referencia (reales, versionados en el repo)

En `backend/app/seeds/municipios/15076/`:

- `secciones_2024.csv` (ya existía): resultados 2024 por sección.
- `metas_2027.csv` (**nuevo**): por sección: barrio, región R-1..R-7, prioridad P1..P4, LN may-25,
  proyección 2027, meta líderes / activistas / promovidos (página 6 del PDF; totales 400 / 4,000 / 28,000).
- `secciones.geojson` (**nuevo**): polígonos WGS84 de las secciones de SMA, del Marco Geográfico Electoral
  INE 2021 (vía `github.com/emagar/mxDistritos`). **Limitación conocida:** en 2023 la 4127 se dividió en 6673 y
  6674; el archivo trae el polígono de la 4127 marcado como `"6673/6674"`. Las dos están en R-4 (San Pedro),
  así que el mapa las muestra juntas, y suma sus metas y su avance. Se reemplaza cuando se tenga la cartografía INE 2024.

## 4. Modelo de captura (lo que dice el papel)

Cadena del papel: **Líder → 10 activistas (Formato C1) → cada activista + 7 promovidos (Formato Activista)**.
La familia es la unidad: el activista es el jefe de familia y aparece en la primera fila sombreada de su hoja.

Todas las personas (líder, activista, promovido) son filas de `Registro`, enlazadas entre sí:

Migración `0022_captura_sma` (idempotente, compatible con SQLite) agrega a `registros`:

| Columna | Tipo | Uso |
|---|---|---|
| `tipo` | String(12) null | `LIDER` / `ACTIVISTA` / `PROMOVIDO` (null en filas antiguas) |
| `padre_id` | String(36) FK registros.id SET NULL, index | activista→líder, promovido→activista |
| `apellido_paterno`, `apellido_materno`, `nombres` | String(120) null | Los 11 campos de la página 15 del PDF |
| `calle`, `numero` | String(255)/String(20) null | `direccion` se sigue llenando con "calle numero" |
| `clave_hash` | String(64) null, index | HMAC-SHA256 de la clave normalizada (llave derivada de `SECRET_KEY`), para detectar duplicados sin descifrar |
| `hoja_id` | String(36) null, index | Agrupa las filas capturadas de una misma hoja de papel |
| `legacy` | Boolean not null default false | **"Valor viejo"** |

La migración marca **todas las filas existentes** con `legacy = true`. Esto cumple: "las personas que ya están se
mantienen, pero etiquetadas como valores viejos". Las capturas nuevas siempre van con `legacy = false`.
`nombre_completo` se sigue llenando con "nombres paterno materno" para que el resto del sistema funcione igual.

### Reglas de validación (las 7 reglas del PDF)

Para cada fila:

- **Errores** (bloquean la hoja):
  - falta el apellido paterno o los nombres;
  - la sección no es una de las 22 de SMA;
  - la clave está presente pero no tiene 18 caracteres alfanuméricos;
  - el teléfono está presente pero no tiene 10 dígitos;
  - la clave ya existe en una captura nueva (`legacy = false`) de la campaña;
  - la misma clave aparece repetida dentro de la hoja.
- **Avisos** (no bloquean):
  - falta la clave;
  - falta el teléfono;
  - el nombre normalizado ya existe en capturas nuevas (posible duplicado);
  - la persona coincide con un valor viejo (por clave o nombre). Es informativo: la captura nueva se guarda.
- La sección que vale es **la de la credencial** (texto de ayuda en el formulario).
- Todo se normaliza a MAYÚSCULAS y sin espacios extra. La clave se guarda sin espacios. Del teléfono solo se guardan los dígitos.

## 5. API nueva — router `captura_sma` (prefijo `/captura`)

Pueden usarla: ADMIN, COORDINADOR y CAPTURISTA (el superadmin pasa siempre). Todo con alcance de organización y campaña (`X-Campaign-Id`).

- `GET /captura/catalogo` devuelve las 22 secciones con su barrio y región, y la lista de barrios (para los selects y sugerencias).
- `GET /captura/personas?tipo=LIDER|ACTIVISTA&q=` busca personas nuevas (`legacy = false`) de ese tipo.
  Devuelve `id`, `nombre_completo`, `seccion`, `telefono`, `padre_nombre` y `hijos` (cuántos activistas o promovidos tiene). Máximo 20 resultados.
- `POST /captura/hoja` recibe:
  ```json
  {
    "tipo_hoja": "LIDER" | "FAMILIA",
    "dry_run": true,
    "titular": { "id": "<registro existente>" } | { ...PersonaIn, "padre_id": "<lider id, solo FAMILIA>" },
    "filas": [ PersonaIn, ... ]
  }
  ```
  - `PersonaIn` = `apellido_paterno`, `apellido_materno`, `nombres`, `seccion`, `calle`, `numero`, `colonia`, `clave_elector`, `telefono`.
  - En una hoja LIDER el titular es el líder y las filas son hasta 10 activistas. En una hoja FAMILIA el titular es el activista (fila sombreada) y las filas son hasta 7 promovidos.
  - Las filas vacías se ignoran.
  - Respuesta: `{ "ok": bool, "titular": FilaResultado, "filas": [ { "index", "estado": "ok"|"aviso"|"error", "mensajes": [..] } ], "creados": n, "hoja_id": "..." }`.
  - Con `dry_run = true` nunca escribe. Con `dry_run = false` escribe **todo o nada**, y solo si no hay errores (si los hay, responde 422 con la misma estructura).
  - Cada persona creada guarda:
    - `consentimiento = true` y `aviso_version = "papel-2027"`;
    - la aceptación del aviso de privacidad, igual que `create_registro`;
    - la clave cifrada con Fernet, `clave_masked` y `clave_hash`;
    - `activista_id` = el usuario que capturó;
    - `promotor` = el nombre del líder (compatibilidad con las vistas actuales).
  - Se escribe un solo `AuditLog` `captura.hoja` con conteos y sin datos personales.
  - La clave nunca se devuelve ni se registra en logs.
- `GET /captura/mis-hojas` devuelve las últimas 20 hojas del usuario: `hoja_id`, tipo, titular, número de filas y fecha.

## 6. Pantalla de captura — `/captura` "Captura de hojas"

Reemplaza a "Captura rápida", que se elimina. La página está pensada para escritorio y teclado, y también funciona en el celular.

1. Arriba se elige el tipo: **Hoja de líder (C1)** u **Hoja de familia (activista)**.
2. **Titular**:
   - En una hoja C1: se busca un líder ya capturado o se captura uno nuevo (mismos campos que una fila).
   - En una hoja de familia: se busca un activista ya capturado (se muestra su líder) o se captura uno nuevo eligiendo su líder.
   - El titular se queda puesto entre hojas, para capturar seguidas varias hojas del mismo líder o activista.
3. **Filas**: una cuadrícula fija de 10 filas (C1) o 7 (familia), con columnas en el orden del papel:
   Ap. paterno · Ap. materno · Nombre(s) · Sección · Calle · # · Bo./Col. · Clave de elector · Teléfono.
   - La sección es un select con las 22 secciones.
   - Bo./Col. sugiere los barrios del catálogo.
   - La clave muestra un contador "n/18".
   - Todo pasa a mayúsculas mientras se escribe.
   - Tab avanza de celda; las filas vacías se ignoran.
4. **Revisar** (dry-run) marca cada fila en verde, ámbar o rojo, con sus mensajes. **Guardar hoja** confirma
   ("Hoja guardada: 1 líder + 8 activistas"), limpia las filas y conserva el titular.
5. A un lado (o abajo en el celular) se ven las "Mis hojas recientes".

## 7. Mapa SMA — `/mapa`

- Backend: `GET /municipio/15076/mapa` devuelve un GeoJSON con las propiedades de cada sección: barrio, región,
  prioridad, metas, resultados 2024 (LN, votos, participación, coalición, morena, margen, etiqueta) y el avance de la campaña
  (líderes, activistas y promovidos nuevos capturados, más el total de valores viejos). Lo pueden ver ADMIN, COORDINADOR, LIDER y ANALYST.
- Frontend: un mapa MapLibre centrado en SMA con un número de sección en cada polígono. El color se elige con un selector:
  **Región** · **Prioridad** · **Avance vs meta** (% de promovidos) · **Resultado 2024** (margen).
  Al hacer clic en una sección se abre un panel con todos sus números.
- Debajo del mapa va una tabla de las 22 secciones agrupadas por región: meta y avance de líderes, activistas y promovidos (con barras), más los valores viejos.
  Al final van los totales: 400 / 4,000 / 28,000.
- Reemplaza a "Mapa" (`/maps`) y "Territorios", que se eliminan porque usaban una métrica inventada.

## 8. Valores viejos en las vistas

- `RegistroRead` y `PromovidoRead` exponen `legacy`, `tipo` y `padre_nombre`.
- **Promovidos**:
  - filtro "Nuevos / Valores viejos / Todos", que por defecto muestra Nuevos;
  - insignia gris "Valor viejo";
  - columnas de tipo y líder o activista.
- Los KPI del tablero ejecutivo y el avance del mapa cuentan **solo los nuevos**. Los viejos se muestran aparte como referencia.

## 9. Limpieza

Se eliminan:

- **Frontend**:
  - los módulos `resultados`, `padron`, `economia`, `denue`, `banxico`, `demografia`, `indice` y `ai-analyst`;
  - las entradas "soon" (`candidaturas`, `sentimiento`, `participacion`) y `ComingSoonPage` si queda sin uso;
  - `MapExplorerPage`, `mapMetrics`, `territorios`, `MapCanvas` y `types/maps` si quedan sin uso;
  - `CoverageBars`, el texto "Platform demo" de la barra lateral y `CapturaRapidaPage`.
- **Backend**:
  - el catálogo falso de capas de `map_service`, y el endpoint `/maps/layers` si queda sin uso;
  - los seeds `demo_atizapan*`, `scripts/seed_atizapan_operacion.py`, la región "atizapan" del registro de municipios
    con sus datos, y `docs/demo-atizapan.md`.

Todo queda recuperable desde git: el tag `pre-sma-cleanup` apunta al `main` anterior.

Se mantiene todo lo que funciona con datos reales: promovidos e importación de Excel, militantes, atención ciudadana, minutas,
scrum, plan territorial, war room, alertas, panorama municipal, reportes, auditoría, usuarios, campañas, IEEM e indicadores.

Docs: actualizar `CLAUDE.md` (sección SMA) y `STATUS.md`. `docs/roadmap.md` se elimina porque está obsoleto.

Railway: migrar `railway.json` a `.railway/railway.ts` con `railway config migrate`, porque `railway.json` deja de funcionar el 2026-12-01.

## 10. Fuera de alcance

- OCR de las hojas.
- Los otros 4 frentes de estructura (sectores, empresarios, jóvenes, partido).
- La cartografía INE 2024.
- Borrar en producción los datos sintéticos de demo. Eso es una decisión manual y no la hace ninguna migración.

## 11. Decisiones mías (revisar)

- Todas las personas son `Registro` con `tipo` y `padre_id`, en lugar de tablas nuevas, para reutilizar el cifrado, la privacidad, ARCO, las exportaciones y los reportes.
- La clave es opcional y genera un aviso, porque el papel a veces viene incompleto. Si viene, debe ser válida.
- Los duplicados por clave bloquean la hoja. Los duplicados por nombre solo avisan.
- El polígono de la 4127 se usa para 6673 y 6674.
- Promovidos muestra "Nuevos" por defecto.
