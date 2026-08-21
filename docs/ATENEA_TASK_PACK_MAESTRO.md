# TASK PACK MAESTRO DE DESARROLLO

> Recibido del usuario el 2026-08-20 (transcripción fiel; formato compactado).
> Descomposición acordada del programa: SP-0 superadmin/RBAC → SP-1 modelo territorial →
> SP-2 analytics engine → SP-3 intelligence API + territory detail → SP-4 GIS →
> SP-5 command center/compare/watchlist → SP-6 ingestion framework.
> Archivos de contexto analizados en `docs/analysis/2026-08-20-*.md`.

## ATENEA · Territorial & Political Intelligence Platform
### Estado de México / Centro de México · 2026–2027

---

## 00 · Contexto

ATENEA es la capa de inteligencia política, electoral, territorial, GIS y de gobernanza
del ecosistema ORION de Atlas Tech. La tarea NO es crear otro dashboard genérico: es
evolucionar el repositorio existente hasta una **Territorial Intelligence Platform**
capaz de integrar, normalizar, visualizar, comparar y explicar datos territoriales,
electorales, políticos, demográficos, económicos e institucionales. Debe poder pasar de
REGIÓN → sistema metropolitano → corredor → municipio/alcaldía → colonia → sección
electoral → casilla sin romper el modelo de información.

## 01 · Archivos de contexto

1. **ATENEA/ORION Deep Data** (deck Data Heavy): modelo conceptual, territorios, GIS,
   corredores, gobiernos, datos electorales, ontología. → `docs/analysis/2026-08-20-deck-data-heavy-domain-spec.md`
2. **EDOMEX Alcaldías · Massive Caller · Agosto 2026**: polling, intención de voto,
   tracking, candidatos, indecisos, metadata, series. → `docs/analysis/2026-08-20-massive-caller-ago2026-data-spec.md`
3. **ATENEA Edomex 2027 Data Heavy**: insights, métricas, hipótesis, profundidad
   Atizapán/Tlalnepantla, storytelling. Los PDFs/PPTX son documentos de dominio y
   datasets de referencia, no layouts a copiar.

## 02 · Principio fundamental

No `PDF → cards → gráficas`. Sí:
`SOURCE → INGESTION → NORMALIZATION → ONTOLOGY → ANALYTICS → API → GIS → VISUALIZATION → INTELLIGENCE`.
ATENEA debe tener un verdadero **data engine** detrás de la interfaz.

## 03 · North Star

Responder en segundos: **¿Qué está ocurriendo en este territorio, cómo llegó a esta
situación, qué variables lo explican y cómo se compara con territorios equivalentes?**
Ej.: seleccionar Atizapán → población, lista nominal, gobierno, partido, elecciones
anteriores, resultado 2024, margen, turnout, intención 2027, tracking, indecisos,
candidatos, tendencia, volatilidad, corredor, municipios relacionados, rankings,
fuentes, nivel de confianza, alertas analíticas.

## 04 · Principios de producto

- **API FIRST** — la interfaz nunca es la fuente de verdad.
- **TERRITORY FIRST** — la entidad primaria es `territory`; todo se relaciona con una.
- **TIME AWARE** — todo dato político/electoral con dimensión temporal; nunca
  sobrescribir silenciosamente un estado anterior.
- **SOURCE AWARE** — todo dato conoce fuente, fecha, fecha de captura, URL/documento,
  metodología, nivel de confianza.
- **EXPLAINABLE** — todo indicador derivado explica inputs, fórmula, fecha, fuente, versión.
- **NEUTRAL BY DESIGN** — sin conceptos partidistas (territorio ganable/enemigo, votante
  objetivo, persuadible, conquista, operación electoral). Usar: competitiveness,
  volatility, uncertainty, strategic relevance, current signal, historical result,
  polling gap, analytical priority.

## 05 · Stack

Si el repo ya tiene arquitectura funcional equivalente, NO migrar. Backend: Python 3.11+,
FastAPI, SQLAlchemy 2.x, Pydantic v2, Alembic, PostgreSQL + **PostGIS**. Frontend:
React 18+, TypeScript, Vite, React Router, TanStack Query, TanStack Table, Zustand.
GIS: **MapLibre GL JS** + deck.gl para capas masivas; Turf.js para operaciones simples;
geometría y consultas espaciales importantes en PostGIS.

## 06 · No hardcodear data

Prohibido colocar datos en componentes. Todo por API; incluso la demo consume
fixtures/seeds desde backend.

