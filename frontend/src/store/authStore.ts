import { create } from "zustand";

import { getCurrentUser, login as loginRequest } from "@/api/auth";
import { tokenStorage } from "@/api/client";
import type { User } from "@/types/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (identifier: string, password: string) => Promise<boolean>;
  logout: () => void;
  loadCurrentUser: (force?: boolean) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: tokenStorage.get(),
  // Persist auth across reloads: a stored token means we're authenticated.
  isAuthenticated: Boolean(tokenStorage.get()),
  loading: false,
  error: null,

  login: async (identifier, password) => {
    set({ loading: true, error: null });
    try {
      const res = await loginRequest({ identifier, password });
      tokenStorage.set(res.access_token);
      set({ token: res.access_token, isAuthenticated: true });
      const user = await getCurrentUser();
      set({ user, loading: false });
      return true;
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Login failed",
      });
      return false;
    }
  },

  logout: () => {
    tokenStorage.clear();
    set({ user: null, token: null, isAuthenticated: false, error: null });
  },

  // Lazily hydrate the user profile when a token exists but no user is loaded.
  // Pass force=true to refetch (e.g. after a password change).
  loadCurrentUser: async (force = false) => {
    if (!get().token) return;
    if (get().user && !force) return;
    try {
      const user = await getCurrentUser();
      set({ user, isAuthenticated: true });
    } catch {
      // Token invalid/expired — interceptor already cleared it.
      tokenStorage.clear();
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));
