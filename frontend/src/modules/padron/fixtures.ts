// frontend/src/modules/padron/fixtures.ts
export interface AgeBand { band: string; hombres: number; mujeres: number; }
export interface EntityPadron { entity: string; padron: number; }
export interface EntityCoverage { entity: string; padron: number; listaNominal: number; cobertura: number; }

export const SUMMARY = { padron: 98_500_000, listaNominal: 97_800_000, cobertura: 0.964, edadMediana: 39 };

export const AGE_BANDS: AgeBand[] = [
  { band: "18–24", hombres: 6.1, mujeres: 6.0 },
  { band: "25–34", hombres: 9.4, mujeres: 9.7 },
  { band: "35–44", hombres: 8.2, mujeres: 8.6 },
  { band: "45–54", hombres: 6.7, mujeres: 7.1 },
  { band: "55–64", hombres: 4.9, mujeres: 5.3 },
  { band: "65+", hombres: 4.1, mujeres: 5.0 },
];

/** Sample sex split of the lista nominal (preview only). */
export const SEX_DISTRIBUTION = [
  { sex: "Mujeres", color: "#2dd4bf", share: 0.517 },
  { sex: "Hombres", color: "#22d3ee", share: 0.483 },
];

export const TOP_ENTITIES: EntityPadron[] = [
  { entity: "Estado de México", padron: 12_900_000 },
  { entity: "Ciudad de México", padron: 7_700_000 },
  { entity: "Jalisco", padron: 6_300_000 },
  { entity: "Veracruz", padron: 5_900_000 },
  { entity: "Puebla", padron: 4_700_000 },
];

/** Cobertura (lista nominal / padrón) por entidad — muestra. */
export const ENTITY_COVERAGE: EntityCoverage[] = [
  { entity: "Estado de México", padron: 12_900_000, listaNominal: 12_540_000, cobertura: 0.972 },
  { entity: "Ciudad de México", padron: 7_700_000, listaNominal: 7_546_000, cobertura: 0.98 },
  { entity: "Jalisco", padron: 6_300_000, listaNominal: 6_098_000, cobertura: 0.968 },
  { entity: "Veracruz", padron: 5_900_000, listaNominal: 5_652_000, cobertura: 0.958 },
  { entity: "Puebla", padron: 4_700_000, listaNominal: 4_512_000, cobertura: 0.96 },
  { entity: "Guanajuato", padron: 4_500_000, listaNominal: 4_374_000, cobertura: 0.972 },
  { entity: "Nuevo León", padron: 4_200_000, listaNominal: 4_120_000, cobertura: 0.981 },
  { entity: "Chiapas", padron: 3_900_000, listaNominal: 3_705_000, cobertura: 0.95 },
  { entity: "Michoacán", padron: 3_600_000, listaNominal: 3_481_000, cobertura: 0.967 },
  { entity: "Oaxaca", padron: 3_100_000, listaNominal: 2_945_000, cobertura: 0.95 },
  { entity: "Guerrero", padron: 2_700_000, listaNominal: 2_551_000, cobertura: 0.945 },
  { entity: "Tamaulipas", padron: 2_600_000, listaNominal: 2_538_000, cobertura: 0.976 },
  { entity: "Baja California", padron: 2_800_000, listaNominal: 2_744_000, cobertura: 0.98 },
  { entity: "Sonora", padron: 2_300_000, listaNominal: 2_249_000, cobertura: 0.978 },
  { entity: "Coahuila", padron: 2_200_000, listaNominal: 2_156_000, cobertura: 0.98 },
  { entity: "Chihuahua", padron: 2_900_000, listaNominal: 2_828_000, cobertura: 0.975 },
];