## 07–08 · Ontología territorial + Territory model

Entidad central `Territory`. Tipos: STATE, METROPOLITAN_SYSTEM, MUNICIPALITY, BOROUGH,
CORRIDOR, COLONY, ELECTORAL_SECTION, POLLING_STATION. Campos mínimos: id, cvegeo, name,
slug, territory_type, parent_id, state_code, municipality_code, geometry (PostGIS),
centroid, area_km2, population, population_year, metadata, created_at, updated_at.

## 09 · Territorial relations

`territory_relationships` — ej.: Atizapán MEMBER_OF Valle de México; Atizapán MEMBER_OF
Poniente Metropolitano; Atizapán NEIGHBOR_OF Tlalnepantla; Lerma MEMBER_OF Corredor
México–Toluca. Base para grafos futuros.

## 10–11 · Parties + Government

`political_parties`: id, name, short_name, official_name, color, logo_url, active,
metadata (color partidista nunca como color principal de la plataforma).
`government_terms`: id, territory_id, holder_name, office, party_id, coalition_id,
start_date, end_date, status, source_id, metadata. Consultas: current government +
government history.

## 12–14 · Elections / results / metrics

`elections`: id, election_type, jurisdiction, election_date, year, status, source_id.
`election_results`: id, election_id, territory_id, party_id, coalition_id, candidate_id,
votes, vote_share, rank, winner.
`electoral_metrics` (separadas): registered_voters, nominal_list, votes_cast, turnout,
winning_margin_votes, winning_margin_pp, invalid_votes.

## 15–18 · Polling (dominio propio, no columnas en territory)

`polls`: id, pollster, publication_date, fieldwork_date, sample_size, margin_of_error,
methodology, geography_type, source_id, metadata.
`poll_questions` (ej. "Si hoy fueran las elecciones, ¿por cuál partido votaría?").
`poll_options`: PARTY, CANDIDATE, YES_NO, OTHER, UNDECIDED.
`poll_observations`: poll_id, question_id, territory_id, option_id, value, rank,
observation_date — series sin columnas por mes.

## 19–20 · Actors + candidate preferences

`political_actors` (no solo candidatos): id, full_name, actor_type, party_id,
current_position, territory_id, metadata. Tipos: CANDIDATE, OFFICIAL, PARTY_LEADER,
LEGISLATOR, PUBLIC_ACTOR, ORGANIZATION, MEDIA. Internas conectan poll+question+actor+
territory+party+date+value → concentración y fragmentación.

## 21 · Corridors

`territorial_corridors` (México–Toluca, Poniente Metropolitano, Oriente Metropolitano,
AIFA, Norte Industrial, Tula–Tepeji, Toluca–Tenango…). Un territorio puede pertenecer a
varios.

## 22–24 · Sources / snapshots / provenance

`sources`: id, name, organization, source_type (OFFICIAL, POLLING, OPEN_DATA, MEDIA,
INTERNAL, DERIVED), url, document_name, published_at, retrieved_at, reliability_level,
metadata. `source_snapshots` (¿con qué corte se calculó este dashboard?). Cada dato
crítico debe poder regresar hasta una fuente (ej. UI: 33.8 % MORENA Atizapán → Massive
Caller, 13 Aug 2026, n=600, M.E. ±4.3).

## 25–35 · Indicators / engine / calidad

`indicators` + `indicator_values` (no columnas permanentes en territory). Indicador:
id, code, name, description, methodology, version, unit, min/max. Valor: indicator_id,
territory_id, period, value, confidence, calculated_at, inputs_snapshot.
Primeros: POLLING GAP (1º−2º), HISTORICAL ELECTORAL MARGIN, UNDECIDED RATE, UNDECIDED
ELECTORATE ESTIMATE (nominal_list × undecided_rate, marcado `ESTIMATE`).
**TECHNICAL TIE**: `polling_gap <= margin_of_error` → status TECHNICAL_TIE, no afirmar
ganador (Atizapán: 33.8 vs 33.4, gap 0.4, M.E. ±4.3). MOMENTUM: latest vs previous vs
3-period trailing (no sobreinterpretar 0.1 pp). VOLATILITY: range, std dev, movimiento
entre observaciones, con metodología y versión. CANDIDATE CONCENTRATION: leader share,
gap 1º-2º, undecided, count — sin "score científico" arbitrario (`EXPERIMENTAL MODEL`
si está en investigación). **TPS** configurable: `score_models`, `score_model_versions`,
`score_components`; sin ponderaciones hardcodeadas en frontend; versionado (TPS V1,
V1.1, V2 — cada valor sabe su versión). Data quality: completeness, freshness,
reliability, granularity, temporal coverage; DATA CONFIDENCE HIGH/MEDIUM/LOW mostrado
independiente del resultado analítico.

