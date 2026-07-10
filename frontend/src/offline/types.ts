export type SyncStatus = "queued" | "syncing" | "synced" | "error" | "failed";

export type JobKind = "registro" | "militante" | "response";

export interface QueuedBlob {
  slot: string;
  mime: string;
  filename: string;
  data: Blob;
}

export interface QueuedJob {
  client_uuid: string;
  kind: JobKind;
  campaign_id: string;
  payload: Record<string, unknown>;
  blobs: QueuedBlob[];
  status: SyncStatus;
  created_at: number;
  attempts: number;
  last_error: string | null;
  server_id: string | null;
}
