# Dark + Light Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a switchable light theme alongside the existing dark theme by converting Tailwind color/shadow tokens to per-theme CSS variables, with a Topbar sun/moon toggle persisted in localStorage and no flash on load — dark stays byte-identical.

**Architecture:** Components already use semantic tokens (`bg-bg`, `text-ink`, `bg-accent/10`). We redefine those tokens as `rgb(var(--c-*) / <alpha-value>)` driven by `.dark`/`.light` variable sets on `<html>`. Non-color theme values (shadows, glows, HUD, auras, chart hexes, map basemap) become CSS vars too. A zustand store + an inline anti-flash script own the active theme class.

**Tech Stack:** React 18 + TypeScript 5.7, Vite 6, Tailwind 3.4 (`darkMode: "class"`), Recharts 2, MapLibre 4, zustand 5. No frontend test runner — verification is `npm run lint` (`tsc -b --noEmit`), `npm run build`, and manual checks in BOTH themes.

**Spec:** `docs/superpowers/specs/2026-06-18-theming-dark-light-design.md`

---

## Conventions for every task
- Paths are relative to repo root `/mnt/c/Users/ecamp/Devs/agora-civic-intelligence`. Branch: `feat/theming` (do NOT switch).
- "Build clean" = `cd /mnt/c/Users/ecamp/Devs/agora-civic-intelligence/frontend && rm -f *.tsbuildinfo && rm -rf dist && npm run lint && npm run build`.
- Commit from repo root with `git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence ...` (cwd drifts to frontend/). Co-author trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Dark must stay visually identical** after every task — it's the regression baseline. The dark CSS-var values below are the exact RGB channels of the current hex tokens; do not alter them.
- Do NOT push (deploy is the user's call at the end).

## File Structure
**Create:** `frontend/src/store/themeStore.ts`, `frontend/src/components/ui/ThemeToggle.tsx`.
**Modify:** `frontend/index.html`, `frontend/tailwind.config.js`, `frontend/src/index.css`, `frontend/src/constants/ui.ts`, `frontend/src/components/ui/icons.tsx`, `frontend/src/components/layout/Topbar.tsx`, chart components (`components/charts/*`, `components/dashboards/ParticipationChart.tsx`, `CoverageBars.tsx`), map (`components/maps/MapCanvas.tsx` + `pages/MapExplorerPage.tsx` + `pages/DashboardPage.tsx`), `frontend/src/pages/LoginPage.tsx`.

---

### Task 1: Color tokens → CSS variables (dark unchanged)

**Files:**
- Modify: `frontend/src/index.css` (add theme variable blocks; remove the `:root { color-scheme: dark }`)
- Modify: `frontend/tailwind.config.js` (colors → var refs)

- [ ] **Step 1: Add the `.dark` and `.light` color variable blocks**

In `frontend/src/index.css`, inside `@layer base`, ADD these two blocks (and DELETE the existing `:root { color-scheme: dark; }` rule — `color-scheme` now lives in the theme classes):

```css
  .dark {
    --c-bg: 0 0 0;
    --c-bg-sunken: 0 0 0;
    --c-panel: 6 9 12;
    --c-panel-raised: 10 14 19;
    --c-panel-hover: 15 21 28;
    --c-accent: 34 211 238;
    --c-accent-strong: 6 182 212;
    --c-teal: 45 212 191;
    --c-amber: 245 181 61;
    --c-line: 21 36 43;
    --c-line-strong: 34 58 68;
    --c-ink: 230 242 245;
    --c-ink-muted: 139 160 168;
    --c-ink-faint: 82 100 109;
    --c-info: 34 211 238;
    --c-warning: 245 181 61;
    --c-critical: 244 96 122;
    --c-ok: 45 212 191;
    color-scheme: dark;
  }
  .light {
    --c-bg: 245 247 249;
    --c-bg-sunken: 238 241 244;
    --c-panel: 255 255 255;
    --c-panel-raised: 251 252 253;
    --c-panel-hover: 238 242 245;
    --c-accent: 8 145 178;
    --c-accent-strong: 14 116 144;
    --c-teal: 13 148 136;
    --c-amber: 180 83 9;
    --c-line: 215 222 227;
    --c-line-strong: 184 196 204;
    --c-ink: 11 20 24;
    --c-ink-muted: 71 88 98;
    --c-ink-faint: 124 140 148;
    --c-info: 8 145 178;
    --c-warning: 180 83 9;
    --c-critical: 190 18 60;
    --c-ok: 13 148 136;
    color-scheme: light;
  }
```

Also: the `body` rule currently does `@apply bg-bg text-ink ...` — leave it; it now resolves via vars. There's no theme class on `<html>` yet, so for THIS task temporarily add `class="dark"` to `<html>` in `frontend/index.html` (`<html lang="en" class="dark">`) so dark renders during verification (Task 3 replaces this with the script).

- [ ] **Step 2: Point Tailwind colors at the variables**

In `frontend/tailwind.config.js`, replace the entire `colors: { ... }` object inside `theme.extend` with:

```js
      colors: (() => {
        const ch = (v) => `rgb(var(${v}) / <alpha-value>)`;
        return {
          bg: { DEFAULT: ch("--c-bg"), sunken: ch("--c-bg-sunken") },
          panel: { DEFAULT: ch("--c-panel"), raised: ch("--c-panel-raised"), hover: ch("--c-panel-hover") },
          accent: { DEFAULT: ch("--c-accent"), strong: ch("--c-accent-strong") },
          teal: { DEFAULT: ch("--c-teal") },
          amber: { DEFAULT: ch("--c-amber") },
          line: { DEFAULT: ch("--c-line"), strong: ch("--c-line-strong") },
          ink: { DEFAULT: ch("--c-ink"), muted: ch("--c-ink-muted"), faint: ch("--c-ink-faint") },
          state: { info: ch("--c-info"), warning: ch("--c-warning"), critical: ch("--c-critical"), ok: ch("--c-ok") },
        };
      })(),
```

- [ ] **Step 3: Build clean**

Run: `cd /mnt/c/Users/ecamp/Devs/agora-civic-intelligence/frontend && rm -f *.tsbuildinfo && rm -rf dist && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Manual dark-regression check**

`npm run dev -- --host`, open the app (it's `class="dark"`). Confirm Dashboard/Map/Analytics look **identical** to before (colors, pills, borders). Token colors now come from vars but values are unchanged.

- [ ] **Step 5: Commit**

```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add frontend/src/index.css frontend/tailwind.config.js frontend/index.html
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(theme): color tokens via CSS variables (dark/light sets, dark unchanged)"
```

---

### Task 2: Non-color theme vars (shadows/glows/HUD/auras/grid/grain/chart) + rewrite index.css utilities

**Files:**
- Modify: `frontend/src/index.css` (add non-color vars to `.dark`/`.light`; rewrite utilities to consume them)
- Modify: `frontend/tailwind.config.js` (boxShadow + accent-gradient/mesh → vars)

- [ ] **Step 1: Add non-color vars to both theme blocks**

Append these to the `.dark` block (in `index.css`):

```css
    --shadow-panel: 0 0 0 1px rgba(34,211,238,0.04), 0 18px 50px -24px rgba(0,0,0,0.9);
    --shadow-card-hover: 0 0 0 1px rgba(34,211,238,0.18), 0 30px 80px -30px rgba(0,0,0,0.95);
    --glow-accent: 0 0 0 1px rgba(34,211,238,0.22), 0 0 44px -12px rgba(34,211,238,0.50);
    --glow-teal: 0 0 0 1px rgba(45,212,191,0.20), 0 0 44px -12px rgba(45,212,191,0.40);
    --glow-amber: 0 0 0 1px rgba(245,181,61,0.22), 0 0 44px -12px rgba(245,181,61,0.45);
    --hud: rgba(34,211,238,0.55);
    --aura-cyan: rgba(34,211,238,0.18);
    --aura-teal: rgba(45,212,191,0.15);
    --aura-amber: rgba(245,181,61,0.12);
    --grid-line: rgba(34,211,238,0.05);
    --grain-opacity: 0.035;
    --accent-gradient: linear-gradient(135deg, #22d3ee 0%, #2dd4bf 100%);
    --chart-1: #22d3ee; --chart-2: #f5b53d; --chart-3: #2dd4bf; --chart-4: #f4607a; --chart-5: #8ba0a8;
    --chart-grid: #15242b; --chart-axis: #52646d; --chart-axis-strong: #223a44;
    --chart-tooltip-shadow: 0 18px 50px -24px rgba(0,0,0,0.9);
```

Append these to the `.light` block:

```css
    --shadow-panel: 0 1px 2px rgba(16,24,32,0.06), 0 10px 28px -16px rgba(16,24,32,0.18);
    --shadow-card-hover: 0 1px 2px rgba(16,24,32,0.08), 0 18px 44px -20px rgba(16,24,32,0.22);
    --glow-accent: 0 0 0 1px rgba(8,145,178,0.30), 0 8px 22px -10px rgba(16,24,32,0.18);
    --glow-teal: 0 0 0 1px rgba(13,148,136,0.28), 0 8px 22px -10px rgba(16,24,32,0.16);
    --glow-amber: 0 0 0 1px rgba(180,83,9,0.28), 0 8px 22px -10px rgba(16,24,32,0.16);
    --hud: rgba(8,145,178,0.45);
    --aura-cyan: rgba(8,145,178,0.10);
    --aura-teal: rgba(13,148,136,0.08);
    --aura-amber: rgba(180,83,9,0.07);
    --grid-line: rgba(8,145,178,0.06);
    --grain-opacity: 0;
    --accent-gradient: linear-gradient(135deg, #0891b2 0%, #0d9488 100%);
    --chart-1: #0891b2; --chart-2: #b45309; --chart-3: #0d9488; --chart-4: #be123c; --chart-5: #64748b;
    --chart-grid: #e2e8f0; --chart-axis: #94a3b8; --chart-axis-strong: #cbd5e1;
    --chart-tooltip-shadow: 0 10px 28px -16px rgba(16,24,32,0.22);
```

- [ ] **Step 2: Point tailwind boxShadow + accent-gradient at vars**

In `frontend/tailwind.config.js` `theme.extend`, replace the `boxShadow` object with:

```js
      boxShadow: {
        panel: "var(--shadow-panel)",
        glow: "var(--glow-accent)",
        "glow-accent": "var(--glow-accent)",
        "glow-teal": "var(--glow-teal)",
        "glow-amber": "var(--glow-amber)",
        "card-hover": "var(--shadow-card-hover)",
      },
```

And in `backgroundImage`, change `"accent-gradient"` to `"var(--accent-gradient)"` (keep `mesh` and `sheen` as-is for now — `mesh` is low-opacity and acceptable in both themes):

```js
        "accent-gradient": "var(--accent-gradient)",
```

- [ ] **Step 3: Rewrite the hardcoded utilities in index.css to consume the vars**

In `frontend/src/index.css` `@layer components`, update these rules:

`grid-backdrop` (replace the two rgba literals with the var):
```css
  .grid-backdrop {
    background-image: linear-gradient(rgb(var(--c-bg) / 0) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-line) 1px, transparent 1px),
      linear-gradient(var(--grid-line) 1px, transparent 1px);
    background-size: 48px 48px;
  }
```
(Simpler: keep the original two-gradient structure but swap both `rgba(34,211,238,0.05)` → `var(--grid-line)`.)

`card-premium::before` (the cyan top accent) — swap the hardcoded gradient for the theme one:
```css
  .card-premium::before {
    content: "";
    position: absolute;
    left: 0; right: 0; top: 0; height: 1px;
    background: var(--accent-gradient);
    opacity: 0.55;
    border-top-left-radius: 14px;
    border-top-right-radius: 14px;
    pointer-events: none;
  }
```
(In light, `--accent-gradient` is the darker cyan→teal; opacity 0.55 reads as a subtle hairline. Acceptable.)

`hud-corners` — change the `--hud` default line so it inherits the theme var (the rule already uses `var(--hud)`); just change its local fallback definition `--hud: rgba(34,211,238,0.55);` to `--hud: var(--hud, rgba(34,211,238,0.55));`? No — instead REMOVE the local `--hud:` declaration inside `.hud-corners` so it inherits the theme-level `--hud`. (The 8 background gradients already reference `var(--hud)`.)

`.aura` / `.aura-teal` / `.aura-amber` — swap the rgba in each radial-gradient:
```css
  .aura { background: radial-gradient(closest-side, var(--aura-cyan), transparent); }
  .aura-teal { background: radial-gradient(closest-side, var(--aura-teal), transparent); }
  .aura-amber { background: radial-gradient(closest-side, var(--aura-amber), transparent); }
```
(Keep the existing `.aura` positioning/filter/blur declarations; only the gradient color changes.)

`.grain` — make opacity themeable: change `opacity: 0.035;` → `opacity: var(--grain-opacity);`.

- [ ] **Step 4: Build clean + dark-regression check**

Run build clean (Step 1 command of Task 1). Then `npm run dev`, confirm DARK still looks identical (glows, HUD corner brackets, auras, card top-accent, grid backdrop all unchanged).

- [ ] **Step 5: Commit**

```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add frontend/src/index.css frontend/tailwind.config.js
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(theme): shadows/glows/HUD/auras/grid/grain as theme vars (dark unchanged)"
```

---

### Task 3: Theme store + anti-flash script + Sun/Moon icons + ThemeToggle + Topbar mount

**Files:**
- Create: `frontend/src/store/themeStore.ts`
- Create: `frontend/src/components/ui/ThemeToggle.tsx`
- Modify: `frontend/index.html` (inline script; remove the temporary `class="dark"` and the static color-scheme meta)
- Modify: `frontend/src/components/ui/icons.tsx` (add SunIcon, MoonIcon)
- Modify: `frontend/src/components/layout/Topbar.tsx` (mount toggle)

- [ ] **Step 1: Create the theme store**

```ts
// frontend/src/store/themeStore.ts
import { create } from "zustand";

export type Theme = "dark" | "light";

const STORAGE_KEY = "agora-theme";

function readInitial(): Theme {
  // The inline script in index.html already set <html class>. Trust it first
  // so the store hydrates to the SAME value (no post-hydration flip).
  if (typeof document !== "undefined") {
    if (document.documentElement.classList.contains("light")) return "light";
    if (document.documentElement.classList.contains("dark")) return "dark";
  }
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light") return "light";
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
```

- [ ] **Step 2: Add the anti-flash inline script + clean up index.html**

In `frontend/index.html`: (a) remove the temporary `class="dark"` from `<html>` (back to `<html lang="en">`); (b) remove the `<meta name="color-scheme" content="dark" />` line; (c) add this as the FIRST element inside `<head>` (before the font links), so it runs before paint:

```html
    <script>
      (function () {
        try {
          var t = localStorage.getItem("agora-theme");
          document.documentElement.classList.add(t === "light" ? "light" : "dark");
        } catch (e) {
          document.documentElement.classList.add("dark");
        }
      })();
    </script>
```

- [ ] **Step 3: Add Sun/Moon icons**

In `frontend/src/components/ui/icons.tsx`, add (using the same `base(p)` stroke pattern as the other icons in that file):

```tsx
export const SunIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const MoonIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);
```

- [ ] **Step 4: Create ThemeToggle**

```tsx
// frontend/src/components/ui/ThemeToggle.tsx
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { useThemeStore } from "@/store/themeStore";

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      aria-pressed={!isDark}
      title={isDark ? "Tema claro" : "Tema oscuro"}
      className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-ink-muted transition-colors hover:border-accent hover:text-ink"
    >
      {isDark ? <SunIcon width={17} height={17} /> : <MoonIcon width={17} height={17} />}
    </button>
  );
}
```

- [ ] **Step 5: Mount the toggle in Topbar**

In `frontend/src/components/layout/Topbar.tsx`, import `ThemeToggle` and render `<ThemeToggle />` in the right-side cluster (the `<div className="flex shrink-0 items-center gap-2 sm:gap-3">`), placed before the "Sign out" button:

```tsx
import { ThemeToggle } from "@/components/ui/ThemeToggle";
// ... inside the right cluster, first child:
<ThemeToggle />
```

- [ ] **Step 6: Build clean**

Run build clean. Expected: PASS.

- [ ] **Step 7: Manual check — toggle works, persists, no flash**

`npm run dev`: the Topbar shows a sun (in dark). Click → switches to light instantly (surfaces go light, no neon glow, soft shadows). Refresh → stays light (localStorage). Hard-refresh in each theme → NO flash of the other theme. Toggle is keyboard-focusable (focus ring) and `aria-pressed` flips. Switch back to dark; confirm dark unchanged.

- [ ] **Step 8: Commit**

```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add frontend/src/store/themeStore.ts frontend/src/components/ui/ThemeToggle.tsx frontend/src/components/ui/icons.tsx frontend/src/components/layout/Topbar.tsx frontend/index.html
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(theme): zustand themeStore + anti-flash script + Topbar sun/moon toggle"
```

---

### Task 4: Chart theming

**Files:**
- Modify: `frontend/src/constants/ui.ts`
- Modify: `frontend/src/components/dashboards/ParticipationChart.tsx`, `CoverageBars.tsx`
- Modify: `frontend/src/components/charts/Donut.tsx`, `StackedBars.tsx`, `Heatmap.tsx`, `RadialGauge.tsx`

- [ ] **Step 1: Make CHART_TOOLTIP_STYLE + CHART_PALETTE theme-aware in constants/ui.ts**

Replace those two exports in `frontend/src/constants/ui.ts` with:

```ts
/** Recharts <Tooltip contentStyle> — resolves against the active theme via CSS vars. */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: "rgb(var(--c-panel))",
  border: "1px solid rgb(var(--c-line-strong))",
  borderRadius: 12,
  color: "rgb(var(--c-ink))",
  fontSize: 12,
  boxShadow: "var(--chart-tooltip-shadow)",
};

