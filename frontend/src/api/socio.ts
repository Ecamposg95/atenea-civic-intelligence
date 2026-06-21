import { apiClient } from "./client";

export interface SocioMetric {
  territory_code: string;
  nivel: string;
  indicador: string;
  valor: number | null;
  anio: number | null;
  fuente: string | null;
}

export async function getSocio(
  params?: Record<string, string>,
): Promise<SocioMetric[]> {
  const { data } = await apiClient.get<{ metrics: SocioMetric[] }>("/socio", {
    params,
  });
  return data.metrics;
}
