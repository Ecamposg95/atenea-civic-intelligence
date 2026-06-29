import { describe, it, expect, beforeEach } from "vitest";
import { enqueue, listQueue, countPending } from "./queue";
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
});
