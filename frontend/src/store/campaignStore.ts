import { create } from "zustand";

export interface Campaign {
  id: string;
  name: string;
  cycle: string;
  status: string;
  license_tier: string;
}

const STORAGE_KEY = "agora-campaign";

function readInitialId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? null;
  } catch {
    /* ignore */
  }
  return null;
}

function persistId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

interface CampaignState {
  activeId: string | null;
  campaigns: Campaign[];
  setActive: (id: string) => void;
  setCampaigns: (list: Campaign[]) => void;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  activeId: readInitialId(),
  campaigns: [],
  setActive: (id) => {
    persistId(id);
    set({ activeId: id });
  },
  setCampaigns: (list) => {
    const current = get().activeId;
    // If no activeId yet (or the stored id is no longer in the list), default to first.
    const validActive =
      current && list.some((c) => c.id === current) ? current : null;
    const nextActive =
      validActive ?? (list.length > 0 ? list[0].id : null);
    if (nextActive && nextActive !== current) {
      persistId(nextActive);
    }
    set({ campaigns: list, activeId: nextActive });
  },
}));
