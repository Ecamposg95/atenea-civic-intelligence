import { describe, it, expect, beforeEach } from "vitest";
import { enqueue, listQueue, markStatus, countPending, countFailed } from "./queue";
import { getDb } from "./db";
import { drainQueue } from "./sync";

beforeEach(async () => {
  const db = await getDb();
  await db.clear("registro_queue");
});

describe("sync engine", () => {
  it("drains queued rows and removes them on success", async () => {
    await enqueue({ nombre_completo: "A", consentimiento: true }, "c");
    await enqueue({ nombre_completo: "B", consentimiento: true }, "c");
    const create = async (p: any) => ({ id: "srv-" + p.client_uuid, ...p });
    const res = await drainQueue({ create: create as any });
    expect(res.synced).toBe(2);
    expect(await listQueue()).toHaveLength(0);
  });

  it("keeps row as error on network failure and increments attempts", async () => {
    await enqueue({ nombre_completo: "A", consentimiento: true }, "c");
    const create = async () => {
      throw Object.assign(new Error("Network"), { status: undefined });
    };
    const res = await drainQueue({ create: create as any });
    expect(res.failed).toBe(1);
    const rows = await listQueue();
    expect(rows[0].status).toBe("error");
    expect(rows[0].attempts).toBe(1);
    expect(await countPending()).toBe(1); // will retry later
  });

  it("does not duplicate work when called concurrently", async () => {
    await enqueue({ nombre_completo: "A", consentimiento: true }, "c");
    let calls = 0;
    const create = async (p: any) => {
      calls++;
      return { id: "x", ...p };
    };
    await Promise.all([
      drainQueue({ create: create as any }),
      drainQueue({ create: create as any }),
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
    const create = async (p: any) => {
      calls++;
      return { id: "srv-" + p.client_uuid, ...p };
    };

    const res = await drainQueue({ create: create as any });
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
    const create = async () => {
      callCount++;
      throw Object.assign(new Error("Unprocessable Entity"), { status: 422 });
    };

    const res = await drainQueue({ create: create as any });
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
    const res2 = await drainQueue({ create: create as any });
    expect(callCount).toBe(1); // create called only once total
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
    const create = async (p: any) => {
      attempt++;
      if (attempt === 1) {
        // First call: simulate a 503 (retryable server error)
        throw Object.assign(new Error("Service Unavailable"), { status: 503 });
      }
      // Second call: success
      return { id: "srv-" + p.client_uuid, ...p };
    };

    // First drain — should fail with "error"
    const res1 = await drainQueue({ create: create as any });
    expect(res1.failed).toBe(1);
    const rows1 = await listQueue();
    expect(rows1[0].status).toBe("error");
    expect(rows1[0].attempts).toBe(1);
    expect(await countPending()).toBe(1); // still retryable

    // Second drain — should succeed and remove the row
    const res2 = await drainQueue({ create: create as any });
    expect(res2.synced).toBe(1);
    expect(await listQueue()).toHaveLength(0);
    expect(await countPending()).toBe(0);
    expect(await countFailed()).toBe(0);
  });
});
