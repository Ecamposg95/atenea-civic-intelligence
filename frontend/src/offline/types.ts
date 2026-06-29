import type { RegistroCreate } from "@/api/registros";

export type SyncStatus = "queued" | "syncing" | "synced" | "error" | "failed";

export interface QueuedRegistro {
  client_uuid: string;
  campaign_id: string;
  payload: RegistroCreate;
  status: SyncStatus;
  created_at: number;
  attempts: number;
  last_error: string | null;
  server_id: string | null;
}
