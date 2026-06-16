// frontend/src/modules/demografia/fixtures.ts
// PREVIEW sample data for the Demografía & Censo module.
// Figures are illustrative ("muestra"); real data should come from the INEGI
// APIs (Censo de Población y Vivienda) once a token is wired. See client.ts.

export interface EntityDemografia {
  /** Entity name (entidad federativa). */
  entity: string;
  /** Total population. */
  poblacion: number;
  hombres: number;
  mujeres: number;
  /** Average years of schooling (grado promedio de escolaridad). */
  escolaridad: number;
  /** Occupied private dwellings. */
  viviendas: number;
}

export interface AgeSexBand {
  /** Age group label. */
  band: string;
  hombres: number;
  mujeres: number;
}

export interface SexDatum {
  sex: string;
  color: string;
  share: number;
}

/** Distribution of population by highest schooling level (%) — muestra. */
export interface SchoolingLevel {
  level: string;
  share: number; // %
  color?: string;
}

/** Share of occupied dwellings by a basic service / amenity (%) — muestra. */
export interface DwellingService {
  service: string;
  share: number; // ratio 0..1
}

export interface DemografiaData {
  summary: {
    poblacion: number;
    hombres: number;
    mujeres: number;
    escolaridad: number;
    viviendas: number;
    edadMediana: number;
    /** Dependency ratio (population <15 and 65+ over working-age), ratio 0..1. */
    dependencia: number;
  };
  ageSex: AgeSexBand[];
  sexSplit: SexDatum[];
  schooling: SchoolingLevel[];
  dwellings: DwellingService[];
  entities: EntityDemografia[];
}

/** Population by highest schooling attained (%) — muestra. */
export const SCHOOLING: SchoolingLevel[] = [
  { level: "Sin escolaridad", share: 4.2, color: "#f4607a" },
  { level: "Primaria", share: 19.8, color: "#7c8aa5" },
  { level: "Secundaria", share: 28.6, color: "#f5b53d" },
  { level: "Media superior", share: 24.1, color: "#2dd4bf" },
  { level: "Superior", share: 23.3, color: "#22d3ee" },
];

/** Coverage of basic dwelling services (%) — muestra. */
export const DWELLINGS: DwellingService[] = [
  { service: "Energía eléctrica", share: 0.992 },
  { service: "Agua entubada", share: 0.956 },
  { service: "Drenaje", share: 0.934 },
  { service: "Internet", share: 0.681 },
  { service: "Computadora", share: 0.443 },
];

/** Population by entity / sex / schooling / dwellings — muestra. */
export const ENTITIES: EntityDemografia[] = [
  { entity: "Estado de México", poblacion: 16_992_000, hombres: 8_244_000, mujeres: 8_748_000, escolaridad: 10.1, viviendas: 4_595_000 },
  { entity: "Ciudad de México", poblacion: 9_209_000, hombres: 4_404_000, mujeres: 4_805_000, escolaridad: 11.5, viviendas: 2_739_000 },
  { entity: "Jalisco", poblacion: 8_348_000, hombres: 4_109_000, mujeres: 4_239_000, escolaridad: 9.7, viviendas: 2_276_000 },
  { entity: "Veracruz", poblacion: 8_063_000, hombres: 3_896_000, mujeres: 4_167_000, escolaridad: 8.7, viviendas: 2_242_000 },
  { entity: "Puebla", poblacion: 6_584_000, hombres: 3_140_000, mujeres: 3_444_000, escolaridad: 8.5, viviendas: 1_726_000 },
  { entity: "Guanajuato", poblacion: 6_166_000, hombres: 2_975_000, mujeres: 3_191_000, escolaridad: 8.4, viviendas: 1_572_000 },
  { entity: "Nuevo León", poblacion: 5_784_000, hombres: 2_891_000, mujeres: 2_893_000, escolaridad: 10.7, viviendas: 1_640_000 },
  { entity: "Chiapas", poblacion: 5_544_000, hombres: 2_708_000, mujeres: 2_836_000, escolaridad: 7.3, viviendas: 1_388_000 },
  { entity: "Michoacán", poblacion: 4_749_000, hombres: 2_294_000, mujeres: 2_455_000, escolaridad: 7.9, viviendas: 1_242_000 },
  { entity: "Oaxaca", poblacion: 4_132_000, hombres: 1_972_000, mujeres: 2_160_000, escolaridad: 7.9, viviendas: 1_138_000 },
  { entity: "Guerrero", poblacion: 3_540_000, hombres: 1_704_000, mujeres: 1_836_000, escolaridad: 7.8, viviendas: 925_000 },
  { entity: "Chihuahua", poblacion: 3_742_000, hombres: 1_864_000, mujeres: 1_878_000, escolaridad: 9.5, viviendas: 1_104_000 },
  { entity: "Baja California", poblacion: 3_769_000, hombres: 1_900_000, mujeres: 1_869_000, escolaridad: 10.0, viviendas: 1_133_000 },
  { entity: "Tamaulipas", poblacion: 3_528_000, hombres: 1_741_000, mujeres: 1_787_000, escolaridad: 9.7, viviendas: 1_044_000 },
  { entity: "Sonora", poblacion: 2_944_000, hombres: 1_473_000, mujeres: 1_471_000, escolaridad: 10.0, viviendas: 876_000 },
  { entity: "Coahuila", poblacion: 3_146_000, hombres: 1_563_000, mujeres: 1_583_000, escolaridad: 10.0, viviendas: 875_000 },
];

/** Population pyramid distribution by age group and sex (%) — muestra. */
export const AGE_SEX: AgeSexBand[] = [
  { band: "0–14", hombres: 12.8, mujeres: 12.3 },
  { band: "15–29", hombres: 12.6, mujeres: 12.4 },
  { band: "30–44", hombres: 10.4, mujeres: 11.0 },
  { band: "45–59", hombres: 7.6, mujeres: 8.2 },
  { band: "60–74", hombres: 3.9, mujeres: 4.4 },
  { band: "75+", hombres: 1.6, mujeres: 2.1 },
];

/** National sex split — muestra. */
export const SEX_SPLIT: SexDatum[] = [
  { sex: "Mujeres", color: "#2dd4bf", share: 0.512 },
  { sex: "Hombres", color: "#22d3ee", share: 0.488 },
];

export const DEMOGRAFIA_DATA: DemografiaData = {
  summary: {
    poblacion: 126_014_000,
    hombres: 61_473_000,
    mujeres: 64_541_000,
    escolaridad: 9.7,
    viviendas: 35_220_000,
    edadMediana: 29,
    dependencia: 0.476,
  },
  ageSex: AGE_SEX,
  sexSplit: SEX_SPLIT,
  schooling: SCHOOLING,
  dwellings: DWELLINGS,
  entities: ENTITIES,
};
