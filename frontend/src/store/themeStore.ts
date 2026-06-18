import { create } from "zustand";

export type Theme = "dark" | "light";

// NOTE: this key is also hardcoded in index.html's anti-flash inline script.
// If you rename it, update index.html too.
const STORAGE_KEY = "agora-theme";

function readInitial(): Theme {
  if (typeof document !== "undefined") {
    if (document.documentElement.classList.contains("light")) return "light";
    if (document.documentElement.classList.contains("dark")) return "dark";
  }
  try {
    if (localStorage.getItem(STORAGE_KEY) === "light") return "light";
  } catch {
    /* ignore */
  }
  return "dark";
}

function apply(theme: Theme) {
  const el = document.documentElement;
  el.classList.remove("dark", "light");
  el.classList.add(theme);
  el.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readInitial(),
  setTheme: (t) => {
    apply(t);
    set({ theme: t });
  },
  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    apply(next);
    set({ theme: next });
  },
}));
