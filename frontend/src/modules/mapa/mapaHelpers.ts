// Pure helpers for the SMA map: normalization, % math, color scales,
// legends, región grouping and label placement. No React / MapLibre here so
// everything is unit-testable in node.
import type { Geometry, Position } from "geojson";

import type { MapaCollection, MapaFeature, MapaTotales } from "@/api/mapa";

export type ColorMode = "region" | "prioridad" | "avance" | "resultado";
export type ThemeName = "light" | "dark";

/** Campaign-wide 2027 targets (spec §3) — used if the API omits `totales`. */
export const METAS_DEFAULT = { lideres: 400, activistas: 4000, promovidos: 28000 } as const;

export interface Resultado2024 {
  listaNominal: number | null;
  votos: number | null;
  participacion: number | null;
  coalicion: number | null;
  morena: number | null;
  margen: number | null;
  etiqueta: string | null;
}

export interface SeccionMapa {
  /** Index in the collection — used as the MapLibre feature id. */
  id: number;
  /** Display key, e.g. "4121" or "6673/6674". */
  seccion: string;
  secciones: string[];
  barrio: string | null;
  region: string | null;
  prioridad: string | null;
  lnMay25: number | null;
  proy2027: number | null;
  meta: { lideres: number; activistas: number; promovidos: number };
  avance: { lideres: number; activistas: number; promovidos: number; viejos: number };
  r2024: Resultado2024 | null;
  nota: string | null;
  geometry: Geometry | null;
}

export interface Totales {
  meta: { lideres: number; activistas: number; promovidos: number };
  avance: { lideres: number; activistas: number; promovidos: number; viejos: number };
}

// ── normalization ────────────────────────────────────────────────────────

const n = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const z = (v: unknown): number => n(v) ?? 0;
const s = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

export function normalizeSeccion(f: MapaFeature, id: number): SeccionMapa {
  const p = f.properties ?? {};
  const seccion = s(p.seccion) ?? `#${id + 1}`;
  const r = p.resultado_2024;
  const flat2024 = p.lista_nominal != null || p.votos != null || p.margen != null;
  const src = r ?? (flat2024 ? p : null);
  const coalicion = src ? n(src.coalicion) : null;
  const morena = src ? n(src.morena) : null;
  const a = p.avance ?? p;
  return {
    id,
    seccion,
    secciones: p.secciones?.length ? p.secciones.map(String) : seccion.split("/"),
    barrio: s(p.barrio),
    region: s(p.region),
    prioridad: s(p.prioridad),
    lnMay25: n(p.ln_may25),
    proy2027: n(p.proy_2027),
    meta: {
      lideres: z(p.meta_lideres),
      activistas: z(p.meta_activistas),
      promovidos: z(p.meta_promovidos),
    },
    avance: {
      lideres: z(a.lideres),
      activistas: z(a.activistas),
      promovidos: z(a.promovidos),
      viejos: z(a.viejos),
    },
    r2024: src
      ? {
          listaNominal: n(src.lista_nominal),
          votos: n(src.votos),
          participacion: n(src.participacion),
          coalicion,
          morena,
          margen:
            n(src.margen) ??
            (coalicion !== null && morena !== null ? coalicion - morena : null),
          etiqueta: s(r ? r.etiqueta : p.prioridad_2024),
        }
      : null,
    nota: s(p.nota),
    geometry: f.geometry ?? null,
  };
}

export function normalizeCollection(fc: MapaCollection | null | undefined): SeccionMapa[] {
  return (fc?.features ?? []).map(normalizeSeccion);
}

/** Totals from the API, falling back to summing the features. */
export function computeTotales(secciones: SeccionMapa[], api?: MapaTotales | null): Totales {
  const sum = (pick: (x: SeccionMapa) => number) =>
    secciones.reduce((acc, x) => acc + pick(x), 0);
  const metaOr = (v: unknown, summed: number, dflt: number) =>
    n(v) ?? (summed > 0 ? summed : dflt);
  return {
    meta: {
      lideres: metaOr(api?.meta_lideres, sum((x) => x.meta.lideres), METAS_DEFAULT.lideres),
      activistas: metaOr(api?.meta_activistas, sum((x) => x.meta.activistas), METAS_DEFAULT.activistas),
      promovidos: metaOr(api?.meta_promovidos, sum((x) => x.meta.promovidos), METAS_DEFAULT.promovidos),
    },
    avance: {
      lideres: n(api?.lideres) ?? sum((x) => x.avance.lideres),
      activistas: n(api?.activistas) ?? sum((x) => x.avance.activistas),
      promovidos: n(api?.promovidos) ?? sum((x) => x.avance.promovidos),
      viejos: n(api?.viejos) ?? sum((x) => x.avance.viejos),
    },
  };
}

