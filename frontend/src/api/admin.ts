import { apiClient } from "./client";
import type { AuditPage } from "@/types/audit";

// ── AdminRegistro ────────────────────────────────────────────────────────────
// Mirrors AdminRegistroRead (backend/app/schemas/admin.py)

export interface AdminRegistro {
  id: string;
  organization_id: string | null;
  organization_name: string | null;
  campaign_id: string;
  activista_id: string | null;
  activista_nombre: string | null;
  lider_id: string | null;
  lider_nombre: string | null;
  nombre_completo: string;
  seccion: string | null;
  colonia: string | null;
  area: string | null;
  telefono: string | null;
  clave_masked: string | null;
  consentimiento: boolean;
  consentimiento_at: string | null;
  created_at: string;
}

export interface AdminRegistroList {
  items: AdminRegistro[];
  total: number;
  limit: number;
  offset: number;
}

// ── Metrics ──────────────────────────────────────────────────────────────────
// Mirrors MetricBucket + DailyPoint + MetricsRead (backend/app/schemas/admin.py)

export interface MetricBucket {
  label: string;
  count: number;
}

export interface DailyPoint {
  date: string; // ISO date e.g. "2027-03-01"
  count: number;
}

export interface MetricsRead {
  total: number;
  by_lider: MetricBucket[];
  by_activista: MetricBucket[];
  by_seccion: MetricBucket[];
  by_day: DailyPoint[];
}

// ── Estructura ───────────────────────────────────────────────────────────────
// Mirrors EstructuraActivista + EstructuraNode (backend/app/schemas/admin.py)

export interface EstructuraActivista {
  id: string;
  full_name: string;
  email: string;
  seccion: string | null;
  count: number; // registros captured
}

export interface EstructuraNode {
  id: string;
  full_name: string;
  email: string;
  seccion: string | null;
  total: number; // rollup: sum of activistas' counts + líder's own
  activistas: EstructuraActivista[];
}

// ── Reveal ───────────────────────────────────────────────────────────────────

export interface RevelarClaveResponse {
  registro_id: string;
  clave_elector: string;
}

// ── Query params ─────────────────────────────────────────────────────────────

export interface AdminRegistrosParams {
  q?: string;
  lider_id?: string;
  activista_id?: string;
  seccion?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface AdminAuditoriaParams {
  limit?: number;
  offset?: number;
  action?: string;
  actor?: string;
  entity_type?: string;
  since?: string;
  until?: string;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getAdminRegistros(
  p: AdminRegistrosParams,
): Promise<AdminRegistroList> {
  const { data } = await apiClient.get<AdminRegistroList>("/admin/registros", {
    params: p,
  });
  return data;
}

export async function getMetricas(): Promise<MetricsRead> {
  const { data } = await apiClient.get<MetricsRead>("/admin/metricas");
  return data;
}

export async function getEstructura(): Promise<EstructuraNode[]> {
  const { data } = await apiClient.get<EstructuraNode[]>("/admin/estructura");
  return data;
}

export async function revelarClave(id: string): Promise<RevelarClaveResponse> {
  const { data } = await apiClient.post<RevelarClaveResponse>(
    `/admin/registros/${id}/revelar-clave`,
  );
  return data;
}

export async function getAdminAuditoria(
  p: AdminAuditoriaParams = {},
): Promise<AuditPage> {
  const { data } = await apiClient.get<AuditPage>("/admin/auditoria", {
    params: p,
  });
  return data;
}
