# Especificación de dominio — Deck "ATENEA Edomex 2027 Data Heavy" (Tlalnepantla × Atizapán)

> Síntesis del deck de 40 páginas (`ATENEA_Edomex_2027_Data_Heavy_Hidratado_...v2.pdf/pptx`)
> como documento de dominio para el programa Territorial Intelligence. Analizado 2026-08-20.
> Universo: 100 territorios ATENEA; 14 municipios con señal de encuesta directa
> (fuente: Massive Caller 13-ago-2026, ver `2026-08-20-massive-caller-ago2026-data-spec.md`).

## Tipos de datos

1. **Intención de voto** partido × municipio × fecha (6 partidos + indecisos homologados).
2. **Lectura 1º vs 2º**: líder, %, segundo, %, gap pp, clase cualitativa
   (Empate técnico · Competitivo · Abierto por indecisos · Ventaja amplia · Dominante).
3. **Reelección Sí/No** (8 municipios; capa separada del voto por partido).
   Tlalnepantla es el único con mayoría Sí (52.7/47.3).
4. **Internas por partido**: aspirante líder, %, 2º, gap, indecisión interna + lectura
   ("consolidado" / "competitivo" / "alto ruido" / "sin orden interno").
5. **Estructura territorial**: 100 territorios; sistemas Valle de México (84 terr.,
   22.2M hab., 14 corredores) y Valle de Toluca (16 mun., 2.35M, 5 corredores) +
   Corredor México–Toluca (7 terr.). Jerarquía: región → municipio → sección → casilla
   → actor → problema público. Atizapán/Tlalnepantla = "corredor poniente".
6. **Gobierno 2026**: titular, bloque, periodo 2025–2027. Línea base: 74 territorios
   Morena/PT/PVEM, 19 PAN/PRI/PRD, 6 MC, 1 sin partido.
7. **Demografía/padrón**: población Censo 2020 (INEGI/COESPO), lista nominal 2024 (IEEM),
   secciones IEEM, distritos locales.
8. **Resultados 2024** (IEEM SIGE): coalición ganadora, votos 1º/2º, margen; ficha ideal
   con histórico 2015·2018·2021·2024 + participación.
9. **Contexto planeado no hidratado**: DENUE, seguridad, agua, obra, prensa.

## Indicadores derivados (definiciones del deck)

| Indicador | Definición |
|---|---|
| Gap | 1º − 2º en pp (partidos o aspirantes internos) |
| Empate técnico | gap ≤ 4.3 pp (= MOE). Gap 4.4–10 = "competitivo" |
| Territorio abierto | indecisos ≥ 15 % |
| ULI (Undecided Leverage) | base × % indecisos → volumen ("el dataset final debe usar lista nominal") |
| IRI (Incumbency Risk) | cruza reelección + intención + control actual + gap (sin fórmula cerrada) |
| CCI (Candidate Concentration) | gap interno + indecisión interna + volatilidad tracking |
| TPS v0.1 (Territorial Priority Score) | 0–100; "mide necesidad de análisis, no ventaja partidista". **OJO: dos versiones inconsistentes conviven** — ranking global (Naucalpan 75, Atizapán 73, Toluca 68…) vs "sugerido" por ficha (Atizapán 84, Tlalnepantla 79) con sets de componentes DISTINTOS por municipio → modelar componentes como pares nombre/valor versionados, nunca columnas fijas |
| ECI / PVI | competitividad / volatilidad, sin fórmula explícita |
| Derivados de tracking | pendiente 3M/6M, volatilidad, cruce de líneas, máx/mín, gap móvil, indecisos móviles, alerta de cambio |

Marco de calidad de fuentes A–E: A oficial validado (INE/IEEM/INEGI) · B encuesta
normalizada (con página y corte) · C indicador derivado (fórmula+input+versión) ·
D inferencia (lenguaje probabilístico) · E pendiente (backlog).

## Fichas de referencia

### Atizapán de Zaragoza — "bisagra del poniente, lectura abierta"
523,674 hab. · lista nominal ≈0.42M · 174 secciones · 7 localidades. Gobierno 2025–2027:
Pedro Rodríguez Villegas (PAN–PRI–PRD–NAEM). 2024: PAN–PRI–PRD–NAEM 142,093 vs 107,933 →
margen 34,160 ≈ 12.8 pp. Polling ago-26: gap 0.4 pp (33.8 vs 33.4) con MOE ±4.3 →
**EMPATE TÉCNICO** (MOE 10.7× la brecha); indecisos 13.8 % ≈ 58k ponderados.
Componentes TPS: competitividad 96 · volatilidad 82 · peso electoral 76 · indecisión 72 ·
fragmentación interna 78 · corredor 68 → TPS sugerido 84.

### Tlalnepantla de Baz — "grande, industrial, electoralmente denso"
672,202 hab. · lista nominal ≈0.57M · 302 secciones · distritos locales 18 y 37.
Gobierno: Raciel Pérez Cruz (PVEM–PT–Morena). 2024: PVEM–PT–Morena +5.92 pp.
Polling ago-26: Morena 44.6, gap 26.3 pp → ventaja robusta; reelección 52.7 Sí / 47.3 No
("continuidad mayoritaria pero no dominante"); indecisos ≈46k.
Componentes TPS: competitividad 34 · ventaja partidista 88 · peso electoral 86 ·
indecisión 48 · tensión incumbencia 65 · relevancia económica 90 → TPS sugerido 79.
(Los nombres de componentes difieren entre fichas — el set no es fijo.)

## Modelo de datos propuesto por el propio deck (p.24, p.40)

`territory` (cvegeo, nombre, sistema, corredor) · `government` (titular, partido, periodo,
incumbencia) · `poll_snapshot` (fecha, partido, %, moe, n) · `candidate_snapshot`
(partido, aspirante, %, tracking) · `metric` (ECI/PVI/ULI/IRI/CCI/TPS 0–100) · `source`
(archivo, página, método, corte, confianza). Más: MunicipalPollingSnapshot,
CandidatePreferenceSnapshot, IncumbencySignal, TechnicalTieFlag,
WeightedUndecidedEstimate, TerritorialPriorityScore. Capas: 01 Territory master (CVEGEO,
polígono) · 02 Government · 03 Electoral history · 04 Polling · 05 Derived intelligence ·
06 Outputs.

## Pantallas "ATENEA OS" sugeridas (p.26)

Territory Explorer (mapa, filtros, corredores) · Polling Monitor · Candidate Graph ·
Priority Radar · Incumbency Layer · Brief Generator (PDF municipal) · API/Data Room ·
Alerts.

## Observaciones de modelado

(a) TPS con componentes versionados nombre/valor, no columnas. (b) "Indecisos" existe en
3 niveles: partido, interno por partido, y ponderado a volumen. (c) Reelección solo 8/14
municipios; internas solo algunas combinaciones municipio×partido → todo es
sparse/snapshot con corte. (d) "Krishna Romero" vs "Krisha Romero Velázquez" confirma
necesidad de normalización de actores. (e) Regla dura: gap < MOE se etiqueta empate
técnico, nunca se afirma ganador. (f) Neutral by design: competitividad/volatilidad/
incertidumbre, jamás "territorio ganable/enemigo".
