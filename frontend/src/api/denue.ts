import { apiClient } from "./client";

export interface DenueUnit {
  id: string;
  nombre: string;
  actividad: string | null;
  municipio: string | null;
  estado: string | null;
  lat: number | null;
  lng: number | null;
}

/** GeoJSON FeatureCollection as returned by /denue/geojson */
export interface DenueGeojson {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: string; coordinates: number[] };
    properties: Record<string, unknown>;
  }>;
}

export async function getUnits(
  params?: Record<string, string>,
): Promise<DenueUnit[]> {
  const { data } = await apiClient.get<{ units: DenueUnit[] }>("/denue", {
    params,
  });
  return data.units;
}

export async function getGeojson(
  params?: Record<string, string>,
): Promise<DenueGeojson> {
  const { data } = await apiClient.get<DenueGeojson>("/denue/geojson", {
    params,
  });
  return data;
}
