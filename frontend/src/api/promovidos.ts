import { apiClient } from "./client";

/** Full registro record (GET /registros/:id) — every non-encrypted field of a
 * promovido, for the detail panel. Clave stays masked. */
export interface RegistroDetalle {
  id: string;
  nombre_completo: string;
  seccion: string | null;
  direccion: string | null;
  colonia: string | null;
  telefono: string | null;
  area: string | null;
  sexo: string | null;
  edad: number | null;
  estructura: string | null;
  observacion: string | null;
  promotor: string | null;
  activista_nombre: string | null;
  clave_masked: string | null;
  consentimiento: boolean;
  consentimiento_at: string | null;
  created_at: string;
}

export async function getRegistroDetalle(id: string): Promise<RegistroDetalle> {
  return (await apiClient.get(`/registros/${id}`)).data;
}

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
  /** Optional: not yet returned by every backend build of PromovidoRead. */
  created_at?: string | null;
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