## 36–46 · Backend / API

Módulos: api, core, db, models, schemas, repositories, services, analytics, gis,
ingestion, intelligence, sources, tests. Separar CRUD / business logic / analytics.
`analytics/`: electoral.py, polling.py, momentum.py, volatility.py, competitiveness.py,
candidate_concentration.py, territory_priority.py — funciones puras, alta cobertura.
Prefijo `/api/v1`. Territories API: GET /territories, /{id}, /{id}/summary,
/{id}/neighbors, /{id}/children, /{id}/geometry, /{id}/sources.
**`GET /territories/{id}/intelligence`** — vista agregada (territory, government,
demographics, electoral, polling, candidates, indicators, corridors, signals,
data_quality, sources): el frontend no necesita 15 llamadas para la ficha.
Polling API: /polls, /polls/{id}, /territories/{id}/polls|polling-trend|candidate-preferences.
Electoral API: /territories/{id}/elections|electoral-history, /elections/{id}/results.
Analytics API: /analytics/competitiveness|volatility|undecided|momentum|watchlist|rankings
(filtros: state, metro, corridor, party, year, population, electoral_weight).
`POST /analytics/compare` {territory_ids, metrics, period} — sin lógica específica por
municipio. GIS API: /geo/territories(/{id}), /geo/corridors, /geo/layers (bbox, zoom,
territory_type, corridor, metric). GeoJSON estándar; niveles de simplificación.

## 47–75 · Frontend

