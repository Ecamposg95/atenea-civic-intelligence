import { apiClient } from "./client";
import type { AuditPage } from "@/types/audit";

export async function getAudit(params: {
  limit?: number;
  offset?: number;
  action?: string;
} = {}): Promise<AuditPage> {
  const { data } = await apiClient.get<AuditPage>("/audit", { params });
  return data;
}
