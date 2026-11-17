import type { Geometry } from "geojson";

import { apiClient } from "./client";

/** INEGI code of San Mateo Atenco (the only municipio with sección cartography). */
export const SMA_CODE = "15076";

/** 2024 results for a map feature (summed when the feature merges secciones). */
export interface MapaResultado2024 {
  lista_nominal?: number | null;
  votos?: number | null;
  participacion?: number | null;
  coalicion?: number | null;
  morena?: number | null;
  /** coalición − morena, in votes. */
  margen?: number | null;
  /** Label of the 2024 classification (e.g. COMPETITIVA). */
  etiqueta?: string | null;
}

export interface MapaAvance {
  lideres?: number | null;
  activistas?: number | null;
  promovidos?: number | null;
  viejos?: number | null;
  pct_lideres?: number | null;
  pct_activistas?: number | null;
  pct_promovidos?: number | null;
}

/**
 * Raw feature properties as served by `GET /municipio/{code}/mapa`.
 * The backend nests `resultado_2024` and `avance`; flat variants are also
 * accepted (every field is optional — see `normalizeSeccion`).
 */
export interface MapaFeatureProps {
  seccion?: string | number | null;
  secciones?: string[] | null;
  secciones_detalle?: { seccion: string; barrio?: string | null; region?: string | null; prioridad?: string | null }[] | null;
  barrio?: string | null;
  region?: string | null;
  prioridad?: string | null;
  ln_may25?: number | null;
  proy_2027?: number | null;
  meta_lideres?: number | null;
  meta_activistas?: number | null;
  meta_promovidos?: number | null;
  resultado_2024?: MapaResultado2024 | null;
  avance?: MapaAvance | null;
  nota?: string | null;
  // Flat fallbacks.
  lista_nominal?: number | null;
  votos?: number | null;
  participacion?: number | null;
  coalicion?: number | null;
  morena?: number | null;
  margen?: number | null;
  prioridad_2024?: string | null;
  lideres?: number | null;
  activistas?: number | null;
  promovidos?: number | null;
  viejos?: number | null;
}

export interface MapaFeature {
  type: "Feature";
  id?: string | number;
  geometry: Geometry | null;
  properties: MapaFeatureProps | null;
}

export interface MapaTotales {
  meta_lideres?: number | null;
  meta_activistas?: number | null;
  meta_promovidos?: number | null;
  lideres?: number | null;
  activistas?: number | null;
  promovidos?: number | null;
  viejos?: number | null;
  secciones?: number | null;
  pct_promovidos?: number | null;
}

export interface MapaCollection {
  type: "FeatureCollection";
  municipio_code?: string;
  fuente?: string | null;
  features: MapaFeature[];
  totales?: MapaTotales | null;
}

export async function getMapaMunicipio(code: string = SMA_CODE): Promise<MapaCollection> {
  return (await apiClient.get(`/municipio/${code}/mapa`)).data;
}