/** Ordered series palette — CSS vars so series colors track the theme. */
export const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
```

(Keep the `import type { CSSProperties } from "react";` line. `TONE_BADGE`/`KIND_BADGE`/`ROLE_BADGE`/`PANEL_HEIGHTS` unchanged.)

- [ ] **Step 2: Replace hardcoded chart hexes with chart vars**

Run: `cd /mnt/c/Users/ecamp/Devs/agora-civic-intelligence && grep -rnE "#15242b|#52646d|#223a44|#8ba0a8|#22d3ee|#f5b53d|#2dd4bf|#f4607a" frontend/src/components/charts frontend/src/components/dashboards/ParticipationChart.tsx frontend/src/components/dashboards/CoverageBars.tsx`

For each match that is an AXIS/GRID/series color (not a semantic per-datum fixture color), substitute:
- `#15242b` → `var(--chart-grid)`
- `#52646d` → `var(--chart-axis)`
- `#223a44` → `var(--chart-axis-strong)`
- `#8ba0a8` → `var(--chart-5)`
- `#22d3ee` → `var(--chart-1)`
- `#f5b53d` → `var(--chart-2)`
- `#2dd4bf` → `var(--chart-3)`
- `#f4607a` → `var(--chart-4)`

This covers Recharts `<CartesianGrid stroke=…>`, `<XAxis/YAxis stroke=…/tick fill=…>`, `<Bar/Line/Area fill=|stroke=>`, and `<linearGradient><stop stopColor=…>`. Recharts passes these to SVG attributes, which resolve CSS vars against the themed DOM. Leave any color that comes from fixture data (`s.color`, `p.color`, per-datum) untouched.

