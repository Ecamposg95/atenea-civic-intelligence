import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueue, enqueueJob, listQueue, markStatus, countPending, countFailed } from "./queue";
import { getDb } from "./db";
import { drainQueue } from "./sync";
import type { QueuedBlob, QueuedJob } from "./types";
import { createRegistro } from "@/api/registros";
import { createMilitante, uploadDocumento } from "@/api/militantes";
import type { Militante } from "@/api/militantes";
import { submitResponse } from "@/api/atencion";

vi.mock("@/api/registros", () => ({
  createRegistro: vi.fn(),
}));

vi.mock("@/api/militantes", () => ({
  createMilitante: vi.fn(),
  uploadDocumento: vi.fn(),
}));

vi.mock("@/api/atencion", () => ({
  submitResponse: vi.fn(),
}));

beforeEach(async () => {
  const db = await getDb();
  await db.clear("job_queue");
  vi.mocked(createRegistro).mockReset();
  vi.mocked(createMilitante).mockReset();
  vi.mocked(uploadDocumento).mockReset();
  vi.mocked(submitResponse).mockReset();
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

// These tests exercise the REAL DEFAULT_HANDLERS (no `deps.handlers` overrides
// injected), hitting the mocked `@/api/*` modules directly. This is the
// coverage the rest of the file is missing: every other test in this file
// replaces the handler under test, so the actual create->persist-server_id
// ->upload-blobs orchestration (and its retry/idempotency property) never ran.
describe("real default drain handlers", () => {
  it("militante retry does not re-create: server_id persists across a failed upload, and a second drain does not call createMilitante again", async () => {
    const blobs: QueuedBlob[] = [
      { slot: "frente", mime: "image/jpeg", filename: "frente.jpg", data: new Blob(["a"]) },
      { slot: "reverso", mime: "image/jpeg", filename: "reverso.jpg", data: new Blob(["b"]) },
    ];
    await enqueueJob("militante", { nombre_completo: "M", consentimiento: true }, "c", blobs);

    vi.mocked(createMilitante).mockResolvedValue({ id: "m1" } as unknown as Militante);

    // First invocation of uploadDocumento (the "frente" blob, first drain)
    // fails as a network error (status undefined); every later call succeeds.
    let uploadCallCount = 0;
    vi.mocked(uploadDocumento).mockImplementation(async () => {
      uploadCallCount++;
      if (uploadCallCount === 1) {
        throw Object.assign(new Error("Network"), { status: undefined });
      }
      return {} as unknown as Militante;
    });

    // First drain: createMilitante succeeds, first blob upload throws ->
    // handler rejects -> row ends "error" (retryable), but server_id from the
    // create call was already persisted before the loop touched the blobs.
    const res1 = await drainQueue();
    expect(res1.synced).toBe(0);
    expect(res1.failed).toBe(1);
    const rows1 = await listQueue();
    expect(rows1).toHaveLength(1);
    expect(rows1[0].status).toBe("error");
    expect(rows1[0].server_id).toBe("m1");
    expect(createMilitante).toHaveBeenCalledTimes(1);

    // Second drain (uploadDocumento now succeeds for every call): job
    // completes and is removed. createMilitante must NOT be called again --
    // the persisted server_id short-circuits re-creation.
    const res2 = await drainQueue();
    expect(res2.synced).toBe(1);
    expect(res2.failed).toBe(0);
    expect(await listQueue()).toHaveLength(0);
    expect(createMilitante).toHaveBeenCalledTimes(1);

    // uploadDocumento was ultimately called for both blobs (frente was
    // retried, reverso only needed the one successful attempt).
    const uploadedSlots = vi.mocked(uploadDocumento).mock.calls.map((c) => c[1]);
    expect(uploadedSlots).toContain("frente");
    expect(uploadedSlots).toContain("reverso");
  });

  it("militante happy path: creates once and uploads both blobs in a single drain", async () => {
    const blobs: QueuedBlob[] = [
      { slot: "frente", mime: "image/jpeg", filename: "frente.jpg", data: new Blob(["a"]) },
      { slot: "reverso", mime: "image/jpeg", filename: "reverso.jpg", data: new Blob(["b"]) },
    ];
    await enqueueJob("militante", { nombre_completo: "M", consentimiento: true }, "c", blobs);

    vi.mocked(createMilitante).mockResolvedValue({ id: "m2" } as unknown as Militante);
    vi.mocked(uploadDocumento).mockResolvedValue({} as unknown as Militante);

    const res = await drainQueue();
    expect(res.synced).toBe(1);
    expect(await listQueue()).toHaveLength(0);

    expect(createMilitante).toHaveBeenCalledTimes(1);
    expect(uploadDocumento).toHaveBeenCalledTimes(2);
    expect(uploadDocumento).toHaveBeenNthCalledWith(
      1, "m2", "frente", blobs[0].data,
      { headers: { "X-Campaign-Id": "c" } },
    );
    expect(uploadDocumento).toHaveBeenNthCalledWith(
      2, "m2", "reverso", blobs[1].data,
      { headers: { "X-Campaign-Id": "c" } },
    );
  });

  it("dispatches response-kind jobs to submitResponse and removes the row on success", async () => {
    const job = await enqueueJob("response", { form_id: "f1", answers: { q1: "a" } }, "c");

    vi.mocked(submitResponse).mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof submitResponse>>
    );

    const res = await drainQueue();
    expect(res.synced).toBe(1);
    expect(submitResponse).toHaveBeenCalledTimes(1);
    expect(submitResponse).toHaveBeenCalledWith(job.payload, { headers: { "X-Campaign-Id": "c" } });
    expect(await listQueue()).toHaveLength(0);
  });

  it("dispatches registro-kind jobs to the real createRegistro handler", async () => {
    const job = await enqueue({ nombre_completo: "A", consentimiento: true }, "c");

    vi.mocked(createRegistro).mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof createRegistro>>
    );

    const res = await drainQueue();
    expect(res.synced).toBe(1);
    expect(createRegistro).toHaveBeenCalledTimes(1);
    expect(createRegistro).toHaveBeenCalledWith(job.payload, { headers: { "X-Campaign-Id": "c" } });
    expect(await listQueue()).toHaveLength(0);
  });
});

