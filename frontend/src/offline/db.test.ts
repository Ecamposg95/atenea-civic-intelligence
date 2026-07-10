import { describe, it, expect, beforeEach, vi } from "vitest";
import { openDB } from "idb";

describe("offline db migration v1→v2", () => {
  beforeEach(async () => {
    // Clear module cache to allow fresh getDb() calls
    vi.resetModules();
    // Delete agora-offline database to start clean
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("agora-offline");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // ignore errors, DB might not exist
      req.onblocked = () => {
        // If blocked, still resolve to proceed
        setTimeout(() => resolve(), 100);
      };
    });
  });

  it("migrates v1 registro_queue rows into v2 job_queue with kind and blobs", async () => {
    // Step 1: Create a v1 database with registro_queue store
    const v1db = await openDB("agora-offline", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("registro_queue")) {
          const store = db.createObjectStore("registro_queue", {
            keyPath: "client_uuid",
          });
          store.createIndex("by_status", "status");
          store.createIndex("by_created_at", "created_at");
        }
      },
    });

    // Step 2: Put v1 rows into registro_queue
    const now = Date.now();
    const v1Row1 = {
      client_uuid: "legacy-1",
      campaign_id: "camp-test",
      payload: { nombre_completo: "Ana", consentimiento: true },
      status: "queued" as const,
      created_at: now - 5000,
      attempts: 0,
      last_error: null,
      server_id: null,
    };
    const v1Row2 = {
      client_uuid: "legacy-2",
      campaign_id: "camp-test",
      payload: { nombre_completo: "Bob", consentimiento: false },
      status: "error" as const,
      created_at: now - 2000,
      attempts: 1,
      last_error: "Network timeout",
      server_id: null,
    };

    const tx = v1db.transaction("registro_queue", "readwrite");
    await tx.objectStore("registro_queue").put(v1Row1);
    await tx.objectStore("registro_queue").put(v1Row2);
    await tx.done;

    v1db.close();

    // Step 3: Import fresh db module and call getDb() which triggers v2 migration
    const { getDb } = await import("./db");
    const v2db = await getDb();

    // Step 4: Assert migration happened correctly
    // - job_queue contains migrated rows with kind and blobs
    const migratedRows = await v2db.getAll("job_queue");
    expect(migratedRows).toHaveLength(2);

    // Find each migrated row
    const migrated1 = migratedRows.find((r) => r.client_uuid === "legacy-1");
    const migrated2 = migratedRows.find((r) => r.client_uuid === "legacy-2");

    expect(migrated1).toBeDefined();
    expect(migrated1).toMatchObject({
      client_uuid: "legacy-1",
      campaign_id: "camp-test",
      payload: { nombre_completo: "Ana", consentimiento: true },
      status: "queued",
      created_at: now - 5000,
      attempts: 0,
      last_error: null,
      server_id: null,
      kind: "registro",
      blobs: [],
    });

    expect(migrated2).toBeDefined();
    expect(migrated2).toMatchObject({
      client_uuid: "legacy-2",
      campaign_id: "camp-test",
      payload: { nombre_completo: "Bob", consentimiento: false },
      status: "error",
      created_at: now - 2000,
      attempts: 1,
      last_error: "Network timeout",
      server_id: null,
      kind: "registro",
      blobs: [],
    });

    // Step 5: Assert registro_queue store is removed
    expect(v2db.objectStoreNames.contains("registro_queue")).toBe(false);
    expect(v2db.objectStoreNames.contains("job_queue")).toBe(true);

    v2db.close();
  });

  it("fresh v2 install opens with empty job_queue and no error", async () => {
    // Import fresh db module
    const { getDb } = await import("./db");

    // Open v2 database (no v1 to migrate)
    const db = await getDb();

    // Assert v2 schema is created cleanly
    expect(db.objectStoreNames.contains("job_queue")).toBe(true);
    expect(db.objectStoreNames.contains("registro_queue")).toBe(false);

    // Assert job_queue is empty
    const rows = await db.getAll("job_queue");
    expect(rows).toHaveLength(0);

    db.close();
  });

  it("v1 database with no registro_queue (edge case) opens v2 cleanly", async () => {
    // Create v1 database WITHOUT registro_queue (edge case)
    const v1db = await openDB("agora-offline", 1, {
      upgrade(_db) {
        // Don't create any stores — edge case
      },
    });
    v1db.close();

    // Import fresh db module and call getDb()
    const { getDb } = await import("./db");
    const v2db = await getDb();

    // Assert v2 created cleanly
    expect(v2db.objectStoreNames.contains("job_queue")).toBe(true);
    const rows = await v2db.getAll("job_queue");
    expect(rows).toHaveLength(0);

    v2db.close();
  });
});
