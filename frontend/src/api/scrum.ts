import { apiClient } from "./client";
import type { Minuta } from "./minutas";

export interface Sprint {
  id: string; nombre: string; objetivo?: string;
  fecha_inicio: string; fecha_fin: string; estado: string; created_at: string;
}
export interface Task {
  id: string; work_item_id: string; texto: string; done: boolean; orden: number;
  responsable_id?: string; responsable_nombre?: string;
}
export interface WorkItem {
  id: string; titulo: string; descripcion?: string; tipo: string;
  story_points?: number; estado: string; prioridad: string; orden: number;
  sprint_id?: string; responsable_id?: string; responsable_nombre?: string;
  origin_acuerdo_id?: string; completed_at?: string; created_at: string;
  tareas: Task[]; tareas_total: number; tareas_hechas: number;
}
export interface Board {
  sprint: Sprint | null;
  POR_HACER: WorkItem[]; EN_CURSO: WorkItem[]; HECHO: WorkItem[];
}
interface Page<T> { items: T[]; total: number; limit: number; offset: number; }

export const listSprints = async (params?: Record<string, string | number>) =>
  (await apiClient.get<Page<Sprint>>("/sprints", { params })).data;
export const getSprint = async (id: string) => (await apiClient.get<Sprint>(`/sprints/${id}`)).data;
export const createSprint = async (p: Partial<Sprint>) => (await apiClient.post<Sprint>("/sprints", p)).data;
export const updateSprint = async (id: string, p: Partial<Sprint>) => (await apiClient.patch<Sprint>(`/sprints/${id}`, p)).data;
export const deleteSprint = async (id: string) => { await apiClient.delete(`/sprints/${id}`); };
export const activarSprint = async (id: string) => (await apiClient.post<Sprint>(`/sprints/${id}/activar`)).data;
export const cerrarSprint = async (id: string) => (await apiClient.post<Sprint>(`/sprints/${id}/cerrar`)).data;

export const getTablero = async () => (await apiClient.get<Board>("/tablero")).data;
export const listWorkitems = async (params?: Record<string, string | number>) =>
  (await apiClient.get<Page<WorkItem>>("/workitems", { params })).data;
export const getWorkitem = async (id: string) => (await apiClient.get<WorkItem>(`/workitems/${id}`)).data;
export const createWorkitem = async (p: Partial<WorkItem>) => (await apiClient.post<WorkItem>("/workitems", p)).data;

export interface WorkItemPatch {
  titulo?: string;
  descripcion?: string | null;
  tipo?: string;
  story_points?: number | null;
  prioridad?: string;
  orden?: number;
  sprint_id?: string | null;
  responsable_id?: string | null;
}
export const updateWorkitem = async (id: string, p: WorkItemPatch) => (await apiClient.patch<WorkItem>(`/workitems/${id}`, p)).data;
export const moverEstado = async (id: string, estado: string) => (await apiClient.patch<WorkItem>(`/workitems/${id}/estado`, { estado })).data;
export const deleteWorkitem = async (id: string) => { await apiClient.delete(`/workitems/${id}`); };
export const addTask = async (wid: string, p: { texto: string; responsable_id?: string; orden?: number }) =>
  (await apiClient.post<Task>(`/workitems/${wid}/tareas`, p)).data;
export const updateTask = async (wid: string, tid: string, p: Partial<Task>) =>
  (await apiClient.patch<Task>(`/workitems/${wid}/tareas/${tid}`, p)).data;
export const deleteTask = async (wid: string, tid: string) => { await apiClient.delete(`/workitems/${wid}/tareas/${tid}`); };
export const convertirAcuerdo = async (mid: string, aid: string) =>
  (await apiClient.post<WorkItem>(`/minutas/${mid}/acuerdos/${aid}/convertir`)).data;

// ── Métricas + ceremonias ──
export interface SprintMetrics {
  comprometido: number;
  completado: number;
  historias_total: number;
  historias_hechas: number;
  por_estado: Record<string, number>;
  sin_estimar: number;
}
export interface VelocidadPunto { sprint_id: string; nombre: string; fecha_fin: string; velocidad: number; }
export interface BurndownDia { fecha: string; restante: number; ideal: number; }
export interface Burndown { total_puntos: number; dias: BurndownDia[]; }

export const getSprintMetrics = async (id: string) => (await apiClient.get<SprintMetrics>(`/sprints/${id}/metrics`)).data;
export const getVelocidad = async (n = 6) => (await apiClient.get<VelocidadPunto[]>("/scrum/velocidad", { params: { n } })).data;
export const getBurndown = async (id: string) => (await apiClient.get<Burndown>(`/sprints/${id}/burndown`)).data;
export const listCeremonias = async (id: string) => (await apiClient.get<Page<Minuta>>(`/sprints/${id}/ceremonias`)).data;
export const crearCeremonia = async (id: string, p: { titulo: string; fecha: string; tipo: string; lugar?: string; cuerpo?: string }) =>
  (await apiClient.post<Minuta>(`/sprints/${id}/ceremonias`, p)).data;
