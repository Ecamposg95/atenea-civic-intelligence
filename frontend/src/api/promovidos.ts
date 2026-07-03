import { apiClient } from "./client";

export interface Promovido {
  id: string;
  nombre_completo: string;
  seccion: string | null;
  colonia: string | null;
  telefono: string | null;
  edad: number | null;
  estructura: string | null;
  promotor: string | null;
  clave_masked: string | null;
  participacion: number | null;
  margen: number | null;
  prioridad: string | null;
}

export interface PromovidoList {
  items: Promovido[];
  total: number;
  limit: number;
  offset: number;
  has_territory: boolean;
}

export interface PromovidoFilters {
  seccion?: string;
  promotor?: string;
  prioridad?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listPromovidos(f: PromovidoFilters = {}): Promise<PromovidoList> {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") params[k] = v;
  const { data } = await apiClient.get<PromovidoList>("/promovidos", { params });
  return data;
}