NOTE: SVG `stopColor` accepts `var(--chart-1)`. If a gradient uses `stopOpacity`, keep it.

- [ ] **Step 3: Build clean + manual check in BOTH themes**

Run build clean. `npm run dev`: in DARK, charts look unchanged (tooltip dark, cyan/amber series, dark grid). Toggle to LIGHT: tooltip turns white with dark text, grid is light gray, series use the darker cyan/amber/teal — all legible on white. Check Dashboard activity chart, Analytics, IEEM/Padrón/Resultados charts, Índice donut/stacked bars.

- [ ] **Step 4: Commit**

```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add frontend/src/constants/ui.ts frontend/src/components/charts frontend/src/components/dashboards/ParticipationChart.tsx frontend/src/components/dashboards/CoverageBars.tsx
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(theme): charts (tooltip/palette/axes) follow theme via CSS vars"
```

---

### Task 5: Theme-aware map basemap

**Files:**
- Modify: `frontend/src/components/maps/MapCanvas.tsx`
- Modify: `frontend/src/pages/MapExplorerPage.tsx`, `frontend/src/pages/DashboardPage.tsx` (pass theme into the remount key if needed)

- [ ] **Step 1: Read the current basemap + remount logic**

Read `frontend/src/components/maps/MapCanvas.tsx` and find: (a) the basemap style/tile definition (currently CARTO `dark_all` at `*.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`), and (b) the remount `key` mechanism used to switch basemaps (dark/satellite). Identify how the component knows which basemap to render (a prop like `basemap`).

