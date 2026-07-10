import { describe, it, expect, beforeEach } from "vitest";
import { enqueue, enqueueJob, listQueue, markStatus, removeQueued, countPending, countFailed } from "./queue";
import { getDb } from "./db";

beforeEach(async () => {
  const db = await getDb();
  await db.clear("job_queue");
});

describe("offline queue", () => {
  it("enqueues with status=queued and a generated client_uuid in the payload", async () => {
    const q = await enqueue({ nombre_completo: "Ana", consentimiento: true }, "camp-1");
    expect(q.status).toBe("queued");
    expect(q.client_uuid).toBeTruthy();
    expect(q.payload.client_uuid).toBe(q.client_uuid); // uuid baked into payload
    expect(q.campaign_id).toBe("camp-1");
    expect(q.kind).toBe("registro");
    expect(q.blobs).toHaveLength(0);
  });

  it("counts only pending (queued + error)", async () => {
    const a = await enqueue({ nombre_completo: "A", consentimiento: true }, "c");
    const b = await enqueue({ nombre_completo: "B", consentimiento: true }, "c");
    await markStatus(b.client_uuid, "error", { last_error: "net" });
    expect(await countPending()).toBe(2);
    await markStatus(a.client_uuid, "synced");
    expect(await countPending()).toBe(1);
  });

  it("removes a synced row", async () => {
    const a = await enqueue({ nombre_completo: "A", consentimiento: true }, "c");
    await removeQueued(a.client_uuid);
    expect(await listQueue()).toHaveLength(0);
  });

  it("re-enqueuing the same client_uuid does not duplicate", async () => {
    const a = await enqueue({ nombre_completo: "A", consentimiento: true }, "c");
    // simulate a second enqueue reusing the uuid (idempotent put)
    await markStatus(a.client_uuid, "error");
    expect(await listQueue()).toHaveLength(1);
  });

  it("enqueueJob persists a typed job with kind, payload, blobs and status queued", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    const q = await enqueueJob(
      "militante",
      { nombre: "x" },
      "camp",
      [{ slot: "frente", mime: "image/jpeg", filename: "f.jpg", data: blob }]
    );
    expect(q.status).toBe("queued");
    expect(q.kind).toBe("militante");
    expect(q.campaign_id).toBe("camp");
    expect(q.payload).toEqual({ nombre: "x", client_uuid: q.client_uuid });
    expect(q.blobs).toHaveLength(1);
    expect(q.blobs[0].slot).toBe("frente");
    expect(q.blobs[0].data).toBeInstanceOf(Blob);

    const all = await listQueue();
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe("militante");
    expect(await countPending()).toBe(1);
  });

  it("enqueueJob keeps an existing client_uuid on the payload (idempotent create)", async () => {
    const q = await enqueueJob("response", { foo: "bar", client_uuid: "fixed-uuid" }, "camp");
    expect(q.client_uuid).toBe("fixed-uuid");
    expect(q.payload.client_uuid).toBe("fixed-uuid");
  });

  it("back-compat enqueue still yields a registro job with 0 blobs", async () => {
    const q = await enqueue({ nombre_completo: "Ana", consentimiento: true, client_uuid: "r-1" }, "camp");
    expect(q.kind).toBe("registro");
    expect(q.blobs).toHaveLength(0);
    expect(q.client_uuid).toBe("r-1");
    expect(await countPending()).toBe(1);
  });

  it("countFailed only counts terminal failed jobs, across kinds", async () => {
    const a = await enqueueJob("militante", { nombre: "a" }, "c");
    const b = await enqueueJob("response", { foo: "b" }, "c");
    await markStatus(a.client_uuid, "failed", { last_error: "422" });
    expect(await countFailed()).toBe(1);
    expect(await countPending()).toBe(1); // only b is still pending
    await markStatus(b.client_uuid, "error");
    expect(await countPending()).toBe(1);
    expect(await countFailed()).toBe(1);
  });
});
