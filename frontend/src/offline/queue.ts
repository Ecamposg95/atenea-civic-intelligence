import type { RegistroCreate } from "@/api/registros";
import type { QueuedRegistro, SyncStatus } from "./types";
import { getDb } from "./db";

export async function enqueue(
  payload: RegistroCreate,
  campaign_id: string
): Promise<QueuedRegistro> {
  const db = await getDb();
  const client_uuid = payload.client_uuid ?? crypto.randomUUID();
  const record: QueuedRegistro = {
    client_uuid,
    campaign_id,
    payload: { ...payload, client_uuid },
    status: "queued",
    created_at: Date.now(),
    attempts: 0,
    last_error: null,
    server_id: null,
  };
  await db.put("registro_queue", record);
  return record;
}

export async function listQueue(): Promise<QueuedRegistro[]> {
  const db = await getDb();
  return db.getAllFromIndex("registro_queue", "by_created_at");
}

export async function markStatus(
  uuid: string,
  status: SyncStatus,
  patch?: Partial<Pick<QueuedRegistro, "last_error" | "server_id" | "attempts">>
): Promise<void> {
  const db = await getDb();
  const existing = await db.get("registro_queue", uuid);
  if (!existing) return;
  const updated: QueuedRegistro = { ...existing, status, ...patch };
  await db.put("registro_queue", updated);
}

export async function removeQueued(uuid: string): Promise<void> {
  const db = await getDb();
  await db.delete("registro_queue", uuid);
}

export async function countPending(): Promise<number> {
  const all = await listQueue();
  return all.filter((r) => r.status === "queued" || r.status === "error").length;
}

export async function countFailed(): Promise<number> {
  const all = await listQueue();
  return all.filter((r) => r.status === "failed").length;
}