// Cross-cutting bug fix: the drain must pin each request to the campaign the
// job was CAPTURED under (`job.campaign_id`), not whatever campaign happens
// to be active (localStorage["agora-campaign"]) at drain time. Otherwise a
// coordinator who captures offline under campaign A, switches to campaign B,
// then reconnects gets their entities created under B.
describe("drain pins requests to the job's campaign, not the active one", () => {
  // The test environment runs in node (no `localStorage` global), and these
  // handlers are exercised with `createRegistro`/`createMilitante`/
  // `uploadDocumento` mocked directly — the real `client.ts` interceptor
  // (which reads `localStorage["agora-campaign"]`) never runs in this test.
  // So instead of setting localStorage, we assert directly on what the
  // mocked API fns were called with: the job's OWN campaign_id ("camp-A"),
  // which must win even though a different campaign ("camp-B") is meant to
  // be "active" — i.e. the drain must never rely on whatever is currently in
  // localStorage.

  it("registro handler pins X-Campaign-Id to the job's campaign", async () => {
    const job = await enqueue({ nombre_completo: "A", consentimiento: true }, "camp-A");

    vi.mocked(createRegistro).mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof createRegistro>>
    );

    const res = await drainQueue();
    expect(res.synced).toBe(1);
    expect(createRegistro).toHaveBeenCalledWith(
      job.payload,
      { headers: { "X-Campaign-Id": "camp-A" } },
    );
  });

  it("militante handler pins X-Campaign-Id (create + uploads) to the job's campaign", async () => {
    const blobs: QueuedBlob[] = [
      { slot: "frente", mime: "image/jpeg", filename: "frente.jpg", data: new Blob(["a"]) },
    ];
    await enqueueJob("militante", { nombre_completo: "M", consentimiento: true }, "camp-A", blobs);

    vi.mocked(createMilitante).mockResolvedValue({ id: "m3" } as unknown as Militante);
    vi.mocked(uploadDocumento).mockResolvedValue({} as unknown as Militante);

    const res = await drainQueue();
    expect(res.synced).toBe(1);
    expect(createMilitante).toHaveBeenCalledWith(
      expect.anything(),
      { headers: { "X-Campaign-Id": "camp-A" } },
    );
    expect(uploadDocumento).toHaveBeenCalledWith(
      "m3", "frente", blobs[0].data,
      { headers: { "X-Campaign-Id": "camp-A" } },
    );
  });
});
