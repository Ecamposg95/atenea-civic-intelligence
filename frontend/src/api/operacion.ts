import { apiClient } from "./client";

export interface PlanRow {
  seccion: string;
  electoral: {
    margen: number | null;
    prioridad: string | null;
    participacion: number | null;
    persuadible: boolean;
  };
  plan: {
    responsable_id: string | null;
    responsable_nombre: string | null;
    problema_dominante: string | null;
    liderazgo: string | null;
    meta_semanal: number | null;
    meta_sugerida: number;
    prioridad_operativa: string | null;
    notas: string | null;
  };
  avance: { promovidos: number; meta: number | null; pct: number | null };
}

export interface PlanUpdate {
  responsable_id?: string | null;
  problema_dominante?: string | null;
  liderazgo?: string | null;
  meta_semanal?: number | null;
  prioridad_operativa?: string | null;
  notas?: string | null;
}

export interface AgendaItem {
  id: string;
  fase: number;
  titulo: string;
  descripcion: string | null;
  done: boolean;
  orden: number;
}

export interface SemaforoRow {
  seccion: string;
  prioridad: string | null;
  persuadible: boolean;
  meta: number;
  promovidos: number;
  pct: number;
  status: "verde" | "ambar" | "rojo";
}

export interface Seguimiento {
  resumen: {
    secciones: number;
    meta_total: number;
    promovidos_total: number;
    pct_global: number | null;
    en_riesgo: number;
    al_dia: number;
  };
  tendencia: { semana: string; promovidos: number }[];
  semaforo: SemaforoRow[];
  alertas: (SemaforoRow & { faltan: number })[];
}

export async function getSeguimiento(): Promise<Seguimiento> {
  return (await apiClient.get("/operacion/seguimiento")).data;
}

export async function getPlanes(): Promise<PlanRow[]> {
  return (await apiClient.get("/operacion/planes")).data;
}

export async function upsertPlan(seccion: string, data: PlanUpdate): Promise<void> {
  await apiClient.put(`/operacion/planes/${seccion}`, data);
}

export async function getAgenda(): Promise<AgendaItem[]> {
  return (await apiClient.get("/operacion/agenda")).data;
}

export async function createAgendaItem(
  fase: number,
  titulo: string,
  descripcion?: string,
): Promise<AgendaItem> {
  return (await apiClient.post("/operacion/agenda", { fase, titulo, descripcion })).data;
}

export async function updateAgendaItem(
  id: string,
  data: Partial<Pick<AgendaItem, "titulo" | "descripcion" | "done" | "orden">>,
): Promise<AgendaItem> {
  return (await apiClient.patch(`/operacion/agenda/${id}`, data)).data;
}
