import { create } from "zustand";

import { countPending, countFailed } from "@/offline/queue";
import { drainQueue } from "@/offline/sync";

interface PendingSyncState {
  pending: number;
  /** Rows permanently rejected by the server (non-retryable 4xx). */
  failed: number;
  syncing: boolean;
  refresh: () => Promise<void>;
  triggerSync: () => Promise<void>;
}

export const usePendingSyncStore = create<PendingSyncState>((set, get) => ({
  pending: 0,
  failed: 0,
  syncing: false,

  refresh: async () => {
    const [count, failedCount] = await Promise.all([countPending(), countFailed()]);
    set({ pending: count, failed: failedCount });
  },

  triggerSync: async () => {
    set({ syncing: true });
    try {
      await drainQueue();
    } finally {
      set({ syncing: false });
      await get().refresh();
    }
  },
}));
