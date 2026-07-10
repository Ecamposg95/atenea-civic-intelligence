import { apiClient } from "./client";
import type { AxiosRequestConfig } from "axios";

export type MilitanteEstado = "REGISTRADO" | "VALIDADO" | "OBSERVADO";

export interface QualityFlags {
  falta_curp: boolean; falta_foto_frente: boolean; falta_foto_reverso: boolean;
  falta_firma: boolean; clave_incompleta: boolean; posible_duplicado: boolean;
}

export interface Militante {
  id: string; folio: string; nombre_completo: string;
  seccion: string | null; sexo: string | null; telefono: string | null;
  colonia: string | null; municipio: string | null; es_activista: boolean;
  estructura: string | null; curp_masked: string | null; clave_masked: string | null;
  estado: MilitanteEstado; quality_flags: QualityFlags | null;
  activista_nombre: string | null;
  tiene_frente: boolean; tiene_reverso: boolean; tiene_firma: boolean;
  fecha_afiliacion: string | null; created_at: string;
}

export interface MilitanteList {
  items: Militante[]; total: number; limit: number; offset: number; has_territory: boolean;
}

export interface MilitanteCreate {
  nombre_completo: string; consentimiento: boolean;
  curp?: string; clave_elector?: string; sexo?: string; fecha_nacimiento?: string;
  seccion?: string; email?: string; telefono?: string;
  calle_numero?: string; colonia?: string; cp?: string; municipio?: string;
  estado_domicilio?: string; es_activista?: boolean; estructura?: string;
  promotor?: string; folio_externo?: string; fecha_afiliacion?: string;
  client_uuid?: string; lat?: number; lng?: number;
}

export interface Panorama {
  kpis: { total: number; validados: number; observados: number; registrados: number;
          meta: number | null; ritmo_7d: number; ritmo_30d: number };
  por_seccion: { seccion: string; militantes: number; lista_nominal: number | null;
                 prioridad: string | null; promovidos: number }[];
  por_activista: { activista_id: string | null; nombre: string; militantes: number; con_banderas: number }[];
  trend: number[];
}

export async function createMilitante(payload: MilitanteCreate, config?: AxiosRequestConfig): Promise<Militante> {
  return (await apiClient.post("/militantes", payload, config)).data;
}

export async function uploadDocumento(
  id: string,
  tipo: "frente" | "reverso" | "firma",
  blob: Blob,
  config?: AxiosRequestConfig,
): Promise<Militante> {
  const fd = new FormData();
  fd.append("tipo", tipo);
  fd.append("file", blob, `${tipo}.jpg`);
  return (await apiClient.post(`/militantes/${id}/documento`, fd, {
    ...config,
    headers: { ...config?.headers, "Content-Type": "multipart/form-data" },
  })).data;
}

export async function listMilitantes(params: Record<string, string | number | undefined> = {}): Promise<MilitanteList> {
  return (await apiClient.get("/militantes", { params })).data;
}

export async function getMilitante(id: string): Promise<Militante> {
  return (await apiClient.get(`/militantes/${id}`)).data;
}

export async function setEstado(id: string, estado: "VALIDADO" | "OBSERVADO", observacion_validacion?: string): Promise<Militante> {
  return (await apiClient.patch(`/militantes/${id}/estado`, { estado, observacion_validacion })).data;
}

export interface Reveal { curp: string | null; clave_elector: string | null;
  frente_url: string | null; reverso_url: string | null; firma_url: string | null; }

export async function revealMilitante(id: string): Promise<Reveal> {
  return (await apiClient.get(`/militantes/reveal/${id}`)).data;
}

export async function getPanorama(): Promise<Panorama> {
  return (await apiClient.get("/militantes/panorama")).data;
}
