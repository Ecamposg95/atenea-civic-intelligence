export interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  organization_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}
