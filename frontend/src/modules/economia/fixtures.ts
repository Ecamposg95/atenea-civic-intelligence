// frontend/src/modules/economia/fixtures.ts
// PREVIEW sample data — DataMéxico (datamexico.org) is unreachable from prod.
// Figures are illustrative ("muestra") and shaped to mirror a future DataMéxico response.

/** National-level economic summary KPIs (sample). */
export interface EconomySummary {
  pibNacional: number; // PIB nacional, miles de millones MXN
  pibEdoMex: number; // PIB Estado de México, miles de millones MXN
  empleoFormal: number; // empleo formal nacional (personas)
  complejidadEdoMex: number; // índice de complejidad económica (ECI), -3..3
  exportaciones: number; // exportaciones anuales, miles de millones USD
  crecimientoAnual: number; // crecimiento PIB real anual, ratio 0..1
}

/** Per-entity economic snapshot (sample). */
export interface EntityEconomy {
  entity: string;
  pib: number; // PIB estatal, miles de millones MXN
  empleo: number; // empleo formal estatal (personas)
  complejidad: number; // índice de complejidad económica (ECI)
  comercio: number; // balanza comercial neta, miles de millones USD
  crecimiento: number; // crecimiento anual real, ratio 0..1
}

/** Stacked composition of GDP by economic sector per entity (sample, %). */
export interface SectorComposition {
  entity: string;
  primario: number; // %
  secundario: number; // %
  terciario: number; // %
}

/** Share of national exports by sector (sample). */
export interface ExportShare {
  name: string;
  value: number; // miles de millones USD
  color?: string;
}

export const SUMMARY: EconomySummary = {
  pibNacional: 31_200,
  pibEdoMex: 2_980,
  empleoFormal: 22_100_000,
  complejidadEdoMex: 1.18,
  exportaciones: 593,
  crecimientoAnual: 0.031,
};

export const ENTITIES: EntityEconomy[] = [
  { entity: "Estado de México", pib: 2_980, empleo: 1_870_000, complejidad: 1.18, comercio: 18.4, crecimiento: 0.034 },
  { entity: "Ciudad de México", pib: 5_240, empleo: 3_410_000, complejidad: 1.42, comercio: 21.7, crecimiento: 0.028 },
  { entity: "Nuevo León", pib: 2_610, empleo: 1_690_000, complejidad: 1.67, comercio: 42.3, crecimiento: 0.041 },
  { entity: "Jalisco", pib: 2_280, empleo: 1_540_000, complejidad: 1.21, comercio: 24.9, crecimiento: 0.038 },
  { entity: "Guanajuato", pib: 1_410, empleo: 1_020_000, complejidad: 1.34, comercio: 31.2, crecimiento: 0.036 },
  { entity: "Coahuila", pib: 1_180, empleo: 760_000, complejidad: 1.55, comercio: 38.6, crecimiento: 0.039 },
  { entity: "Veracruz", pib: 1_360, empleo: 880_000, complejidad: 0.42, comercio: 6.1, crecimiento: 0.019 },
  { entity: "Puebla", pib: 1_290, empleo: 910_000, complejidad: 0.98, comercio: 14.8, crecimiento: 0.027 },
  { entity: "Baja California", pib: 1_120, empleo: 870_000, complejidad: 1.46, comercio: 35.4, crecimiento: 0.043 },
  { entity: "Chihuahua", pib: 1_240, empleo: 920_000, complejidad: 1.61, comercio: 49.8, crecimiento: 0.045 },
  { entity: "Querétaro", pib: 980, empleo: 690_000, complejidad: 1.52, comercio: 19.3, crecimiento: 0.048 },
  { entity: "Sonora", pib: 1_070, empleo: 720_000, complejidad: 0.88, comercio: 16.7, crecimiento: 0.033 },
  { entity: "Tamaulipas", pib: 940, empleo: 640_000, complejidad: 0.79, comercio: 22.1, crecimiento: 0.024 },
  { entity: "Michoacán", pib: 760, empleo: 510_000, complejidad: 0.31, comercio: 4.9, crecimiento: 0.022 },
  { entity: "Oaxaca", pib: 540, empleo: 360_000, complejidad: -0.12, comercio: 1.8, crecimiento: 0.015 },
  { entity: "Chiapas", pib: 510, empleo: 330_000, complejidad: -0.34, comercio: 1.2, crecimiento: 0.011 },
];

