import type { Registro, RegistroCreate } from "@/api/registros";
import { createRegistro } from "@/api/registros";
import { listQueue, markStatus, removeQueued } from "./queue";

type CreateFn = (payload: RegistroCreate) => Promise<Registro>;

export interface DrainDeps {
  create?: CreateFn;
}

export interface DrainResult {
  synced: number;
  failed: number;
}

/**
 * True while a drain is in progress. Module-level guard prevents concurrent
 * drains from double-processing the same rows.
 */
let draining = false;

/**
 * True when the error originated from a network/transport failure rather than
 * an HTTP response. The client.ts interceptor leaves `status` undefined on
 * network failures (no response received at all).
 */
export function isNetworkError(e: unknown): boolean {
  return (e as Error & { status?: number }).status === undefined;
}

/**
 * Non-recoverable client errors: 4xx except 408 (Request Timeout) and
 * 429 (Too Many Requests), which are transient and worth retrying.
 */
function isPermanentClientError(status: number | undefined): boolean {
  if (status === undefined) return false;
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * Walk the queue FIFO (queued + error rows), attempt to POST each record to
 * the server via the injected `create` function, and update statuses.
 *
 * Idempotency: each row's payload already carries `client_uuid` (stamped at
 * enqueue time). The backend deduplicates by (campaign, activista, client_uuid),
 * so a row that was synced but whose success response was lost will NOT create
 * a duplicate on the next drain — the server returns the existing record.
 *
 * Retry vs permanent:
 *   - Network errors (status === undefined) and 5xx / 408 / 429 → mark "error",
 *     keep attempts++ so the UI can show retries. Will be retried next drain.
 *   - 4xx non-transient (401, 403, 422, …) → mark "failed" (terminal). The row
 *     is excluded from future drains and from countPending(); surfaced via
 *     countFailed() so the user can act on it.
 *
 * Crash recovery (Fix 1):
 *   Any row left in "syncing" state from a previous crashed drain is reconciled
 *   back to "queued" before the drain begins, so it is not silently skipped.
 */
export async function drainQueue(deps?: DrainDeps): Promise<DrainResult> {
  if (draining) return { synced: 0, failed: 0 };
  draining = true;

  const create: CreateFn = deps?.create ?? createRegistro;
  let synced = 0;
  let failed = 0;

  try {
    // Fix 1: Reconcile stranded "syncing" rows back to "queued" so they are
    // not silently skipped if the app crashed mid-drain previously.
    const allRows = await listQueue();
    for (const row of allRows) {
      if (row.status === "syncing") {
        await markStatus(row.client_uuid, "queued");
      }
    }

    const rows = await listQueue();
    const pending = rows.filter(
      (r) => r.status === "queued" || r.status === "error",
    );

    for (const row of pending) {
      await markStatus(row.client_uuid, "syncing");
      try {
        // payload.client_uuid is baked in at enqueue — backend deduplicates on it
        await create(row.payload);
        await removeQueued(row.client_uuid);
        synced++;
      } catch (e) {
        const err = e as Error & { status?: number };
        const msg = err.message ?? "Unknown error";
        if (isPermanentClientError(err.status)) {
          // Fix 2: Terminal failure — permanent 4xx (e.g. 422 invalid payload).
          // Do NOT increment attempts; do NOT auto-retry. Surfaced via countFailed().
          await markStatus(row.client_uuid, "failed", {
            last_error: msg,
          });
        } else {
          // Network errors, 5xx, 408, 429 → retryable "error"
          await markStatus(row.client_uuid, "error", {
            last_error: msg,
            attempts: row.attempts + 1,
          });
        }
        failed++;
      }
    }
  } finally {
    draining = false;
  }

  return { synced, failed };
}

export { isPermanentClientError };
