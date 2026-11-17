# INE México — Integraciones de datos

> **Histórico (2026-11):** el router `/api/sources/*`, el CLI `scripts/ingest_ine.py`
> y los clientes `ckan`/`candidaturas`/`padron`/`prep` se eliminaron (app SMA-only).
> Solo quedan `integrations/ine/{base,config,cartografia}.py` (usados por `/api/maps/*`
> y `/api/analytics/overview`).

Ágora consume múltiples fuentes del **Instituto Nacional Electoral (INE)** y de
datos abiertos relacionados. La capa vive en `backend/app/integrations/ine/` y se
expone vía `/api/sources/*` y `/api/maps/*`, con ingesta a PostGIS por CLI.

## Fuentes soportadas

| id                | Tipo     | Qué da | Cómo se consume |
|-------------------|----------|--------|-----------------|
| `datos_gob_ckan`  | API JSON | Padrón, lista nominal, catálogos | CKAN action API |
| `candidaturas_mx` | API JSON | Candidaturas, partidos, geografía (Popolo) | REST sin auth |
| `sige_cartografia`| WMS/GeoJSON | Entidades, distritos, municipios, secciones | WMS + ingesta GeoJSON |
| `prep`            | Descarga | Resultados preliminares (casilla→estado) | ZIP + CSV `|` |
| `computos`        | Descarga | Resultados definitivos | ZIP + CSV `|` |

## Módulos

- `config.py` — URLs base (overridable por env), mapeo de niveles, registro `SOURCES`.
- `base.py` — cliente httpx con timeouts y reintentos.
- `ckan.py` — `package_search`, `package_show`, `datastore_search`, descarga de recursos.
- `candidaturas.py` — colecciones Popolo (personas, organizaciones, áreas, cargos).
- `cartografia.py` — descriptores WMS para MapLibre + `fetch_geojson` para ingesta.
- `prep.py` — descarga ZIP, extrae CSV, parsea saltando metadatos.
- `padron.py` — recursos de Padrón/Lista Nominal vía CKAN.

## Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/sources` | Registro de fuentes consumibles |
| GET | `/api/sources/datasets?q=&ine_only=` | Búsqueda en CKAN (datos.gob.mx) |
| GET | `/api/sources/padron/resources` | Recursos de Padrón/Lista Nominal |
| GET | `/api/sources/candidaturas/{collection}` | Candidaturas MX (areas/persons/…) |
| GET | `/api/maps/wms-layers` | Capas WMS del SIGE para el mapa |

Todos requieren autenticación.

## Ingesta a PostGIS (CLI)

```bash
python scripts/ingest_ine.py catalog
python scripts/ingest_ine.py datasets --q "lista nominal"
python scripts/ingest_ine.py cartografia --org atlas \
    --level distrito_federal --url https://.../distritos.geojson \
    --name-prop NOMBRE --code-prop CLAVE
python scripts/ingest_ine.py candidaturas --collection areas
python scripts/ingest_ine.py prep --url https://.../resultados.zip --limit 5
```

La cartografía se carga en `electoral_areas` (tenant-scoped) con geometría
PostGIS vía `ST_GeomFromGeoJSON` (SRID 4326) y queda disponible en
`GET /api/maps/areas`.

## Variables de entorno (opcionales)

```
INE_CKAN_BASE_URL=https://datos.gob.mx/api/3/action
INE_CANDIDATURAS_BASE_URL=https://www.apielectoral.mx
INE_SIGE_WMS_URL=                # requerido para capas WMS; confirmar GetCapabilities
INE_HTTP_TIMEOUT=30
INE_HTTP_RETRIES=3
```

## Advertencias

- **WMS del SIGE:** los nombres de capa son tentativos hasta confirmar el
  `GetCapabilities` real; configurar `INE_SIGE_WMS_URL`. Algunos productos
  vectoriales requieren **solicitud de acceso** al INE.
- **PREP:** el sitio puede bloquear bots; usar la URL del ZIP oficial por proceso.
- **Candidaturas MX:** datos del proceso 2021 (verificar vigencia); las rutas
  Popolo son configurables por env.
- **Licencias:** revisar Términos de Libre Uso MX / INE antes de redistribuir.