/** GDP composition by sector — muestra (each row sums ~100%). */
export const SECTORS: SectorComposition[] = [
  { entity: "Edo. México", primario: 1.2, secundario: 31.8, terciario: 67.0 },
  { entity: "CDMX", primario: 0.1, secundario: 12.4, terciario: 87.5 },
  { entity: "Nuevo León", primario: 0.6, secundario: 39.2, terciario: 60.2 },
  { entity: "Jalisco", primario: 5.4, secundario: 30.1, terciario: 64.5 },
  { entity: "Guanajuato", primario: 3.8, secundario: 44.6, terciario: 51.6 },
  { entity: "Coahuila", primario: 1.9, secundario: 52.3, terciario: 45.8 },
  { entity: "Chihuahua", primario: 4.1, secundario: 46.7, terciario: 49.2 },
  { entity: "Querétaro", primario: 1.7, secundario: 42.9, terciario: 55.4 },
];

/** National exports by sector — muestra (miles de millones USD). */
export const EXPORT_SHARES: ExportShare[] = [
  { name: "Automotriz", value: 192, color: "#22d3ee" },
  { name: "Electrónica", value: 118, color: "#f5b53d" },
  { name: "Maquinaria", value: 86, color: "#2dd4bf" },
  { name: "Agroalimentos", value: 64, color: "#7c8aa5" },
  { name: "Energía", value: 51, color: "#06b6d4" },
  { name: "Otros", value: 82, color: "#f4607a" },
];

/** Annual trade balance: exports vs imports per year — muestra (MMD USD). */
export interface TradeBalancePoint {
  year: string;
  exportaciones: number; // miles de millones USD
  importaciones: number; // miles de millones USD
}

export const TRADE_BALANCE: TradeBalancePoint[] = [
  { year: "2019", exportaciones: 461, importaciones: 455 },
  { year: "2020", exportaciones: 417, importaciones: 383 },
  { year: "2021", exportaciones: 494, importaciones: 506 },
  { year: "2022", exportaciones: 578, importaciones: 604 },
  { year: "2023", exportaciones: 593, importaciones: 599 },
  { year: "2024", exportaciones: 617, importaciones: 612 },
];

/** Top commercial / retail subsectors by establishments — muestra. */
export interface ComercioSubsector {
  name: string;
  value: number; // miles de establecimientos
  color?: string;
}

export const COMERCIO_SUBSECTORS: ComercioSubsector[] = [
  { name: "Abarrotes y alimentos", value: 612, color: "#22d3ee" },
  { name: "Comercio al por mayor", value: 248, color: "#f5b53d" },
  { name: "Textil y calzado", value: 196, color: "#2dd4bf" },
  { name: "Ferretería y construcción", value: 154, color: "#7c8aa5" },
  { name: "Electrónica y hogar", value: 121, color: "#06b6d4" },
  { name: "Automotriz y refacciones", value: 98, color: "#f4607a" },
];

/** Economic complexity ranking inputs per entity — muestra. */
export interface ComplexityPoint {
  entity: string;
  eci: number; // índice de complejidad económica
  diversidad: number; // número de productos exportados (proxy)
}

export const COMPLEXITY: ComplexityPoint[] = ENTITIES.map((e) => ({
  entity: e.entity,
  eci: e.complejidad,
  // Sample diversity proxy derived from ECI so the chart stays self-consistent.
  diversidad: Math.round(110 + (e.complejidad + 0.5) * 95),
}));
