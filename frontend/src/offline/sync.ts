import type { RegistroCreate } from "@/api/registros";
import { createRegistro } from "@/api/registros";
import type { Militante, MilitanteCreate } from "@/api/militantes";
import { createMilitante, uploadDocumento } from "@/api/militantes";
import { submitResponse } from "@/api/atencion";
import type { JobKind, QueuedJob } from "./types";
import { listQueue, markStatus, removeQueued } from "./queue";

export type JobHandler = (job: QueuedJob) => Promise<void>;

export interface DrainDeps {
  handlers?: Partial<Record<JobKind, JobHandler>>;
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
 * Default per-kind handlers. A handler owns the full create+upload lifecycle
 * for its job kind; when it resolves without throwing, drainQueue treats the
 * row as fully synced and removes it from the queue (blobs go with it —
 * sensitive photo/signature data deleted from IndexedDB once it reaches the
 * server).
 *
 * Idempotency: every payload already carries `client_uuid` (stamped at
 * enqueue time). The backend create endpoints dedupe on it, so a row that
 * was created but whose success response was lost will NOT create a
 * duplicate on the next drain — the server returns/finds the existing record.
 */
/**
 * Every default handler pins its request(s) to the campaign the job was
 * captured under (`job.campaign_id`), NOT whatever campaign is active in
 * localStorage at drain time. Without this, a coordinator who captures
 * offline under campaign A, switches to campaign B, then reconnects would
 * have their queued rows created under B — the client.ts interceptor only
 * fills in X-Campaign-Id when the caller hasn't already set it, so passing
 * it explicitly here overrides the "currently active" campaign.
 */
function campaignConfig(job: QueuedJob) {
  return { headers: { "X-Campaign-Id": job.campaign_id } };
}

const DEFAULT_HANDLERS: Record<JobKind, JobHandler> = {
  registro: async (job) => {
    await createRegistro(job.payload as unknown as RegistroCreate, campaignConfig(job));
  },

  militante: async (job) => {
    const militante: Pick<Militante, "id"> = job.server_id
      ? { id: job.server_id }
      : await createMilitante(job.payload as unknown as MilitanteCreate, campaignConfig(job));
    // Persist server_id BEFORE uploading photos: if a photo upload throws and
    // this job is retried, we must not re-create the militante. createMilitante
    // is idempotent by client_uuid anyway, but skipping the re-create call
    // entirely once we have a server id is cleaner and cheaper.
    await markStatus(job.client_uuid, "syncing", { server_id: militante.id });
    for (const blob of job.blobs) {
      await uploadDocumento(militante.id, blob.slot as "frente" | "reverso" | "firma", blob.data, campaignConfig(job));
    }
  },

  response: async (job) => {
    // `server_id` is never set on a response job today (nothing downstream
    // persists one), so this guard is always true in practice. It's
    // forward-looking scaffolding: once evidence-blob upload (below) lands,
    // it lets a retry skip re-submitting a response that already succeeded.
    if (!job.server_id) {
      await submitResponse(job.payload, campaignConfig(job));
    }
    // TODO(T3): evidence-blob upload for `response` jobs. The only existing
    // evidence endpoint, `uploadCasoEvidencia(casoId, blob)`, is scoped to a
    // *caso*, not a form response — submitResponse()'s result exposes an
    // optional `caso_id`, but this queue row has no dedicated slot to persist
    // it across retries (reusing `server_id` for that would conflate "already
    // submitted" with "caso id", which isn't obviously safe). Until a
    // response-scoped evidence endpoint exists (or that design question is
    // resolved deliberately), blobs on `response` jobs are left un-uploaded
    // here rather than inventing behavior.
  },
};

/**
 * Walk the queue FIFO (queued + error rows), dispatch each row to the handler
 * registered for its `kind` (defaults merged with any injected overrides),
 * and update statuses based on the outcome.
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

  const handlers: Record<JobKind, JobHandler> = {
    ...DEFAULT_HANDLERS,
    ...deps?.handlers,
  };

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
        const handler = handlers[row.kind];
        await handler(row);
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