// ── percentages ──────────────────────────────────────────────────────────

/** value / meta × 100 (unclamped, may exceed 100). `null` when there is no meta. */
export function pctOf(value: number, meta: number): number | null {
  if (!Number.isFinite(meta) || meta <= 0) return null;
  return (Math.max(0, value) / meta) * 100;
}

/** Percentage for bar widths: 0–100. */
export function barWidth(value: number, meta: number): number {
  const p = pctOf(value, meta);
  return p === null ? 0 : Math.min(100, p);
}

/** Human percentage: "0 %", "0.4 %", "12 %", "100 %". */
export function formatPct(p: number | null): string {
  if (p === null) return "—";
  if (p > 0 && p < 1) return `${p.toFixed(1)} %`;
  return `${Math.floor(p)} %`;
}

/** 2024 margin in percentage points of votes cast (coalición − morena). */
export function margenPp(r: Resultado2024 | null): number | null {
  if (!r || r.margen === null || !r.votos) return null;
  return (r.margen / r.votos) * 100;
}

// ── formatting ───────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat("es-MX");
export const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : nf.format(v);

/** "SAN NICOLÁS / SANTIAGO" → "San Nicolás / Santiago". */
export function titleCase(v: string | null): string {
  if (!v) return "—";
  return v
    .toLocaleLowerCase("es-MX")
    .replace(/(^|[\s/(-])(\p{L})/gu, (_, pre: string, c: string) => pre + c.toLocaleUpperCase("es-MX"));
}

export function formatHace(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 10) return "hace un momento";
  if (sec < 60) return `hace ${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

// ── color scales ─────────────────────────────────────────────────────────
// Region: validated categorical palette (dataviz reference instance, slots
// 1–7, fixed order — color follows the región, never its rank). Seven hues on
// a choropleth can't all be told apart under CVD, so every polygon also wears
// a direct label (región code) and the table repeats it: never color alone.

export const REGIONES = ["R-1", "R-2", "R-3", "R-4", "R-5", "R-6", "R-7"] as const;

const REGION_COLORS: Record<ThemeName, string[]> = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"],
};

// Prioridad: ordinal, single hue (orange). P1 = strongest step. On dark the
// strongest step is the brightest so it still pops off the dark basemap.
const PRIORIDAD_COLORS: Record<ThemeName, Record<string, string>> = {
  light: { P1: "#a8420f", P2: "#e0662f", P3: "#f5a06e", P4: "#fbd3b8" },
  dark: { P1: "#ff8a4c", P2: "#d95926", P3: "#9a4a20", P4: "#5c3420" },
};

// Avance vs meta: sequential, single hue (blue), six stepped bins.
export const AVANCE_BINS = [10, 25, 50, 75, 100] as const;
const AVANCE_COLORS: Record<ThemeName, string[]> = {
  light: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#104281"],
  dark: ["#1a2f4a", "#1c4a80", "#1c5cab", "#2a78d6", "#5598e7", "#9ec5f4"],
};

// Resultado 2024: diverging on margen (pp). Blue = coalición (bloque propio)
// ahead, red = Morena ahead, neutral gray midpoint = empate técnico (±2 pp).
export const RESULTADO_BINS = [-10, -5, -2, 2, 5, 10] as const;
const RESULTADO_COLORS: Record<ThemeName, string[]> = {
  light: ["#b02a2a", "#e66767", "#f4b1ae", "#e1e0d9", "#9ec5f4", "#5598e7", "#1c5cab"],
  dark: ["#ff7b7a", "#c24c4b", "#6e3332", "#4a4a46", "#24446e", "#2a78d6", "#86b6ef"],
};

const NEUTRAL: Record<ThemeName, string> = { light: "#c3c2b7", dark: "#55534e" };

export function regionIndex(region: string | null): number {
  if (!region) return -1;
  const m = /(\d+)/.exec(region);
  if (!m) return -1;
  const i = Number(m[1]) - 1;
  return i >= 0 && i < REGIONES.length ? i : -1;
}

export function avanceBin(p: number | null): number {
  if (p === null) return -1;
  let i = 0;
  while (i < AVANCE_BINS.length && p >= AVANCE_BINS[i]) i++;
  return i;
}

export function resultadoBin(pp: number | null): number {
  if (pp === null) return -1;
  // Bins: (-∞,-10) [-10,-5) [-5,-2) [-2,2] (2,5] (5,10] (10,∞)
  if (pp < -10) return 0;
  if (pp < -5) return 1;
  if (pp < -2) return 2;
  if (pp <= 2) return 3;
  if (pp <= 5) return 4;
  if (pp <= 10) return 5;
  return 6;
}

export function colorFor(mode: ColorMode, x: SeccionMapa, theme: ThemeName): string {
  switch (mode) {
    case "region": {
      const i = regionIndex(x.region);
      return i < 0 ? NEUTRAL[theme] : REGION_COLORS[theme][i];
    }
    case "prioridad":
      return PRIORIDAD_COLORS[theme][x.prioridad ?? ""] ?? NEUTRAL[theme];
    case "avance": {
      const b = avanceBin(pctOf(x.avance.promovidos, x.meta.promovidos));
      return b < 0 ? NEUTRAL[theme] : AVANCE_COLORS[theme][b];
    }
    case "resultado": {
      const b = resultadoBin(margenPp(x.r2024));
      return b < 0 ? NEUTRAL[theme] : RESULTADO_COLORS[theme][b];
    }
  }
}

/** Short value printed on each polygon's label chip (the non-color encoding). */
export function chipValue(mode: ColorMode, x: SeccionMapa): string {
  switch (mode) {
    case "region":
      return x.region ?? "—";
    case "prioridad":
      return x.prioridad ?? "—";
    case "avance":
      return formatPct(pctOf(x.avance.promovidos, x.meta.promovidos)).replace(" ", "");
    case "resultado": {
      const pp = margenPp(x.r2024);
      if (pp === null) return "—";
      const r = Math.round(pp);
      return r === 0 ? "0" : `${r > 0 ? "+" : "−"}${Math.abs(r)}`;
    }
  }
}

export interface LegendItem {
  label: string;
  color: string;
}

export interface Legend {
  title: string;
  kind: "categorical" | "ordinal" | "sequential" | "diverging";
  items: LegendItem[];
  note?: string;
}

export function legendFor(mode: ColorMode, theme: ThemeName, secciones: SeccionMapa[] = []): Legend {
  switch (mode) {
    case "region": {
      const barrios = new Map<string, Set<string>>();
      for (const x of secciones) {
        if (!x.region || !x.barrio) continue;
        if (!barrios.has(x.region)) barrios.set(x.region, new Set());
        barrios.get(x.region)!.add(titleCase(x.barrio));
      }
      return {
        title: "Región",
        kind: "categorical",
        items: REGIONES.map((r, i) => {
          const b = barrios.get(r);
          return {
            label: b && b.size ? `${r} ${[...b].join(", ")}` : r,
            color: REGION_COLORS[theme][i],
          };
        }),
      };
    }
    case "prioridad":
      return {
        title: "Prioridad 2027",
        kind: "ordinal",
        items: (["P1", "P2", "P3", "P4"] as const).map((p) => ({
          label: p === "P1" ? "P1 máxima" : p === "P4" ? "P4 menor" : p,
          color: PRIORIDAD_COLORS[theme][p],
        })),
      };
    case "avance":
      return {
        title: "Promovidos capturados vs meta",
        kind: "sequential",
        items: [
          { label: "menos de 10 %", color: AVANCE_COLORS[theme][0] },
          { label: "10–25 %", color: AVANCE_COLORS[theme][1] },
          { label: "25–50 %", color: AVANCE_COLORS[theme][2] },
          { label: "50–75 %", color: AVANCE_COLORS[theme][3] },
          { label: "75–100 %", color: AVANCE_COLORS[theme][4] },
          { label: "Meta cumplida", color: AVANCE_COLORS[theme][5] },
        ],
      };
    case "resultado":
      return {
        title: "Margen 2024 (puntos)",
        kind: "diverging",
        note: "Coalición menos Morena, sobre votos emitidos.",
        items: [
          { label: "Morena +10 o más", color: RESULTADO_COLORS[theme][0] },
          { label: "Morena +5 a +10", color: RESULTADO_COLORS[theme][1] },
          { label: "Morena +2 a +5", color: RESULTADO_COLORS[theme][2] },
          { label: "Empate ±2", color: RESULTADO_COLORS[theme][3] },
          { label: "Coalición +2 a +5", color: RESULTADO_COLORS[theme][4] },
          { label: "Coalición +5 a +10", color: RESULTADO_COLORS[theme][5] },
          { label: "Coalición +10 o más", color: RESULTADO_COLORS[theme][6] },
        ],
      };
  }
}

export function regionColor(region: string | null, theme: ThemeName): string {
  const i = regionIndex(region);
  return i < 0 ? NEUTRAL[theme] : REGION_COLORS[theme][i];
}

// ── grouping ─────────────────────────────────────────────────────────────

export interface RegionGroup {
  region: string;
  barrios: string[];
  secciones: SeccionMapa[];
  subtotal: Totales;
}

const seccionNum = (x: SeccionMapa) => Number.parseInt(x.seccion, 10) || Number.MAX_SAFE_INTEGER;

export function groupByRegion(secciones: SeccionMapa[]): RegionGroup[] {
  const map = new Map<string, SeccionMapa[]>();
  for (const x of secciones) {
    const key = x.region ?? "Sin región";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(x);
  }
  const order = (r: string) => {
    const i = regionIndex(r === "Sin región" ? null : r);
    return i < 0 ? 999 : i;
  };
  return [...map.entries()]
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([region, list]) => {
      const sorted = [...list].sort((a, b) => seccionNum(a) - seccionNum(b));
      const barrios = [...new Set(sorted.map((x) => titleCase(x.barrio)).filter((b) => b !== "—"))];
      const sum = (pick: (x: SeccionMapa) => number) => sorted.reduce((acc, x) => acc + pick(x), 0);
      return {
        region,
        barrios,
        secciones: sorted,
        subtotal: {
          meta: {
            lideres: sum((x) => x.meta.lideres),
            activistas: sum((x) => x.meta.activistas),
            promovidos: sum((x) => x.meta.promovidos),
          },
          avance: {
            lideres: sum((x) => x.avance.lideres),
            activistas: sum((x) => x.avance.activistas),
            promovidos: sum((x) => x.avance.promovidos),
            viejos: sum((x) => x.avance.viejos),
          },
        },
      };
    });
}

/** Secciones whose captured counts went up between two refreshes. */
export function changedSecciones(prev: SeccionMapa[], next: SeccionMapa[]): Set<string> {
  const before = new Map(prev.map((x) => [x.seccion, x.avance]));
  const out = new Set<string>();
  for (const x of next) {
    const b = before.get(x.seccion);
    if (!b) continue;
    if (
      x.avance.promovidos > b.promovidos ||
      x.avance.activistas > b.activistas ||
      x.avance.lideres > b.lideres
    ) {
      out.add(x.seccion);
    }
  }
  return out;
}

// ── geometry ─────────────────────────────────────────────────────────────

type Ring = Position[];

function outerRings(g: Geometry | null): Ring[][] {
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}

function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  }
  return Math.abs(a / 2);
}

function inRing(x: number, y: number, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(x: number, y: number, poly: Ring[]): boolean {
  if (!poly.length || !inRing(x, y, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) if (inRing(x, y, poly[h])) return false;
  return true;
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

/**
 * A label anchor that is guaranteed to fall inside the (largest) polygon —
 * an approximate "pole of inaccessibility" found on a sampling grid, so
 * concave secciones don't get their number painted on a neighbour.
 */
export function labelPoint(g: Geometry | null, grid = 28): [number, number] | null {
  const polys = outerRings(g).filter((p) => p.length && p[0].length >= 3);
  if (!polys.length) return null;
  const poly = polys.reduce((best, p) => (ringArea(p[0]) > ringArea(best[0]) ? p : best));
  const ring = poly[0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  // Scale longitude by cos(lat) so distances are roughly isotropic.
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180) || 1;
  let best: [number, number] | null = null;
  let bestD = -1;
  for (let i = 0; i <= grid; i++) {
    for (let j = 0; j <= grid; j++) {
      const x = minX + ((maxX - minX) * (i + 0.5)) / (grid + 1);
      const y = minY + ((maxY - minY) * (j + 0.5)) / (grid + 1);
      if (!inPolygon(x, y, poly)) continue;
      let d = Infinity;
      for (const r of poly) {
        for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
          const dd = segDist2(x * k, y, r[b][0] * k, r[b][1], r[a][0] * k, r[a][1]);
          if (dd < d) d = dd;
        }
      }
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
  }
  if (best) return best;
  // Degenerate polygon: fall back to the vertex average.
  const sx = ring.reduce((acc, p) => acc + p[0], 0) / ring.length;
  const sy = ring.reduce((acc, p) => acc + p[1], 0) / ring.length;
  return [sx, sy];
}

/** [[minLng, minLat], [maxLng, maxLat]] over every feature, or null. */
export function boundsOf(secciones: SeccionMapa[]): [[number, number], [number, number]] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const x of secciones) {
    for (const poly of outerRings(x.geometry)) {
      for (const [px, py] of poly[0] ?? []) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }
  }
  return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null;
}
