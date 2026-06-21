import { apiClient } from "./client";

export interface ElectionRow {
  territory_code: string;
  nivel: string;
  anio: number;
  eleccion: string;
  partido: string;
  votos: number;
}

export interface Derived {
  participacion: number | null;
  abstencion: number | null;
  margen: number | null;
  ganador: string | null;
  total_votos: number;
  lista_nominal: number | null;
}

export async function getResultados(
  params?: Record<string, string>,
): Promise<ElectionRow[]> {
  const { data } = await apiClient.get<{ results: ElectionRow[] }>(
    "/resultados",
    { params },
  );
  return data.results;
}

export async function getDerived(
  params?: Record<string, string>,
): Promise<Derived> {
  const { data } = await apiClient.get<Derived>("/resultados/derived", {
    params,
  });
  return data;
}
