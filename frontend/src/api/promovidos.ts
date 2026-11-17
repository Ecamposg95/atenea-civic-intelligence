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
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  nombres?: string | null;
  /** Captura SMA (0022) — optional so an older backend never breaks the drawer. */
  legacy?: boolean;
  tipo?: TipoPersona | null;
  padre_id?: string | null;
  padre_nombre?: string | null;
  curp_masked?: string | null;
  consentimiento: boolean;
  consentimiento_at: string | null;
  created_at: string;
}

export async function getRegistroDetalle(id: string): Promise<RegistroDetalle> {
  return (await apiClient.get(`/registros/${id}`)).data;
}

/** Bulk import (standard paper Excel template). */
export interface ImportMuestra {
  nombre_completo: string;
  seccion: string | null;
  colonia: string | null;
  promotor: string | null;
}
export interface ImportPreview {
  commit: false;
  leidas: number;
  muestra: ImportMuestra[];
}
export interface ImportResult {
  commit: true;
  leidas: number;
  importadas: number;
  duplicadas: number;
}

async function _importPost(file: File, commit: boolean) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("commit", commit ? "true" : "false");
  return (await apiClient.post("/promovidos/import", fd)).data;
}
export const previewImport = (file: File): Promise<ImportPreview> => _importPost(file, false);
export const commitImport = (file: File): Promise<ImportResult> => _importPost(file, true);

export type TipoPersona = "LIDER" | "ACTIVISTA" | "PROMOVIDO";
export type FiltroLegacy = "nuevos" | "viejos" | "todos";

export interface Promovido {
  id: string;
  nombre_completo: string;
  seccion: string | null;
  direccion: string | null;
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
  /** Captura SMA (0022): "valor viejo", person type and parent (líder/activista). */
  legacy?: boolean;
  tipo?: TipoPersona | null;
  padre_id?: string | null;
  padre_nombre?: string | null;
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
  /** Server sort key: nombre | seccion | created_at | edad. */
  sort?: "nombre" | "seccion" | "created_at" | "edad";
  /** Server sort direction: asc | desc. */
  order?: "asc" | "desc";
  /** Nuevos (captura SMA) / Valores viejos / Todos. */
  legacy?: FiltroLegacy;
  tipo?: TipoPersona | "";
  /** Exact parent registro (from Estructura "ver familia"). */
  padre_id?: string;
  /** Líder/activista name → that person's direct children. */
  padre?: string;
}

export async function listPromovidos(f: PromovidoFilters = {}): Promise<PromovidoList> {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") params[k] = v;
  const { data } = await apiClient.get<PromovidoList>("/promovidos", { params });
  return data;
}

export interface ExportFilters {
  q?: string;
  seccion?: string;
  legacy?: FiltroLegacy;
  tipo?: TipoPersona | "";
}

/** Download the masked export (`GET /registros/export`, audited server-side). */
export async function downloadExport(format: "csv" | "xlsx", f: ExportFilters = {}): Promise<void> {
  const params: Record<string, string> = { format };
  for (const [k, v] of Object.entries(f)) if (v) params[k] = v;
  const res = await apiClient.get<Blob>("/registros/export", { params, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `personas_${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
