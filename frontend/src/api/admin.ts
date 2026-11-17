import { apiClient } from "./client";
import type { AuditPage } from "@/types/audit";

// ── Reveal ───────────────────────────────────────────────────────────────────

export interface RevelarClaveResponse {
  registro_id: string;
  clave_elector: string;
  /** Decrypted CURP when stored (audited separately as registro.reveal_curp). */
  curp?: string | null;
}

// ── Query params ─────────────────────────────────────────────────────────────

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

export async function revelarClave(id: string): Promise<RevelarClaveResponse> {
  const { data } = await apiClient.post<RevelarClaveResponse>(
    `/admin/registros/${id}/revelar-clave`,
  );
  return data;
}

export interface RevelarClavesResponse {
  claves: Record<string, string>;
}

/** Batch reveal — audited server-side per id. Only ids with a stored clave
 * come back in the map (others are silently omitted, never a 404). */
export async function revelarClaves(registroIds: string[]): Promise<Record<string, string>> {
  const { data } = await apiClient.post<RevelarClavesResponse>(
    "/admin/registros/revelar-claves",
    { registro_ids: registroIds },
  );
  return data.claves;
}

export async function getAdminAuditoria(
  p: AdminAuditoriaParams = {},
): Promise<AuditPage> {
  const { data } = await apiClient.get<AuditPage>("/admin/auditoria", {
    params: p,
  });
  return data;
}
