import { apiClient } from "./client";

// FormField: individual form input definition
export interface FormField {
  key: string;
  tipo: string;
  label: string;
  requerido?: boolean;
  opciones?: string[];
  sensible?: boolean;
  mostrar_si?: {
    campo: string;
    igual: string;
  };
}

// FormSchema: collection of sections, each with fields
export interface FormSchema {
  secciones: {
    titulo: string;
    campos: FormField[];
  }[];
}

// FormDefinition: complete form definition (read shape from Plan 1)
export interface FormDefinition {
  id: string;
  nombre: string;
  descripcion?: string;
  tipo: string;
  slug: string;
  canal: string;
  schema: FormSchema;
  is_active: boolean;
  version: number;
}

// FormResponsePayload: response after form submission
export interface FormResponsePayload {
  id: string;
  caso_id?: string;
  moderacion: string;
}

// Caso: citizen case/request entity
export interface Caso {
  id: string;
  folio: string;
  tipo: string;
  titulo: string;
  descripcion?: string;
  ciudadano_nombre?: string;
  contacto_masked?: string;
  seccion?: string;
  colonia?: string;
  estado: string;
  prioridad: string;
  fecha_compromiso?: string;
  asignado_a?: string;
  asignado_nombre?: string;
  channel: string;
  moderacion: string;
}

// CasoList: paginated list of casos
export interface CasoList {
  items: Caso[];
  total: number;
  limit: number;
  offset: number;
  has_territory: boolean;
}

// CasoEvento: event/activity record on a caso
export interface CasoEvento {
  id: string;
  caso_id: string;
  tipo: string;
  texto?: string;
  evidencia_url?: string;
  actor_nombre?: string;
}

// CasoPanorama: aggregate dashboard view of casos
export interface CasoPanorama {
  kpis: {
    total: number;
    pendientes: number;
    en_proceso: number;
    atendidos: number;
    cerrados: number;
    sla_vencidos: number;
    tiempo_prom_dias: number;
  };
  por_estado: Record<string, number>;
  por_colonia: Array<{ colonia: string; count: number }>;
  por_responsable: Array<{ responsable: string; count: number }>;
}

// ============================================================================
// Forms API functions
// ============================================================================

export async function listForms(params: Record<string, string | number | undefined> = {}): Promise<FormDefinition[]> {
  return (await apiClient.get("/forms", { params })).data;
}

export async function getForm(id: string): Promise<FormDefinition> {
  return (await apiClient.get(`/forms/${id}`)).data;
}

export async function getFormBySlug(slug: string): Promise<FormDefinition> {
  return (await apiClient.get(`/forms/slug/${slug}`)).data;
}

export async function createForm(payload: Partial<FormDefinition>): Promise<FormDefinition> {
  return (await apiClient.post("/forms", payload)).data;
}

export async function updateForm(id: string, payload: Partial<FormDefinition>): Promise<FormDefinition> {
  return (await apiClient.patch(`/forms/${id}`, payload)).data;
}

export async function submitResponse(payload: Record<string, unknown>): Promise<FormResponsePayload> {
  return (await apiClient.post("/responses", payload)).data;
}

// ============================================================================
// Casos API functions
// ============================================================================

export async function listCasos(params: Record<string, string | number | undefined> = {}): Promise<CasoList> {
  return (await apiClient.get("/casos", { params })).data;
}

export async function getCaso(id: string): Promise<Caso> {
  return (await apiClient.get(`/casos/${id}`)).data;
}

export async function getCasoPanorama(): Promise<CasoPanorama> {
  return (await apiClient.get("/casos/panorama")).data;
}

export async function setCasoEstado(id: string, estado: string): Promise<Caso> {
  return (await apiClient.patch(`/casos/${id}/estado`, { estado })).data;
}

export async function asignarCaso(id: string, asignado_a: string): Promise<Caso> {
  return (await apiClient.patch(`/casos/${id}/asignar`, { asignado_a })).data;
}

export async function addEvento(id: string, evento: Record<string, unknown>): Promise<CasoEvento> {
  return (await apiClient.post(`/casos/${id}/eventos`, evento)).data;
}

export async function uploadCasoEvidencia(id: string, blob: Blob): Promise<Caso> {
  const fd = new FormData();
  fd.append("file", blob, "evidencia");
  return (await apiClient.post(`/casos/${id}/evidencia`, fd, {
    headers: { "Content-Type": "multipart/form-data" }
  })).data;
}

// ============================================================================
// Public Forms API functions (no authentication required)
// ============================================================================

export async function getPublicForm(slug: string): Promise<FormDefinition> {
  return (await apiClient.get(`/public/forms/${slug}`)).data;
}

export async function submitPublicResponse(slug: string, payload: Record<string, unknown>): Promise<FormResponsePayload> {
  return (await apiClient.post(`/public/forms/${slug}/responses`, payload)).data;
}
