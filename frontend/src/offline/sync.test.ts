import { describe, it, expect, beforeEach } from "vitest";
import { enqueue, enqueueJob, listQueue, markStatus, countPending, countFailed } from "./queue";
import { getDb } from "./db";
import { drainQueue } from "./sync";
import type { QueuedBlob, QueuedJob } from "./types";

beforeEach(async () => {
  const db = await getDb();
  await db.clear("job_queue");
});

describe("sync engine", () => {
  it("drains queued rows and removes them on success", async () => {
    await enqueue({ nombre_completo: "A", consentimiento: true }, "c");
    await enqueue({ nombre_completo: "B", consentimiento: true }, "c");
    const registro = async () => {};
    const res = await drainQueue({ handlers: { registro } });
    expect(res.synced).toBe(2);
    expect(await listQueue()).toHaveLength(0);
  });

  it("keeps row as error on network failure and increments attempts", async () => {
    await enqueue({ nombre_completo: "A", consentimiento: true }, "c");
    const registro = async () => {
      throw Object.assign(new Error("Network"), { status: undefined });
    };
    const res = await drainQueue({ handlers: { registro } });
    expect(res.failed).toBe(1);
    const rows = await listQueue();
    expect(rows[0].status).toBe("error");
    expect(rows[0].attempts).toBe(1);
    expect(await countPending()).toBe(1); // will retry later
  });

  it("does not duplicate work when called concurrently", async () => {
    await enqueue({ nombre_completo: "A", consentimiento: true }, "c");
    let calls = 0;
    const registro = async () => {
      calls++;
    };
    await Promise.all([
      drainQueue({ handlers: { registro } }),
      drainQueue({ handlers: { registro } }),
    ]);
    expect(calls).toBe(1);
  });

  // (a) Stranded "syncing" reconciliation
  it("reconciles stranded syncing rows to queued and drains them", async () => {
    const q = await enqueue({ nombre_completo: "Stranded", consentimiento: true }, "c");
    // Simulate a crash mid-drain by leaving the row in "syncing"
    await markStatus(q.client_uuid, "syncing");
    const rows = await listQueue();
    expect(rows[0].status).toBe("syncing");

    let calls = 0;
    const registro = async () => {
      calls++;
    };

    const res = await drainQueue({ handlers: { registro } });
    // Should have been reconciled to "queued" and then successfully drained
    expect(calls).toBe(1);
    expect(res.synced).toBe(1);
    expect(await listQueue()).toHaveLength(0);
    expect(await countPending()).toBe(0);
  });

  // (b) Permanent 4xx → "failed", not retried, excluded from countPending, counted by countFailed
  it("marks rows as failed on permanent 4xx and excludes from countPending", async () => {
    await enqueue({ nombre_completo: "BadPayload", consentimiento: true }, "c");

    let callCount = 0;
    const registro = async () => {
      callCount++;
      throw Object.assign(new Error("Unprocessable Entity"), { status: 422 });
    };

    const res = await drainQueue({ handlers: { registro } });
    expect(res.failed).toBe(1);

    const rows = await listQueue();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].last_error).toBe("Unprocessable Entity");

    // Must NOT appear in countPending (not retried automatically)
    expect(await countPending()).toBe(0);
    // Must appear in countFailed
    expect(await countFailed()).toBe(1);

    // A subsequent drain must NOT retry the failed row
    const res2 = await drainQueue({ handlers: { registro } });
    expect(callCount).toBe(1); // handler called only once total
    expect(res2.synced).toBe(0);
    expect(res2.failed).toBe(0);

    // Row still "failed", still counted by countFailed
    expect(await countFailed()).toBe(1);
    expect(await countPending()).toBe(0);
  });

  // (c) Network/5xx errors stay "error" and are retried on the next drain
  it("retries error rows on subsequent drain (network/5xx)", async () => {
    await enqueue({ nombre_completo: "Retry", consentimiento: true }, "c");

    let attempt = 0;
    const registro = async () => {
      attempt++;
      if (attempt === 1) {
        // First call: simulate a 503 (retryable server error)
        throw Object.assign(new Error("Service Unavailable"), { status: 503 });
      }
      // Second call: success
    };

    // First drain — should fail with "error"
    const res1 = await drainQueue({ handlers: { registro } });
    expect(res1.failed).toBe(1);
    const rows1 = await listQueue();
    expect(rows1[0].status).toBe("error");
    expect(rows1[0].attempts).toBe(1);
    expect(await countPending()).toBe(1); // still retryable

    // Second drain — should succeed and remove the row
    const res2 = await drainQueue({ handlers: { registro } });
    expect(res2.synced).toBe(1);
    expect(await listQueue()).toHaveLength(0);
    expect(await countPending()).toBe(0);
    expect(await countFailed()).toBe(0);
  });

  // Per-kind dispatch (T3)
  it("dispatches registro-kind jobs to the registro handler", async () => {
    await enqueue({ nombre_completo: "A", consentimiento: true }, "c");
    let calledWith: QueuedJob | undefined;
    const registro = async (job: QueuedJob) => {
      calledWith = job;
    };
    const res = await drainQueue({ handlers: { registro } });
    expect(res.synced).toBe(1);
    expect(calledWith?.kind).toBe("registro");
  });

  it("dispatches militante-kind jobs (with blobs) to the militante handler", async () => {
    const blobs: QueuedBlob[] = [
      { slot: "frente", mime: "image/jpeg", filename: "frente.jpg", data: new Blob(["a"]) },
      { slot: "reverso", mime: "image/jpeg", filename: "reverso.jpg", data: new Blob(["b"]) },
    ];
    await enqueueJob("militante", { nombre_completo: "M", consentimiento: true }, "c", blobs);

    const calls: QueuedJob[] = [];
    const militante = async (job: QueuedJob) => {
      calls.push(job);
    };

    const res = await drainQueue({ handlers: { militante } });
    expect(res.synced).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe("militante");
    expect(calls[0].blobs).toHaveLength(2);
    expect(await listQueue()).toHaveLength(0);
  });

  it("keeps a militante row as error on network failure from its handler", async () => {
    await enqueueJob("militante", { nombre_completo: "M", consentimiento: true }, "c");
    const militante = async () => {
      throw Object.assign(new Error("Network"), { status: undefined });
    };
    const res = await drainQueue({ handlers: { militante } });
    expect(res.failed).toBe(1);
    const rows = await listQueue();
    expect(rows[0].status).toBe("error");
    expect(rows[0].attempts).toBe(1);
  });

  it("marks a militante row as failed on a permanent 4xx from its handler", async () => {
    await enqueueJob("militante", { nombre_completo: "M", consentimiento: true }, "c");
    const militante = async () => {
      throw Object.assign(new Error("Unprocessable Entity"), { status: 422 });
    };
    const res = await drainQueue({ handlers: { militante } });
    expect(res.failed).toBe(1);
    const rows = await listQueue();
    expect(rows[0].status).toBe("failed");
  });

  it("does not dispatch a registro job to the militante handler", async () => {
    await enqueue({ nombre_completo: "A", consentimiento: true }, "c");
    let militanteCalls = 0;
    let registroCalls = 0;
    const militante = async () => {
      militanteCalls++;
    };
    const registro = async () => {
      registroCalls++;
    };
    const res = await drainQueue({ handlers: { militante, registro } });
    expect(res.synced).toBe(1);
    expect(registroCalls).toBe(1);
    expect(militanteCalls).toBe(0);
  });
});
