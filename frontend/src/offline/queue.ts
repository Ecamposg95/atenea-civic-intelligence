import type { QueuedBlob, QueuedJob, JobKind, SyncStatus } from "./types";
import { getDb } from "./db";

export async function enqueueJob(
  kind: JobKind,
  payload: Record<string, unknown>,
  campaign_id: string,
  blobs: QueuedBlob[] = []
): Promise<QueuedJob> {
  const db = await getDb();
  const client_uuid = (payload.client_uuid as string | undefined) ?? crypto.randomUUID();
  const record: QueuedJob = {
    client_uuid,
    kind,
    campaign_id,
    payload: { ...payload, client_uuid },
    blobs,
    status: "queued",
    created_at: Date.now(),
    attempts: 0,
    last_error: null,
    server_id: null,
  };
  await db.put("job_queue", record);
  return record;
}

/** Back-compat wrapper: capture flow keeps calling `enqueue(payload, campaignId)`. */
export async function enqueue(
  payload: Record<string, unknown>,
  campaign_id: string
): Promise<QueuedJob> {
  return enqueueJob("registro", payload, campaign_id);
}

export async function listQueue(): Promise<QueuedJob[]> {
  const db = await getDb();
  return db.getAllFromIndex("job_queue", "by_created_at");
}

export async function markStatus(
  uuid: string,
  status: SyncStatus,
  patch?: Partial<Pick<QueuedJob, "last_error" | "server_id" | "attempts">>
): Promise<void> {
  const db = await getDb();
  const existing = await db.get("job_queue", uuid);
  if (!existing) return;
  const updated: QueuedJob = { ...existing, status, ...patch };
  await db.put("job_queue", updated);
}

export async function removeQueued(uuid: string): Promise<void> {
  const db = await getDb();
  await db.delete("job_queue", uuid);
}

export async function countPending(): Promise<number> {
  const all = await listQueue();
  return all.filter((r) => r.status === "queued" || r.status === "error").length;
}

export async function countFailed(): Promise<number> {
  const all = await listQueue();
  return all.filter((r) => r.status === "failed").length;
}
