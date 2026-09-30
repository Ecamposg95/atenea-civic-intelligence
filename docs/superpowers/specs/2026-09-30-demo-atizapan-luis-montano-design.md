# Demo Atizapán de Zaragoza 2027 · Luis Montaño — Design

**Fecha:** 2026-09-30 · **Rama:** `feat/alertas-centro-unificado` (misma rama que Alertas, que es el
último subproyecto de este programa)
**Programa:** demo de validación para Arturo. Sustituye al subproyecto D2 ("datos sintéticos en
una campaña Demo separada") con una campaña concreta que Arturo quiere ver: **Atizapán de
Zaragoza, candidato Luis Montaño (Morena-PVEM-PT), elección 2027**, con inteligencia comparativa
de los **municipios periféricos**. San Mateo Atenco es de **otro cliente** (Lucy): Arturo no debe
ver sus datos de campaña.

## 1. Problema

Arturo va a validar el producto viendo la campaña de Atizapán. Hoy la plataforma:

- Solo conoce **un** municipio. San Mateo Atenco (SMA, 15076) está fijo en tres seeds
  (`demo_territory.py`, `demo_municipio_intel.py`, `demo_election_date.py`), en
  `municipio_service.py` (nombre como llave y como fallback), en `PanoramaMunicipioPage.tsx`
  (`CODE = "15076"`), en el label del menú (`registry.ts:286`) y en el default de municipio de
  `CapturaMilitantePage.tsx:61`.
- **No tiene candidato**: `Campaign` solo guarda `name`, `cycle`, `status`, `license_tier`,
  `meta_afiliacion`. La campaña no sabe su municipio ni su partido.
- **Lee todas las secciones sin filtrar por municipio.** `operacion_service.list_planes`
  (`operacion_service.py:49`) y `promovido_service` (`:83`) consultan `SeccionElectoral` por
  `anio == 2024` sin más. Al sembrar las 174 secciones de Atizapán, Lucy vería 196 secciones en
  el plan territorial, el War Room y Alertas de SMA. Es el riesgo principal del programa.
- No hay datos de Atizapán en el repo ni generador de datos operativos.
- **Arturo es superadmin en la org de Lucy** (Atlas Tech, `arturo@atlastech.mx`, creado
  2026-09-24) y ve cross-tenant todo lo de SMA. Con SMA como cliente distinto, eso es incorrecto.

## 2. Decisiones de producto (validadas con el usuario 2026-09-30)

- **Campaña demo completa** de Atizapán en PROD, explorada por Arturo como ADMIN de su propia
  organización y también con la credencial del coordinador. La campaña de Lucy/SMA no cambia en
  nada visible.
- **Org nueva para Arturo** ("Atizapán 2027", slug `atizapan`). La cuenta existente de Arturo se
  re-domicilia a esa org con rol **ADMIN** (deja de ser superadmin y deja de ver a Lucy). Como ADMIN
  conserva todos los módulos salvo "Organizaciones" (`registry.ts:362`, solo superadmin) y el panel
  técnico `/plataforma` sigue disponible (superadmin/admin). Descartado: mantenerlo superadmin
  (vería SMA) o bajarlo a ADMIN en la misma org (igual vería las campañas de la org).
- **Municipios periféricos solo como inteligencia** (panorama comparativo): datos reales IEEM/INEGI
  de Tlalnepantla de Baz, Naucalpan de Juárez, Nicolás Romero, Cuautitlán Izcalli, Isidro Fabela y
  Jilotzingo, sin campaña ni estructura. Descartado: campañas propias en cada uno.
- **Datos territoriales y de inteligencia reales**, descargados de fuentes públicas (IEEM, INEGI,
  CONEVAL). No se inventan cifras electorales ni censales.
- **Datos operativos sintéticos** (estructura, promovidos, militantes, casos, minutas, acuerdos,
  agenda), ficticios y marcados como demo, con volúmenes que hagan disparar Alertas.
- **Opción A de modelado**: columnas `municipio_code`, `candidato`, `partido` en `Campaign`
  (migración). Descartadas: modelo `Candidate` (B, nadie lo consume) y convención sin migración
  (C, no escala a un tercer municipio).
- **Una sola spec y un solo plan** para AZ-1..AZ-4. AZ-5 (Alertas) conserva su spec
  (`2026-09-24-alertas-centro-unificado-design.md`) y su plan (`2026-09-27-alertas-centro-unificado.md`).
- Fuera de alcance: convertir los módulos con fixtures nacionales (Resultados, Padrón, Economía,
  Denue, Banxico, Censo, Copiloto) a datos de Atizapán; geometría seccional (mapa); OCR y
  Acuerdos/Minutas nuevos.

## 3. Datos de Atizapán y su región (hechos verificados 2026-09-30)

Descargas probadas sin sesión (HTTP 200):

| Fuente | URL | Contenido |
|---|---|---|
| IEEM 2024 ayuntamientos por sección | `https://www.ieem.org.mx/assets/docs/procesos-electorales/resultados/2024/Ayuntamientos/Resultados_definitivos_ayu_seccion.xlsx` | Hoja `2024_SEE_AYUN_MEX_SEC`, encabezado en la fila 7 (índice 6): `ID_ESTADO, NOMBRE_ESTADO, ID_DISTRITO_LOCAL, CABECERA_DISTRITAL_LOCAL, ID_MUNICIPIO, MUNICIPIO, SECCION, CASILLAS, ACTAS_CASILLA-MEC, PAN, PRI, PRD, PVEM, PT, MC, MORENA, NAEM, <combinaciones>, CAND_IND1..9, NUM_VOTOS_VALIDOS, NUM_VOTOS_CAN_NREG, NUM_VOTOS_NULOS, TOTAL_VOTOS, LISTA_NOMINAL` |
| IEEM 2021 ayuntamientos por sección | `.../resultados/2021/RESULTADOS DEFINITIVOS INTEGRANTES DE LOS AYUNTAMIENTOS/RESULTADOS POR SECCION ELECION AYUNTAMIENTOS 2021.xlsx` | Encabezado fila 6: `ID_ESTADO … MUNICIPIO, SECCION, CASILLAS, PAN, PRI, PRD, PVEM, PT, MC, MORENA, PES, RSP, FXM, NAEM, <combinaciones>, …, TOTAL_VOTOS, LISTA_NOMINAL` |
| IEEM 2018 ayuntamientos por sección | `.../resultados/2018/2018_SEE_AYUN_MEX_SEC.xlsx` | Encabezado fila 6, con `CIRCUNSCRIPCION` al inicio; partidos `PAN, PRI, PRD, PT, PVEM, MC, NA, MORENA, ES, VR` |
| INEGI ITER 2020 Edomex | `https://www.inegi.org.mx/contenidos/programas/ccpv/2020/datosabiertos/iter/iter_15_cpv2020_csv.zip` | `conjunto_de_datos_iter_15CSV20.csv`, 286 columnas; fila municipal = `MUN == "013"` y `LOC == "0000"` |
| CONEVAL pobreza municipal 2020 | mejor esfuerzo (XLSX estatal de CONEVAL) | `pobreza_moderada_pct`, `pobreza_extrema_pct`, `vulnerable_carencias_pct` |

Atizapán en el IEEM: `ID_MUNICIPIO = 13`, `MUNICIPIO = "ATIZAPAN DE ZARAGOZA"`, código INEGI
**15013**. 174 secciones con votación en 2024 (rango 250–6743), en dos distritos locales:
**16** (Ciudad Adolfo López Mateos, 129 secciones) y **26** (45 secciones). La fila con
`SECCION = 0` (voto en tránsito) se descarta.

Totales 2024 (ayuntamiento): lista nominal 422,224; votos 272,657 (participación 64.6 %);
bloque Morena-PVEM-PT 107,183; bloque PAN-PRI-PRD-NAEM 140,992. Con la regla de prioridad de §4.1:
82 RECUPERAR_OPOSICION, 41 DEFENDER_EXPANDIR, 36 COMPETITIVA, 15 ALTA_PERSUADIBLE.

Municipal ITER 2020: población 523,674 (51.6 % mujeres), 18+ 390,028, viviendas habitadas
150,388, hogares con jefatura femenina 50,238 de 150,367, grado promedio de escolaridad 11.06.

### 3.0 Región "Atizapán y periferia" (IEEM 2024, verificado en el mismo XLSX)

El `ID_MUNICIPIO` del IEEM coincide con la clave municipal INEGI (código = `"15" + zfill(3)`).

| Municipio | `MUNICIPIO` (IEEM) | Código | Secciones 2024 | Lista nominal 2024 |
|---|---|---|---|---|
| Atizapán de Zaragoza (campaña) | `ATIZAPAN DE ZARAGOZA` | 15013 | 174 | 422,224 |
| Tlalnepantla de Baz | `TLALNEPANTLA DE BAZ` | 15104 | 385 | 568,787 |
| Naucalpan de Juárez | `NAUCALPAN DE JUAREZ` | 15057 | 460 | 710,816 |
| Nicolás Romero | `NICOLAS ROMERO` | 15060 | 110 | 313,687 |
| Cuautitlán Izcalli | `CUAUTITLAN IZCALLI` | 15121 | 262 | 431,918 |
| Isidro Fabela | `ISIDRO FABELA` | 15038 | 5 | 9,323 |
| Jilotzingo | `JILOTZINGO` | 15046 | 10 | 17,459 |

Total región: 1,406 secciones. Los periféricos usan los **mismos bloques** que Atizapán (§3.1),
porque la lectura es la del mismo cliente (Morena-PVEM-PT como propio). Solo Atizapán lleva campaña.

### 3.1 Semántica de bloques (decisión clave)

En la matriz de SMA la columna `coalicion` es el **bloque propio** de la campaña de Lucy y `morena`
el **bloque rival**: `margen = coalicion − morena`, y donde Morena gana amplio la prioridad es
`RECUPERAR_OPOSICION`. Esa semántica (propio/rival) se conserva en las columnas; lo que cambia es
**qué partidos** forman cada bloque y **cómo se etiquetan**:

| Municipio | `coalicion` (propio) | `morena` (rival) | Etiquetas |
|---|---|---|---|
| SMA 15076 | como hoy | como hoy | "Coalición" / "Morena" (sin cambio visible) |
| Atizapán 15013 y los 6 periféricos | MORENA + PVEM + PT + combinaciones (`PVEM_PT_MORENA`, `PVEM_PT`, `PVEM_MORENA`, `PT_MORENA`) | PAN + PRI + PRD + NAEM + combinaciones (`PAN_PRI_PRD_NAEM`, `PAN_PRI_PRD`, `PAN_PRI_NAEM`, `PAN_PRD_NAEM`, `PRI_PRD_NAEM`, `PAN_PRI`, `PAN_PRD`, `PAN_NAEM`, `PRI_PRD`, `PRI_NAEM`, `PRD_NAEM`, `CC_PAN_PRI_PRD_NAEM`) | "Morena-PVEM-PT" / "PAN-PRI-PRD" |

MC y candidaturas independientes no entran en ningún bloque (cuentan en `votos`). Las etiquetas
viven en el registro de municipios (§5.2) y viajan en la respuesta del panorama.

## 4. AZ-1 · Dataset de Atizapán y su región

### 4.1 Script `backend/scripts/build_municipio_dataset.py`

```
python3 scripts/build_municipio_dataset.py --municipio 15013 [--municipio 15104 ...] [--out app/seeds/municipios] [--cache <dir>]
python3 scripts/build_municipio_dataset.py --region atizapan      # los 7 códigos de §3.0
```

- Descarga con `httpx` (ya en requirements) los tres XLSX del IEEM y el ZIP de ITER a `--cache`
  (default `.cache/datasets/`, ignorado por git); reutiliza el archivo si ya existe. Los archivos
  fuente se leen **una vez** y se generan todos los municipios pedidos.
- Lee con `openpyxl` en modo `read_only`; localiza el encabezado buscando la fila que contiene
  `SECCION`; filtra `ID_MUNICIPIO == int(code[2:])` y `SECCION > 0`. El nombre del municipio se
  toma del registro (§5.2), no del XLSX.
- Genera **`secciones_2024.csv`** (esquema idéntico al de SMA):
  `seccion,lista_nominal,votos,participacion,coalicion,morena,margen,prioridad`.
  - `votos = TOTAL_VOTOS`; `participacion = round(TOTAL_VOTOS / LISTA_NOMINAL * 100, 1)`.
  - `coalicion`, `morena` según §3.1; `margen = coalicion − morena`.
  - `prioridad` (regla inferida de las 22 secciones del estudio de SMA, que la cumple al 100 %):
    `|margen| < 30` → `ALTA_PERSUADIBLE`; `|margen| ≤ 150` → `COMPETITIVA`;
    `margen > 150` → `DEFENDER_EXPANDIR`; `margen < −150` → `RECUPERAR_OPOSICION`.
    Los umbrales son constantes del script y se documentan en el manifest.
- Genera **`intel.csv`** (`categoria,anio,indicador,valor`):
  - `electoral` 2018/2021/2024: `elec_lista_nominal`, `elec_votos_totales`, `elec_participacion`,
    `elec_margen_votos` (propio − rival del año, con los bloques equivalentes de ese año),
    `elec_margen_pp`, `elec_casillas` (solo 2024; suma de `CASILLAS`).
  - `voto2024`: `voto_<PARTIDO>` para `MORENA, PRI, PVEM, MC, PAN, PT, PRD, NAEM` (voto directo
    al partido, igual que en SMA) y `coalicion_ganadora_votos` = bloque rival (PAN-PRI-PRD-NAEM),
    que fue el ganador.
  - `secciones` 2024: `secciones_total`, `secciones_morena` (secciones donde `morena > coalicion`),
    `secciones_coalicion`, `secciones_persuadibles` (`|margen| ≤ 150`), `participacion_prom_seccional`.
  - `socio` 2020 desde ITER: `poblacion`, `pct_mujeres`, `pct_hombres`, `viviendas` (TVIVHAB),
    `pct_jefa_hogar` (HOGJEF_F / TOTHOG), `pob_18_mas`, `grado_escolaridad`,
    `pct_sin_derechohabiencia` (PSINDER / POBTOT), `pct_viviendas_internet` (VPH_INTER / TVIVHAB).
  - `socio` 2020 desde CONEVAL si la descarga funciona: `pobreza_moderada_pct`,
    `pobreza_extrema_pct`, `vulnerable_carencias_pct`. Si falla, se omiten y el script lo anota.
  - No se generan `movilidad` ni `crecimiento_pct_2010_2020` ni `pct_pob_5_19` (no están en ITER
    básico). El panorama ya muestra "—" para indicadores ausentes.
- Genera **`manifest.json`**: municipio, fecha, por fuente `{url, sha256, filas_leidas}`, umbrales
  de prioridad, indicadores omitidos y por qué.
- Salida en `backend/app/seeds/municipios/<code>/` (los 7 códigos de §3.0, ~1,400 filas de
  secciones en total). Los archivos se **commitean**; el script nunca corre en producción ni en el
  lifespan.

### 4.2 Pruebas

- `tests/test_build_municipio_dataset.py` con un XLSX de fixture de 8 secciones en **dos
  municipios** (dos distritos, una fila `SECCION = 0`, una combinación de coalición por bloque) y
  un ITER de 3 filas: verifica bloques, margen, prioridad por umbral, descarte de sección 0,
  participación, separación por municipio y los indicadores socio derivados. Las descargas se
  inyectan (función `fetch` parametrizable), sin red en tests.

## 5. AZ-2 · Plataforma multi-municipio

### 5.1 Migración `0021_campaign_municipio.py` (down_revision: 0020)

- `campaigns`: `municipio_code String(10) NULL` (índice), `candidato String(160) NULL`,
  `partido String(60) NULL`.
- `seccion_electoral`: `municipio_code String(10) NULL` (índice). Backfill:
  `UPDATE seccion_electoral SET municipio_code = '15076' WHERE municipio = 'San Mateo Atenco' AND municipio_code IS NULL`.
- Guardas idempotentes (`_column_exists`, `_index_exists`), `batch_alter_table` para SQLite. Sin
  enums nuevos.

### 5.2 Registro de municipios `backend/app/seeds/municipios.py`

```python
@dataclass(frozen=True)
class MunicipioConfig:
    code: str            # "15013"
    name: str            # "Atizapán de Zaragoza"
    region: str          # "atizapan" | "toluca"  (clave de agrupación, sin tabla)
    data_dir: Path       # seeds/municipios/15013
    bloque_propio: str   # "Morena-PVEM-PT"
    bloque_rival: str    # "PAN-PRI-PRD"
    extra_secciones: tuple[str, ...] = ()   # SMA: ("4127",)

MUNICIPIOS: dict[str, MunicipioConfig]   # 15076 (región "toluca") + los 7 de §3.0 (región "atizapan")
REGIONES: dict[str, str] = {"atizapan": "Atizapán y periferia", "toluca": "Valle de Toluca"}
```

La región es una **constante del registro**, no una entidad: agrupa municipios para el selector y
la comparación (§5.4). Un municipio pertenece a una sola región.

Los CSV de SMA se **mueven** a `seeds/municipios/15076/` con los nombres genéricos
(`secciones_2024.csv`, `intel.csv`) para que el registro sea uniforme; `demo_territory.py` y
`demo_municipio_intel.py` quedan como funciones parametrizadas `seed_territory(db, cfg)` y
`seed_intel(db, cfg)` que iteran `MUNICIPIOS`. `seed_territory` escribe `SeccionElectoral.municipio_code`
y **reconcilia** filas existentes sin código (mismo patrón que hoy con `_EXTRA_SECCIONES`).

Gating en el lifespan (`main.py`): `SEED_DEMO_TERRITORY=true` siembra el territorio de **todos**
los municipios del registro (SMA + los 7 de la región; ~1,430 `ElectoralArea` + ~1,430
`SeccionElectoral`, idempotente, unos segundos la primera vez). `seed_intel` sigue corriendo
siempre. La sección electoral se busca por `(seccion, anio)` como hoy; los códigos no colisionan
entre municipios (Edomex numera secciones de forma única en el estado).

### 5.3 Alcance de secciones por campaña

Nuevo helper en `territory_service.py`:

```python
def secciones_query(ctx: CampaignContext, anio: int = 2024) -> Select:
    q = select(SeccionElectoral).where(SeccionElectoral.anio == anio)
    if ctx.municipio_code:
        q = q.where(SeccionElectoral.municipio_code == ctx.municipio_code)
    return q
```

- `CampaignContext` gana `municipio_code: Optional[str]`; `get_campaign_context` lo copia de la
  campaña ya cargada (sin consulta extra).
- Lo adoptan: `operacion_service.list_planes` (alimenta plan territorial, War Room, `seguimiento`
  y Alertas), `promovido_service` (`:83` filtro por prioridad y `:101` contexto por sección),
  `militante_service` (`:373`).
- **Regla de compatibilidad**: sin `municipio_code` en la campaña, no se filtra. Las fixtures de
  `tests/conftest.py` no tienen municipio y siguen viendo lo mismo; la campaña de Lucy recibe
  `municipio_code = "15076"` (§5.5) y pasa a ver solo SMA, que es lo que ve hoy.

### 5.4 Panorama por campaña y región comparativa

- `municipio_service.panorama(db, code)` pasa a buscar secciones por
  `SeccionElectoral.municipio_code == code` (ya no por nombre) y elimina el fallback
  `"San Mateo Atenco"`: si no existe el área ni hay métricas → `None` (404, como hoy).
- Respuesta: se añade `"bloques": {"propio": cfg.bloque_propio, "rival": cfg.bloque_rival}` desde
  el registro (default `"Coalición"`/`"Morena"` si el código no está en el registro).
- `GET /municipio/{code}/panorama` no cambia de contrato salvo el campo nuevo. Sigue siendo lectura
  de datos de referencia org-globales (IEEM/INEGI públicos), no datos de cliente; por eso no se
  restringe por org. Lo que Arturo **no** ve de SMA son registros, militantes, casos y estructura,
  aislados por tenant (§6).
- **Nuevo** `GET /municipio/region` (`CampaignCtx`, mismos roles que el panorama): región de la
  campaña activa (`ctx.municipio_code` → `cfg.region`) con un resumen por municipio, calculado
  desde `CensusMetric` (`intel.csv`) sin tocar secciones:
  ```json
  {"region": "Atizapán y periferia",
   "municipios": [{"code": "15013", "name": "Atizapán de Zaragoza", "es_campana": true,
                   "lista_nominal_2024": 422224, "participacion_2024": 64.6,
                   "margen_votos_2024": -33809, "margen_pp_2024": -12.4,
                   "secciones_total": 174, "secciones_persuadibles": 51, "poblacion": 523674}, ...]}
  ```
  Ordenado con el municipio de la campaña primero y luego por lista nominal desc. Sin campaña
  (`X-Campaign-Id` ausente) → 400; campaña sin `municipio_code` → 404 "Campaña sin municipio".

### 5.5 Campaña: schema, API y seeds existentes

- `CampaignOut` y `CampaignCreate` exponen `municipio_code`, `candidato`, `partido` (opcionales).
- `bootstrap._seed_demo_activists` (campaña de Lucy) pone `municipio_code = "15076"` si está vacío
  (idempotente). `demo_election_date` deja de depender de un UUID fijo: itera las campañas con
  `municipio_code` en el registro y asegura `Contest` con fecha `2027-06-06` y
  `territory_id` = área MUNICIPIO del código. `DEMO_CAMPAIGN_ID` se elimina.

### 5.6 Frontend

- `store/campaignStore.ts`: `Campaign` gana `municipio_code`, `candidato`, `partido` (opcionales).
- `PanoramaMunicipioPage.tsx`: carga `GET /municipio/region` y muestra un **selector de municipio**
  (chips) con los municipios de la región, seleccionado por defecto el de la campaña; el `code`
  seleccionado alimenta el panorama actual (tarjetas, histórico, voto 2024, tabla de secciones).
  Sin campaña o sin código → `DataState` "Esta campaña no tiene municipio asignado". Encabezado con
  el nombre que devuelve el backend. Columnas de la tabla y tarjetas usan
  `bloques.propio` / `bloques.rival`. Nueva sección **"Región"** al final: tabla comparativa con
  las columnas del resumen de región (lista nominal, participación, margen, secciones
  persuadibles, población), fila de la campaña resaltada. La fila de la tabla de secciones enlaza
  al plan territorial **solo** cuando el municipio seleccionado es el de la campaña (los
  periféricos no tienen plan).
- `api/municipio.ts`: `getRegion()` y tipos espejo.
- `registry.ts:286`: label `"Panorama municipal"` (el nombre del municipio ya está en la página).
- `CapturaMilitantePage.tsx:61`: default de `municipio` = nombre del municipio de la campaña activa
  (desde el panorama ya cargado o vacío si no hay).
- `DashboardPage.tsx`: subtítulo del `PageHeader` = `"<campaña> · <candidato> (<partido>)"` cuando
  existan; si no, el texto actual. `Topbar`/`CampaignSwitcher` muestran `candidato` bajo el nombre
  cuando exista.

### 5.7 Pruebas

- Migración: la suite corre sobre SQLite con `Base.metadata.create_all`; se prueba el backfill
  con una fila SMA sin código en `test_seccion_electoral.py`.
- `seed_territory` idempotente para dos municipios (dos corridas, mismos conteos, sin duplicados),
  y reconciliación de `municipio_code` en filas previas.
- Aislamiento: con SMA y Atizapán sembrados, `list_planes` de una campaña con `municipio_code =
  "15076"` devuelve 22 secciones y la de `"15013"` 174; sin código devuelve todas.
- `panorama("15013")` devuelve `bloques` de Atizapán y 174 secciones; `panorama("15076")` sigue
  devolviendo 22 y las etiquetas actuales.
- `GET /municipio/region`: con campaña 15013 devuelve 7 municipios con Atizapán primero y
  `es_campana = true`; con campaña 15076 devuelve solo SMA; sin header → 400; campaña sin
  municipio → 404; ACTIVISTA → 403.
- `CampaignOut` serializa los campos nuevos; `POST /campaigns` los acepta.
- Frontend: `npm run build`; Vitest de la selección de código desde el store, del selector de
  región (default = campaña) y de las etiquetas de bloque en la tabla.

## 6. AZ-3 · Campaña y estructura de Atizapán

### 6.1 Seed `backend/app/seeds/demo_atizapan.py` — `seed_atizapan_campaign(db)`

Gate: `SEED_DEMO_ATIZAPAN=true` **y** `SEED_DEMO_ATIZAPAN_PASSWORD` presente (sin contraseña → se
omite con log, como el seed de Lucy). Corre en el lifespan después del territorio, en `try/except`.
Idempotente por slug de org, correo, nombre de campaña y (seccion, anio).

- **Org nueva**: `Organization(name="Atizapán 2027", slug=SEED_DEMO_ATIZAPAN_ORG_SLUG` (default
  `atizapan`)`)`. Todo lo que sigue (campaña, usuarios, membresías, datos de §7) pertenece a esa
  org. El aviso de privacidad se resuelve al **global** (`organization_id NULL`, sembrado por
  `bootstrap._seed_global_privacy_notice`); `Cargo` es global. No se crea aviso propio.
- **Re-domiciliar a Arturo**: si `SEED_DEMO_ATIZAPAN_ADMIN_EMAIL` está definido (en PROD,
  `arturo@atlastech.mx`) y el usuario existe en **otra** org, el seed lo mueve: `organization_id` =
  org nueva, `role = ADMIN`, borra sus `CampaignMembership` de otras orgs, conserva contraseña y
  `is_active`, y escribe un `audit_log` (`user.rehome`, actor = sistema). Si ya está en la org nueva,
  no hace nada. Si no existe, lo crea como ADMIN con la contraseña común y
  `must_change_password = True`. Es un cambio deliberado y de una sola vía; revertirlo es manual
  (superadmin ECG vía SQL o UI de usuarios).
- Campaña: `name = "Atizapán de Zaragoza 2027"`, `cycle = 2027`, `status = ACTIVE`,
  `municipio_code = "15013"`, `candidato = "Luis Montaño"`, `partido = "Morena-PVEM-PT"`,
  `meta_afiliacion = 8000`. Contest con fecha 2027-06-06 y `territory_id` del municipio (vía §5.5).
- Usuarios (`@demo.atizapan.mx`, contraseña común desde el env, `must_change_password = False`):

| Rol | Cantidad | Correo | Territorio |
|---|---|---|---|
| COORDINADOR | 1 | `coordinador@` | `area_id` = municipio 15013 |
| LIDER | 8 | `lider01@`…`lider08@` | `coordinador_id` = coordinador; zona = bloque contiguo de secciones ordenadas por número (6 zonas del distrito 16 de ~22 secciones y 2 del distrito 26 de ~22) |
| ACTIVISTA | 40 | `activista01@`…`activista40@` | `lider_id` = líder de su zona; `seccion` = una sección de la zona (5 por líder; se eligen primero las COMPETITIVA/ALTA_PERSUADIBLE de la zona) |
| CAPTURISTA | 2 | `capturista01@`, `capturista02@` | sin jerarquía |

  Nombres ficticios desde listas internas (`_NOMBRES`, `_APELLIDOS`), `full_name` con sufijo de
  rol como hace Lucy ("… — Líder zona 3"). Membresías `CampaignMembership` con el rol del usuario.
- Arturo: ADMIN de la org (ve toda la org: la campaña, sus usuarios, el panorama regional); en el
  guion recibe además la credencial de `coordinador@demo.atizapan.mx` para la vista de campaña.

### 6.2 Pruebas

`tests/test_demo_atizapan.py`: sin env → no-op; con env → org `atizapan`, 51 usuarios, 51
membresías, 1 campaña con los campos nuevos, contest fechado, 8 líderes con `coordinador_id`, 40
activistas con `lider_id` y `seccion` de Atizapán; segunda corrida sin duplicados. Re-domicilio:
un superadmin preexistente en la org `alpha` con membresía en su campaña queda como ADMIN de
`atizapan` sin membresías ajenas y con la misma contraseña; un usuario ya en `atizapan` no cambia;
sin `SEED_DEMO_ATIZAPAN_ADMIN_EMAIL` no se toca a nadie. Aislamiento: con Lucy (org `alpha`) y
Arturo (org `atizapan`), `GET /registros` y `GET /campaigns/mine` de cada uno no ven nada del
otro. Reutiliza `monkeypatch.setenv` como `test_demo_seed.py`.

## 7. AZ-4 · Operación sintética

### 7.1 Seed `backend/app/seeds/demo_atizapan_operacion.py` — `seed_atizapan_operacion(db)`

Mismo gate que §6.1. Corre justo después y **una sola vez**: si existe algún `Registro` de la
campaña con `promotor == "demo-seed"`, termina sin hacer nada (marcador). Generador determinista:
`random.Random(15013)`; nombres, colonias y textos desde listas internas; sin dependencias nuevas
(no `faker`). También expuesto como CLI `scripts/seed_atizapan_operacion.py [--reset]` para local;
`--reset` borra solo las filas marcadas como demo de esa campaña.

Inserta ORM directo (no pasa por los routers) para poder fijar `created_at`. Reusa la lógica
existente donde hay reglas: `crypto.encrypt_clave` / `mask_clave`, `privacy_service.get_active_notice`
(consentimiento con `aviso_version` real), `militante_service._next_folio` y `caso_service._next_folio`.

| Entidad | Volumen | Reglas de generación |
|---|---|---|
| `Registro` (promovidos) | 6,000 | Por sección, proporcional a `lista_nominal` con peso ×1.6 en COMPETITIVA/ALTA_PERSUADIBLE y ×0.6 en DEFENDER_EXPANDIR. `activista_id` = activista de la zona (round-robin); `promotor = "demo-seed"`; `created_at` uniforme en las últimas 12 semanas, **excepto** las zonas 3 y 7, que capturan 0 en la última semana ISO completa (dispara O2 y O4). Clave de elector ficticia con formato INE (18 caracteres, prefijo de apellidos + fecha + entidad 15 + sexo + consecutivo), única, cifrada; `clave_masked` como en producción. `sexo`, `edad` (18–85), `colonia` de una lista de 30 colonias reales de Atizapán, `telefono` con prefijo 55 ficticio. |
| `Militante` | 1,200 | 20 % de los promovidos (mismo nombre y sección), folio con `_next_folio`, `estado` 70 % VALIDADO / 25 % REGISTRADO / 5 % OBSERVADO, `fecha_afiliacion` = `created_at`, CURP ficticia cifrada, `consentimiento` y `manifestacion_voluntad` true. |
| `Caso` + `CasoEvento` | 60 | Tipos PETICION/QUEJA/APOYO/OTRO; títulos de una lista (agua, bacheo, alumbrado, seguridad…); `seccion` y `colonia` reales; `asignado_a` = líder de la zona; 40 % con `fecha_compromiso` vencida y `estado` PENDIENTE/EN_PROCESO (dispara O3), 35 % ATENDIDO/CERRADO, resto en curso. Un `CasoEvento` de creación por caso. |
| `Minuta` + `Acuerdo` | 12 / 40 | Una minuta semanal de coordinación (12 semanas), `estado = PUBLICADA`, asistentes = coordinador + líderes; 3–4 acuerdos por minuta con `responsable_id` líder; 25 % con `fecha_limite` vencida y `estado` PENDIENTE (dispara O5). |
| `AgendaItem` | 30 | 10 por fase (30/60/90), 40 % `done`. |
| `SeccionPlan` | 174 | `responsable_id` = líder de la zona, `meta_semanal` = `suggest_meta(prioridad)`, `problema_dominante` de una lista, `prioridad_operativa` = prioridad electoral. |

Con estos volúmenes y 12 semanas, el avance por sección (`capturados / meta`) queda mezclado:
parte de las secciones en verde y una minoría persuadible en rojo (dispara T1 y O1). T2 se evalúa
con 174 secciones (≥ 5).

### 7.2 Lo que **no** se genera

Sprints/WorkItems (Scrum), FormDefinition/FormResponse (formularios), evidencias (archivos),
ArcoRequest. Los módulos correspondientes se muestran vacíos o con lo que ya existe.

### 7.3 Pruebas

`tests/test_demo_atizapan_operacion.py` (SQLite, campaña sembrada por §6):
- Volúmenes exactos por entidad; segunda corrida no duplica (marcador).
- Ninguna clave de elector repetida; todas cifradas y con `clave_masked` de la longitud correcta.
- Todos los registros tienen `seccion` de Atizapán y `activista_id` de la campaña; cero filas en
  la campaña de SMA (aislamiento).
- Existen casos con SLA vencido, acuerdos vencidos y activistas sin capturas en 7 días (precondiciones de Alertas).
- `--reset` elimina solo lo marcado.

## 8. AZ-5 · Alertas

Se ejecuta el plan `docs/superpowers/plans/2026-09-27-alertas-centro-unificado.md` sin
modificaciones de alcance. Único ajuste derivado de esta spec: T2 y la cuadrícula usan
`list_planes`, que ya queda filtrado por municipio (§5.3), así que no requiere cambio. Al terminar,
smoke manual en dev con la campaña de Atizapán: deben existir alertas de las 7 reglas.

## 9. Orden de ejecución y despliegue

1. AZ-1 (script + CSV commiteados) y AZ-2 (migración, registro, alcance, panorama, frontend) en
   paralelo; AZ-2 no depende de los datos.
2. AZ-3, luego AZ-4, luego AZ-5.
3. PROD (Railway, servicio `Agora`): añadir `SEED_DEMO_ATIZAPAN=true`,
   `SEED_DEMO_ATIZAPAN_PASSWORD` y `SEED_DEMO_ATIZAPAN_ADMIN_EMAIL=arturo@atlastech.mx`;
   `SEED_DEMO_TERRITORY=true` ya está. El deploy corre la migración y los seeds en el arranque.
   Verificación: Arturo entra y `GET /campaigns/mine` muestra **solo** la campaña de Atizapán con
   candidato; `GET /municipio/region` devuelve 7 municipios; `GET /municipio/15013/panorama`
   devuelve 174 secciones; Lucy sigue viendo 22 en `/municipio`, su región solo con SMA, y lo mismo
   en el plan territorial; ECG (superadmin) ve ambas orgs.
4. Guion de demo: actualizar `docs/demo-captura-a-lucy.md` o crear `docs/demo-atizapan.md` **sin
   contraseñas en claro**.

## 10. Riesgos

- **Semántica propio/rival invertida respecto al nombre de las columnas** (`coalicion` = propio).
  Se documenta en `municipios.py` y en el manifest; las etiquetas visibles vienen del registro.
- **Primer arranque con seed operativo** (~8,000 filas cifradas) y **territorio regional**
  (~2,900 filas): unos segundos; en `try/except` para no bloquear el arranque. El marcador evita
  repetir el operativo; el territorial es idempotente por lookup.
- **Re-domicilio de Arturo** es irreversible por seed: si el env var apunta a un correo equivocado,
  se movería a ese usuario. Mitigación: el seed solo mueve usuarios cuyo correo coincide exacto y
  registra `audit_log`; verificar el env var antes del deploy.
- **CONEVAL** puede no descargarse: se omiten esos indicadores y el panorama muestra "—".
- **Colisión de secciones** si algún día se carga otro estado: la unicidad `(seccion, anio)` es
  estatal. Fuera de alcance; se anota para SP-1.
- **Datos delgados en Alertas para SMA** se mantienen (spec de Alertas §6); la demo de Alertas se
  hace sobre Atizapán.