- [ ] **Step 2: Make the standard basemap follow the theme**

Import the theme: `import { useThemeStore } from "@/store/themeStore";` and read `const theme = useThemeStore((s) => s.theme);`.

For the non-satellite ("dark"/standard) basemap, choose tiles by theme:
```ts
const standardTiles =
  theme === "light"
    ? "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
    : "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
```
Use `standardTiles` where the dark CARTO URL is currently hardcoded for the standard basemap. Leave the satellite basemap unchanged.

Include `theme` in the map's remount `key` (so switching theme rebuilds the style), e.g. `key={`${basemap}-${theme}`}` (adapt to the existing key expression). Preserve fit-bounds / selection behavior across the remount exactly as the existing dark/satellite switch does — do not regress it.

- [ ] **Step 3: Verify choropleth legibility on light tiles**

The cyan→amber choropleth ramp must stay legible on positron (light) tiles. If the ramp endpoints are sourced from chart/accent vars, they update automatically; if hardcoded, verify visually. If low-contrast on light, darken the light ramp endpoints (note any change). Confirm `MapExplorerPage` and the Dashboard mini-map both switch tiles with the theme.

- [ ] **Step 4: Build clean + manual check**

Run build clean. `npm run dev`: Map Explorer in DARK = dark_all tiles (unchanged). Toggle LIGHT → positron tiles, areas/choropleth still visible, hover/click/legend work. Dashboard mini-map switches too. Toggle back → dark unchanged.

