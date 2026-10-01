import { create } from "zustand";

export interface Campaign {
  id: string;
  name: string;
  cycle: string;
  status: string;
  license_tier: string;
  municipio_code?: string | null;
  candidato?: string | null;
  partido?: string | null;
}

/** Key for the active campaign UUID (read by the API client interceptor). */
const STORAGE_KEY = "agora-campaign";
/**
 * Separate flag that records whether the user has ever made a deliberate
 * campaign selection (including "consolidated / all bases").  This lets
 * setCampaigns distinguish "first load – pick a default" from "user already
 * chose consolidated – do NOT override with list[0]".
 */
const INIT_KEY = "agora-campaign-init";

function readInitialState(): { id: string | null; initialized: boolean } {
  try {
    const initialized = localStorage.getItem(INIT_KEY) === "1";
    const id = localStorage.getItem(STORAGE_KEY) ?? null;
    return { id, initialized };
  } catch {
    /* ignore */
  }
  return { id: null, initialized: false };
}

function persistId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      // Remove so the API-client interceptor doesn't send a stale header.
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function persistInitialized(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(INIT_KEY, "1");
    } else {
      localStorage.removeItem(INIT_KEY);
    }
  } catch {
    /* ignore */
  }
}

interface CampaignState {
  activeId: string | null;
  campaigns: Campaign[];
  /** True once the user (or setCampaigns on first load) has committed a choice. */
  initialized: boolean;
  setActive: (id: string) => void;
  /** Superadmin: explicitly switch to consolidated (all-bases) mode. */
  clearActive: () => void;
  /** Full reset — call on logout so the next user starts fresh. */
  reset: () => void;
  setCampaigns: (list: Campaign[]) => void;
}

const { id: _initId, initialized: _initFlag } = readInitialState();

export const useCampaignStore = create<CampaignState>((set, get) => ({
  activeId: _initId,
  campaigns: [],
  initialized: _initFlag,

  setActive: (id) => {
    persistId(id);
    persistInitialized(true);
    set({ activeId: id, initialized: true });
  },

  clearActive: () => {
    // User deliberately chose "consolidated": remove campaign key so the API
    // client sends no X-Campaign-Id, but record that a choice was made.
    persistId(null);
    persistInitialized(true);
    set({ activeId: null, initialized: true });
  },

  reset: () => {
    persistId(null);
    persistInitialized(false);
    set({ activeId: null, campaigns: [], initialized: false });
  },

  setCampaigns: (list) => {
    const { activeId: current, initialized } = get();

    if (!initialized) {
      // First load: auto-select the first campaign (normal user default).
      const nextActive = list.length > 0 ? list[0].id : null;
      if (nextActive) persistId(nextActive);
      persistInitialized(true);
      set({ campaigns: list, activeId: nextActive, initialized: true });
      return;
    }

    // User has already made a deliberate choice.
    if (current === null) {
      // Superadmin chose consolidated — never clobber it.
      set({ campaigns: list });
      return;
    }

    // Keep the current selection if it still exists; otherwise fall back to
    // list[0] (e.g. the chosen campaign was archived).
    const stillValid = list.some((c) => c.id === current);
    if (stillValid) {
      set({ campaigns: list });
    } else {
      const nextActive = list.length > 0 ? list[0].id : null;
      if (nextActive) persistId(nextActive);
      set({ campaigns: list, activeId: nextActive });
    }
  },
}));
