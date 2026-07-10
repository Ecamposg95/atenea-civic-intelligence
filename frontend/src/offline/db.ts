import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { QueuedJob } from "./types";

export interface AgoraDBSchema {
  job_queue: QueuedJob;
}

export type AgoraDB = IDBPDatabase<AgoraDBSchema>;

let _db: AgoraDB | null = null;

export async function getDb(): Promise<AgoraDB> {
  if (_db) return _db;
  _db = await openDB<AgoraDBSchema>("agora-offline", 2, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      if (!db.objectStoreNames.contains("job_queue")) {
        const store = db.createObjectStore("job_queue", {
          keyPath: "client_uuid",
        });
        store.createIndex("by_status", "status");
        store.createIndex("by_created_at", "created_at");
      }
      if (oldVersion < 2 && db.objectStoreNames.contains("registro_queue")) {
        // "registro_queue" predates AgoraDBSchema (v1 store, dropped below),
        // so it isn't a valid StoreNames<AgoraDBSchema> member — cast the name.
        const legacyStore = tx.objectStore("registro_queue" as "job_queue");
        const old = (await legacyStore.getAll()) as unknown as Array<
          Omit<QueuedJob, "kind" | "blobs">
        >;
        const jobs = tx.objectStore("job_queue");
        for (const row of old) {
          await jobs.put({ ...row, kind: "registro", blobs: [] });
        }
        db.deleteObjectStore("registro_queue");
      }
    },
  });
  return _db;
}