- [ ] **Step 5: Commit**

```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add frontend/src/components/maps/MapCanvas.tsx frontend/src/pages/MapExplorerPage.tsx frontend/src/pages/DashboardPage.tsx
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(theme): map basemap follows theme (CARTO dark_all <-> positron)"
```

---

### Task 6: Login page + stray-literal sweep

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx` (+ any files surfaced by the grep)

- [ ] **Step 1: Find stray hardcoded colors outside the var definitions**

Run: `cd /mnt/c/Users/ecamp/Devs/agora-civic-intelligence && grep -rnE "#[0-9a-fA-F]{6}|rgba?\(" frontend/src --include=*.tsx --include=*.ts | grep -vE "constants/ui.ts|index.css"`

Review each hit. Most components use tokens already; flag any that hardcode a dark-only color (e.g. a `bg-[#06090c]`, an inline `style={{ background: "#000" }}`, a `text-white`/`text-black`, or a CARTO/url already handled). For each genuine dark-only literal on a themed surface, replace with the appropriate token class (`bg-panel`, `text-ink`, `border-line`, etc.) or a `rgb(var(--c-*))` value.

- [ ] **Step 2: Fix LoginPage**

Read `frontend/src/pages/LoginPage.tsx` (it predates the token sweep — it has a split showcase panel). Replace any hardcoded dark-only backgrounds/text with tokens so the login screen themes correctly in light. Keep the layout/structure; only swap colors to tokens. Verify the showcase side and the form side both read well in light (sufficient contrast) and unchanged in dark.

- [ ] **Step 3: Build clean + manual check (both themes)**

Run build clean. `npm run dev` at `/login` (log out first): toggle isn't on the login Topbar (login has no Topbar) — to test light login, set `localStorage.setItem("agora-theme","light")` in devtools then reload `/login`. Confirm it renders cleanly in light and unchanged in dark. (Optional: if desired, a small toggle could be added to the login screen — out of scope unless trivial.)

- [ ] **Step 4: Commit**

```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add -A frontend/src
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(theme): login + stray dark-only literals themed via tokens"
```

---

### Task 7: Final gate + full QA

- [ ] **Step 1: Full clean build**

Run: `cd /mnt/c/Users/ecamp/Devs/agora-civic-intelligence/frontend && rm -f *.tsbuildinfo && rm -rf dist && npm run lint && npm run build` → PASS.

- [ ] **Step 2: Full manual QA in BOTH themes**

`npm run dev`. In LIGHT, walk: Dashboard, Map Explorer, Analytics, Users, Sources, Búsqueda, + a sample from each section (resultados, padrón, ieem, territorios, ieem, auditoría, configuración, reportes, ComingSoon). Check: card surfaces/hairlines, pills (TONE_BADGE), DataTable (header/rows/sort glyph/pagination), charts (tooltip/axes/series), map tiles + choropleth, HUD corners + auras subtle (not muddy), focus rings visible, MetricCard deltas. Then toggle DARK and confirm it matches current production (no regressions). Test at ≤640px (toggle visible in condensed Topbar). Hard-refresh in each theme → no flash. Toggle persists across refresh.

- [ ] **Step 3: Update memory**

Add a note to `/home/ecamposg/.claude/projects/-mnt-c-Users-ecamp-Devs-agora-civic-intelligence/memory/` (new file `theming.md` + MEMORY.md pointer) recording: CSS-variable token architecture, `.dark`/`.light` blocks in index.css, `themeStore` + anti-flash script, ThemeToggle in Topbar, chart/map theming, default dark, localStorage key `agora-theme`.

- [ ] **Step 4: Commit any QA fixes, then hand back to user for merge/deploy decision**

```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -am "fix(theme): QA polish" # only if QA found fixes
```
Do NOT push/merge — present the branch to the user for the merge-to-main + deploy decision (Railway deploys from main; `railway up` fails for this project).

---

## Self-Review (completed during authoring)

- **Spec coverage:** §3.1 color tokens → Task 1. §3.2 non-color vars + index.css utilities → Task 2. §3.3 charts → Task 4. §3.4 map → Task 5. §3.5 store+anti-flash → Task 3. §3.6 toggle/icons → Task 3. §4 files → all tasks. §5 edge cases: localStorage try/catch (Task 3 store), no-flash hydrate-from-class (Task 3 readInitial), map remount (Task 5), reduced-motion (untouched), contrast (palette values in Task 1 + QA Task 7). §6 testing → per-task build+manual + Task 7. §7 rollout → task order mirrors the 7 spec steps.
- **Placeholder scan:** no TBD/TODO. Deterministic files (index.css blocks, tailwind, store, toggle, icons, inline script) have full code. The chart/map/login sweeps give exact hex→var mappings + the grep to locate them (the only non-literal-reproducible parts, since those files' current contents vary) — concrete and actionable, not placeholders.
- **Type/name consistency:** `useThemeStore`, `theme`/`setTheme`/`toggle`, `Theme`, storage key `agora-theme`, class names `dark`/`light`, var names `--c-*`/`--chart-*`/`--glow-*`/`--hud`/`--aura-*` are consistent across tasks. `CHART_TOOLTIP_STYLE`/`CHART_PALETTE` signatures unchanged (still a CSSProperties + string[]), so existing consumers don't break.
- **Known guidance:** dark RGB channel values equal the current hex tokens (verified) so dark is unchanged; each task re-verifies dark as the regression baseline.