Vistas: 01 Command Center (/) · 02 Territory Explorer (/territories) · 03 Map
Intelligence · 04 Electoral Intelligence · 05 Polling · 06 Candidates/Actors ·
07 Compare (/compare, 2–5 territorios) · 08 Watchlist (/watchlist) · 09 Sources/Data
Quality (/sources) · 10 Admin/Ingestion (/admin/data).
Mapa como elemento central (no card wall): polígonos, corredores, labels, hover,
selection, zoom, filtros, metric layer. Choropleth modes: political control, population,
nominal list, turnout, 2024 margin, 2026 polling gap, undecided, volatility, priority
score, data completeness — leyenda actualizada por layer, sin rangos arbitrarios.
Hover → territorio/métrica/gobierno/última encuesta; click → Territory Intelligence
Panel. Territory Explorer: tabla avanzada con columnas configurables; filtros
persistentes (state, metro, corridor, population, nominal list, party, competition,
volatility, polling/candidate availability, data completeness).
`/territories/:slug` (fundamental): header + hero (population, nominal list, turnout,
government, 2024 margin, current poll gap, undecided, status — jerarquía, no 12 cards).
Tabs: Overview, Elections, Polling, Candidates, Territory, Economy, Infrastructure,
Actors, Sources — tabs sin datos: `DATA NOT YET INTEGRATED`, no inventar contenido.
Election history 2015–2024 (winner, share, turnout, margin, votes). Polling view:
snapshot, tracking, trend, undecided, technical-tie, metadata; **M.E. visualmente
presente** ("Sample 600 · Reported M.E. ±4.3 pp"), no enterrado en tooltip.
Candidate view por partido: leader, 2º, gap, undecided, otros, tracking, concentración.
Deep dives Atizapán y Tlalnepantla vía `TerritoryDetailPage` genérico (NO AtizapanPage/
TlalnepantlaPage — los datos cambian, la arquitectura no). Cuando el dataset de agosto
esté cargado, Atizapán muestra: MORENA 33.8, PAN 33.4, GAP 0.4, UNDECIDED 13.8,
M.E. ±4.3 → TECHNICAL TIE. Comparison: dimensiones (population, nominal list, turnout,
2024 margin, polling gap, undecided, momentum, volatility, candidate concentration,
economic relevance, priority score, data confidence); normalización RAW / INDEXED 0–100 /
PERCENTILE, nunca mezclar escalas sin indicación. Watchlist automática con signals:
TECHNICAL_TIE, HIGH_VOLATILITY, HIGH_UNDECIDED, HIGH_ELECTORAL_WEIGHT,
INCUMBENCY_DIVERGENCE, CANDIDATE_FRAGMENTATION, DATA_STALE, NEW_POLL.
`signals`: territory_id, signal_type, severity, title, description, generated_at,
expires_at, source_snapshot. **Signal ≠ recommendation** (correcto: "Polling gap moved
from 8.2 pp to 2.4 pp"; incorrecto: "oportunidad para atacar"). Time controls: latest,
2026, 2024, 2021, 2018, 2015, custom (2024 Result ≠ 2026 Poll). Snapshot mode `AS OF`
(reconstruir estado conocido a una fecha). Source Explorer + **Data Lineage UI**: al
pulsar una cifra → drawer con source, poll, question, sample, M.E., imported timestamp.

## 76–86 · Ingestion / calidad / búsqueda / URLs / performance

`ingestion/`: base.py, csv.py, excel.py, geojson.py, polling.py, ieem.py, inegi.py
(arquitectura ahora, no todos los conectores). Pipeline: UPLOAD → PARSE → VALIDATE →
NORMALIZE → MATCH TERRITORY → PREVIEW → IMPORT → AUDIT → RECALCULATE INDICATORS.
Territory matching: CVEGEO preferente; fallback state+municipality+nombre canónico;
nunca solo texto libre. Duplicados: same source+territory+date+question+option.
Audit log: user, action, entity, old/new value, timestamp, source. Admin UI /admin/data:
upload, preview, validation errors, territory mapping, import, recalculate. Validación:
porcentajes >100, missing territory, duplicados, unknown party, missing publication
date, invalid geometry — impedir importación silenciosa incorrecta. Data quality UI:
coverage, freshness, missing layers, invalid records, unmapped territories.
Search global (territorios, actores, fuentes, corredores). URL state
(`/map?metric=undecided&corridor=poniente&year=2026`). Performance: server-side
filtering, query caching, geometry simplification, pagination, lazy loading.

## 87–94 · Componentes / diseño

`components/`: intelligence, maps, polling, electoral, territory, comparison,
indicators, data-quality, sources (no Card1/Card2/GraphAtizapan). Reutilizables:
Metric, MetricDelta, StatusBadge, IntelligenceSignal, SourceBadge, ConfidenceBadge,
Timeline, Ranking, TrendChart, ComparisonTable, TerritoryMap, PollSnapshot, PollTrend,
CandidateField, IndicatorBreakdown, DataLineageDrawer. Gráficas por configuración/data,
legibles, tooltips, responsive, accesibles. **Lenguaje ATENEA**: dark intelligence
interface, navy/near black, cyan analytical accent, amber secondary signal, alta
densidad de datos, fine borders, monospaced micro-labels, mínima decoración. No card
wall. Desktop first (1440/1280/1024), tablet usable, mobile consultation mode.
Accesibilidad AA, keyboard nav, color nunca único indicador. Colores partidistas solo
dentro de visualizaciones con significado; la UI mantiene branding ATENEA.

## 95–98 · AI layer (future ready)

`POST /intelligence/query` — la IA consulta base estructurada/analytics/sources, nunca
PDFs cuando existe dato estructurado. Grounded answers: answer + territories + metrics +
sources + calculation date. **La IA nunca inventa datos**: sin dato → `DATA NOT
AVAILABLE`, no estimar salvo solicitud explícita. `GET /territories/{id}/brief` (JSON
estructurado primero, luego PDF): executive snapshot, territory, government, election
history, polling, candidates, signals, indicators, sources.

## 99–107 · Testing / seguridad / datos

Backend: pytest, analytics unit tests, API tests, data validation, GIS tests. Frontend:
component tests, interacciones críticas, data/loading/error states. Test obligatorio:
Atizapán 33.8/33.4/M.E. 4.3 → gap 0.4, technical_tie=true. Roles VIEWER, ANALYST,
DATA_EDITOR, ADMIN según arquitectura existente. Multi-tenant: preservar; preparar
public datasets / private datasets / custom indicators / private watchlists por cliente.
Clasificación: PUBLIC, CLIENT_PRIVATE, ATLAS_INTERNAL. Observabilidad: logs
estructurados, request IDs, import IDs, analytics version. Migraciones siempre Alembic;
nunca DROP DATABASE. Seeds demo de Atizapán/Tlalnepantla + municipios adicionales con
provenance. **NO mezclar datos ficticios con reales**: fixtures ficticios llevan
`is_demo = true`.

## 108 · Primer milestone (ATENEA V1 Territorial Intelligence Core)

1 abrir ATENEA · 2 mapa Edomex · 3 seleccionar Atizapán · 4 ficha · 5 datos
territoriales · 6 2024 · 7 encuesta agosto 2026 · 8 tracking · 9 candidatos ·
10 technical tie · 11 comparar con Tlalnepantla · 12 abrir fuente de cada dato.

## 109–122 · Task packs

TP01 Repository audit (`/docs/ATENEA_REPO_AUDIT.md`: KEEP/REFACTOR/EXTEND/REMOVE/RISKS,
sin reescritura). TP02 Domain model (+ ER Mermaid en `/docs/ATENEA_DATA_MODEL.md`).
TP03 Data ingestion (CSV/JSON/GeoJSON/seed manual + validación). TP04 Analytics engine
(gap, technical tie, turnout, margin, undecided, undecided electorate, momentum,
volatility + tests). TP05 Intelligence API. TP06 GIS foundation (PostGIS, MapLibre,
polígonos, hover, selection, metric layer). TP07 Command Center (map + signals +
rankings + freshness). TP08 Territory Detail (Atizapán/Tlalnepantla). TP09 Polling
intelligence. TP10 Comparison engine. TP11 Source lineage (DataLineageDrawer).
TP12 Watchlist (reglas deterministas, sin AI). TP13 Data quality. TP14 UI polish
(solo después del data flow funcional).

## 123–142 · Criterios

**Definition of done**: data model + API + frontend + loading/empty/error states +
source + tests + responsive + documentation. Empty states honestos ("Data layer not
integrated yet. Expected sources: INEGI DENUE"), nunca gráficas falsas; 0 ≠ no
disponible. Terminología: Territorial/Electoral/Polling Intelligence, Governance,
Actors, Signals, Indicators, Sources, Data Quality, Watchlist, Compare, Territory
Record. Dominios futuros sin rediseñar el core: public issues, security, water,
mobility, infrastructure, budget, public works, media, social signals. **No
overengineer**: sin Kafka/microservicios/graph DB/vector DB/event sourcing/K8s;
modular monolith + PostgreSQL/PostGIS + FastAPI + React. Ontología futura en PostgreSQL
(no Neo4j prematuro). Performance: selección de territorio <500 ms cacheado, comparación
<1 s, mapa 60 fps, no recargar GeoJSON gigante. Documentación en `/docs/`:
ATENEA_ARCHITECTURE, ATENEA_DATA_MODEL, ATENEA_ANALYTICS, ATENEA_API, ATENEA_INGESTION,
ATENEA_UI, ATENEA_ROADMAP + README actualizado + `.env.example`. Deployment sencillo
(Railway). Enfoque iterativo: inspect → plan → implement → test → run → visual inspect →
document → commit-ready summary. Antes de codificar cada task: current architecture,
proposed changes, DB migrations, API impact, UI impact, risks, execution order; no pedir
confirmación para cambios pequeños reversibles; sí detenerse ante destructive migration,
auth redesign, framework migration, large rewrite. Prioridad: P0 correct data → P1
correct relationships → P2 correct analytics → P3 usable visualization → P4 premium
polish (nunca invertir). UX: "¿Qué está pasando?" → "¿Por qué?" → "¿Dónde profundizo?"
sin salir de ATENEA. Moonshot: consultas analíticas compuestas ("Valle de México, >350k
electores, margen histórico <5 pp, volatilidad al alza, >15 % indecisos, actividad
industrial") identificadas, filtradas, mapeadas, comparadas, explicadas y citadas.
Criterio final: no "un dashboard de elecciones" sino **ATENEA · Territorial Intelligence
Operating System** — territory is the index, time is first-class, sources traceable,
analytics explainable, maps native, AI grounded, intelligence reusable.

## Output esperado del programa completo

1 repository audit · 2 arquitectura propuesta · 3 ERD · 4 migrations · 5 endpoints ·
6 ingestion strategy · 7 analytics methodology · 8 UI routes · 9 Atizapán reference ·
10 Tlalnepantla reference · 11 comparison · 12 GIS · 13 test report · 14 known gaps ·
15 roadmap V1→V1.5→V2 · 16 screenshots · 17 archivos modificados · 18 deuda técnica.
Prioridad absoluta: **arquitectura reusable y escalable**, no demo hardcodeada de dos
municipios.
