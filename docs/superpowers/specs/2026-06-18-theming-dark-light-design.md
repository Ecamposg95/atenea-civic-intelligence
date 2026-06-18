# Theming — Dark + Light — Design Spec

**Date:** 2026-06-18
**Status:** Approved (approach A) — pending spec review
**Scope:** Frontend only (`frontend/`). No backend, no user-model changes.
**Owner:** Ágora Civic Intelligence (Atlas Tech)

## 1. Goal

Add a switchable **light theme** alongside the existing all-black "DataV / command-center" **dark theme**, with:

- **Dark as the default** (current look stays byte-for-identical; light is the addition).
- A **Light DataV** aesthetic: light surfaces, the same cyan/amber identity but accents darkened for contrast, subtle hairlines, **soft gray shadows instead of neon glows**.
- A **sun/moon toggle in the Topbar**, preference persisted in **localStorage** (no backend, no User-model change).
- **No flash** of the wrong theme on load.
- Two states only: `dark` | `light` (no "follow system" tri-state — YAGNI for now).

**Approach (A):** the ~28 modules already consume semantic Tailwind tokens (`bg-bg`, `text-ink`, `border-line`, `bg-accent/10`, …). We convert the token *definitions* to CSS variables with two value sets (`.dark`, `.light`); components are untouched and re-theme automatically. Only hardcoded color literals (glows/HUD/auras in `index.css`, chart hexes in `constants/ui.ts` and chart components, the map basemap) are migrated to be theme-aware.

## 2. Non-Goals (YAGNI)

- No "follow system / auto" mode (just an explicit two-state toggle). Could be a later add.
- No per-user server-side persistence (localStorage only; no `User.theme` column, no endpoint).
- No new color brand / no redesign of the dark theme — dark must look unchanged.
- No additional themes (high-contrast, sepia, etc.).
- No theming of third-party-fixed surfaces beyond what's listed (e.g. we do theme the MapLibre basemap, but we don't restyle MapLibre's internal control DOM beyond what tokens already cover).

## 3. Architecture

### 3.1 Token system — CSS variables (channels) + Tailwind mapping
Color tokens become CSS custom properties holding **space-separated RGB channels** (so Tailwind's `<alpha-value>` keeps working):

```css
/* index.css */
@layer base {
  .dark {            /* default theme; applied to <html> */
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
    --c-bg: 245 247 249;        /* #f5f7f9 */
    --c-bg-sunken: 238 241 244; /* #eef1f4 inputs/sunken */
    --c-panel: 255 255 255;     /* #ffffff */
    --c-panel-raised: 251 252 253;
    --c-panel-hover: 238 242 245;
    --c-accent: 8 145 178;      /* #0891b2 darker cyan for AA on white */
    --c-accent-strong: 14 116 144; /* #0e7490 */
    --c-teal: 13 148 136;       /* #0d9488 */
    --c-amber: 180 83 9;        /* #b45309 */
    --c-line: 215 222 227;      /* #d7dee3 */
    --c-line-strong: 184 196 204; /* #b8c4cc */
    --c-ink: 11 20 24;          /* #0b1418 */
    --c-ink-muted: 71 88 98;    /* #475862 */
    --c-ink-faint: 124 140 148; /* #7c8c94 */
    --c-info: 8 145 178;
    --c-warning: 180 83 9;
    --c-critical: 190 18 60;    /* #be123c */
    --c-ok: 13 148 136;
    color-scheme: light;
  }
}
```

Tailwind maps every existing token to its variable (names/structure unchanged so no component edits):

```js
// tailwind.config.js
const ch = (v) => `rgb(var(${v}) / <alpha-value>)`;
colors: {
  bg: { DEFAULT: ch("--c-bg"), sunken: ch("--c-bg-sunken") },
  panel: { DEFAULT: ch("--c-panel"), raised: ch("--c-panel-raised"), hover: ch("--c-panel-hover") },
  accent: { DEFAULT: ch("--c-accent"), strong: ch("--c-accent-strong") },
  teal: { DEFAULT: ch("--c-teal") },
  amber: { DEFAULT: ch("--c-amber") },
  line: { DEFAULT: ch("--c-line"), strong: ch("--c-line-strong") },
  ink: { DEFAULT: ch("--c-ink"), muted: ch("--c-ink-muted"), faint: ch("--c-ink-faint") },
  state: { info: ch("--c-info"), warning: ch("--c-warning"), critical: ch("--c-critical"), ok: ch("--c-ok") },
},
```

`darkMode: "class"` stays. `<html>` carries `class="dark"` or `class="light"` (exactly one). Alpha modifiers (`bg-accent/10`, `border-line/60`) keep working because values are channels.

### 3.2 Non-color, theme-dependent values → CSS variables
Shadows, gradients, glows, HUD, auras, and chart hexes can't use `<alpha-value>`; define them as **full CSS var strings**, overridden per theme:

```css
.dark {
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
  /* chart tokens */
  --chart-1: #22d3ee; --chart-2: #f5b53d; --chart-3: #2dd4bf; --chart-4: #f4607a; --chart-5: #8ba0a8;
  --chart-grid: #15242b; --chart-axis: #52646d; --chart-axis-strong: #223a44;
  --chart-tooltip-bg: #06090c; --chart-tooltip-border: #223a44; --chart-tooltip-ink: #e6f2f5;
  --chart-tooltip-shadow: 0 18px 50px -24px rgba(0,0,0,0.9);
}
.light {
  /* No neon: soft gray shadows; glows become subtle ring+shadow */
  --shadow-panel: 0 1px 2px rgba(16,24,32,0.06), 0 10px 28px -16px rgba(16,24,32,0.18);
  --shadow-card-hover: 0 1px 2px rgba(16,24,32,0.08), 0 18px 44px -20px rgba(16,24,32,0.22);
  --glow-accent: 0 0 0 1px rgba(8,145,178,0.30), 0 8px 22px -10px rgba(16,24,32,0.18);
  --glow-teal: 0 0 0 1px rgba(13,148,136,0.28), 0 8px 22px -10px rgba(16,24,32,0.16);
  --glow-amber: 0 0 0 1px rgba(180,83,9,0.28), 0 8px 22px -10px rgba(16,24,32,0.16);
  --hud: rgba(8,145,178,0.45);
  --aura-cyan: rgba(8,145,178,0.10);   /* much subtler on light */
  --aura-teal: rgba(13,148,136,0.08);
  --aura-amber: rgba(180,83,9,0.07);
  --grid-line: rgba(8,145,178,0.06);
  --grain-opacity: 0;                  /* grain off in light (muddy on white) */
  --chart-1: #0891b2; --chart-2: #b45309; --chart-3: #0d9488; --chart-4: #be123c; --chart-5: #64748b;
  --chart-grid: #e2e8f0; --chart-axis: #94a3b8; --chart-axis-strong: #cbd5e1;
  --chart-tooltip-bg: #ffffff; --chart-tooltip-border: #d7dee3; --chart-tooltip-ink: #0b1418;
  --chart-tooltip-shadow: 0 10px 28px -16px rgba(16,24,32,0.22);
}
```

Tailwind `boxShadow` references these vars:
```js
boxShadow: {
  panel: "var(--shadow-panel)",
  "card-hover": "var(--shadow-card-hover)",
  glow: "var(--glow-accent)",
  "glow-accent": "var(--glow-accent)",
  "glow-teal": "var(--glow-teal)",
  "glow-amber": "var(--glow-amber)",
},
```
`backgroundImage.accent-gradient` / `mesh` / `sheen`: `accent-gradient` keeps a cyan→teal gradient but uses the theme cyan/teal (define `--accent-gradient` per theme); `mesh` and `sheen` opacities are already low — make `mesh` use `--aura-*`. `index.css` utilities rewritten to consume the vars: `grid-backdrop`→`--grid-line`; `card-premium::before`→theme gradient var; `hud-corners`→`--hud`; `.aura/.aura-teal/.aura-amber`→`--aura-*`; `.grain` opacity→`--grain-opacity`; `::selection` already token-based.

### 3.3 Chart theming
- `constants/ui.ts` `CHART_TOOLTIP_STYLE` switches to CSS-var-backed values:
  `{ background: "rgb(var(--c-panel))", border: "1px solid rgb(var(--c-line-strong))", color: "rgb(var(--c-ink))", boxShadow: "var(--chart-tooltip-shadow)", borderRadius: 12, fontSize: 12 }`.
  (Recharts applies `contentStyle` as inline style on a DOM node inside `<html class=…>`, so the vars resolve against the active theme. Verify the tooltip node is inside the themed tree — it is, Recharts renders inline.)
- `CHART_PALETTE` becomes `["var(--chart-1)", … "var(--chart-5)"]`. SVG `fill`/`stroke` accept CSS var strings and resolve per theme. (If any consumer does string ops on palette hex — none currently do — note it.)
- Chart components (`ParticipationChart`, `Donut`, `StackedBars`, `CoverageBars`, `Heatmap`, `RadialGauge`) replace hardcoded axis/grid hexes (`#15242b`, `#52646d`, `#223a44`, `#8ba0a8`, gradient stops) with `var(--chart-grid)` / `var(--chart-axis)` / `var(--chart-axis-strong)` / `var(--chart-N)`. Semantic per-datum colors from fixtures stay as-is (already data-driven). The `ParticipationChart` area gradient stops use `var(--chart-1)`.

### 3.4 Map basemap
`MapCanvas`/`MapExplorerPage` use a CARTO **dark** basemap (`dark_all`). Make the basemap theme-aware:
- Dark theme → `dark_all` (current). Light theme → CARTO **positron** (`light_all`) at `*.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`.
- Reuse the existing **remount-on-key** pattern: include the active theme in the map's remount key so the style rebuilds on theme switch (same mechanism already used for dark/satellite switching).
- The user's existing basemap selector (dark / satellite) stays; theme drives the *default* light/dark tiles. Concretely: the "dark"/standard basemap option resolves to dark_all or positron based on theme; "satellite" is unaffected. Choropleth cyan→amber ramp: keep, but source endpoints from chart vars so it stays legible on light tiles (verify contrast; adjust ramp lightness for light if needed).

### 3.5 Theme store + apply + anti-flash
- New `frontend/src/store/themeStore.ts` (zustand), mirroring `authStore` style:
  - State: `theme: "dark" | "light"`.
  - `setTheme(t)`, `toggle()`.
  - On change: write `localStorage["agora-theme"] = t` and set `document.documentElement.className` theme class (replace `dark`/`light`), and `document.documentElement.style.colorScheme` (redundant with CSS `color-scheme` but explicit). Initial state read from `localStorage` (fallback `"dark"`).
- **Anti-flash:** a tiny inline script in `index.html` `<head>` (runs before CSS/JS bundle) reads `localStorage["agora-theme"]` (default `"dark"`) and sets `document.documentElement.className`. Remove the static `color-scheme` meta's hardcoded `dark` (or let the script/CSS own it). The zustand store then hydrates to the same value (no flip).
- `<html>` must start with a theme class. Since `index.html` has `<html lang="en">` (no class), the inline script adds it before paint.

### 3.6 Toggle UI
- New `frontend/src/components/ui/ThemeToggle.tsx`: a button showing a sun (in dark, "switch to light") / moon (in light) icon, `aria-label` ("Cambiar a tema claro/oscuro"), `aria-pressed`, `.focus-ring`, themed via tokens. Add `SunIcon`/`MoonIcon` to `components/ui/icons.tsx` (dependency-free stroke icons matching the set).
- Mounted in `Topbar.tsx` near the profile/sign-out cluster.

## 4. Components / Files

**Create:**
- `frontend/src/store/themeStore.ts` — theme state + persistence + DOM apply.
- `frontend/src/components/ui/ThemeToggle.tsx` — the toggle button.

**Modify:**
- `frontend/index.html` — inline anti-flash script; drop hardcoded `color-scheme` meta value (or make it generic).
- `frontend/tailwind.config.js` — colors → `rgb(var(--…)/<alpha-value>)`; boxShadow/backgroundImage → vars.
- `frontend/src/index.css` — `.dark`/`.light` variable blocks (color + non-color); rewrite `grid-backdrop`, `card-premium::before`, `hud-corners`, `.aura*`, `.grain`, scrollbar/selection to consume vars; remove the hardcoded `color-scheme: dark` from `:root` (moved into theme classes).
- `frontend/src/constants/ui.ts` — `CHART_TOOLTIP_STYLE` + `CHART_PALETTE` → CSS-var-backed.
- `frontend/src/components/charts/*` and `components/dashboards/ParticipationChart.tsx`, `CoverageBars.tsx` — axis/grid/series hexes → chart vars.
- `frontend/src/components/maps/MapCanvas.tsx` (+ `MapExplorerPage.tsx`, `DashboardPage.tsx` mini-map) — theme-aware basemap + remount key includes theme.
- `frontend/src/components/layout/Topbar.tsx` — mount `<ThemeToggle/>`.
- `frontend/src/components/ui/icons.tsx` — add `SunIcon`, `MoonIcon`.
- `frontend/src/pages/LoginPage.tsx` — verify the split-showcase/login surfaces theme correctly (it predates the token sweep; fix any hardcoded dark-only colors).

## 5. Error Handling & Edge Cases

- **localStorage unavailable / corrupt value:** guard reads in a try/catch; any value other than `"light"` falls back to `"dark"`.
- **No-flash race:** the inline script is the single source of the initial class; the store must hydrate to the SAME value (read the class already on `<html>`, not re-default), so there's no post-hydration flip.
- **MapLibre on theme switch:** the map remounts via the theme-keyed `key`; ensure fit-bounds/selection state is preserved or re-applied (mirror current dark/satellite switch behavior; if state is lost there too, keep parity — don't regress).
- **Charts:** confirm Recharts tooltip and SVG fills resolve CSS vars (they do, since rendered inside the themed DOM). If any chart renders into a portal outside `<html class>`, it still inherits from `:root`-level vars (vars are defined on the theme class on `<html>`, which is an ancestor of all portals) — OK.
- **Reduced motion:** unaffected; the global `prefers-reduced-motion` guard stays.
- **Contrast:** light palette targets WCAG AA for text (`ink` on `bg`/`panel`, `ink-muted` on `panel`) and for accent text/pills; the implementer verifies key pairs (ink/#0b1418 on #ffffff ✓; accent #0891b2 on #ffffff ✓ ~4.5:1; ink-muted #475862 on #fff ✓).
- **Selection/scrollbar:** already token-based; confirm visible in light.

## 6. Testing & Verification

- **Build:** clean `tsc -b --noEmit` + `vite build` (clear `*.tsbuildinfo`/`dist` first).
- **Manual (both themes):**
  - Toggle from Topbar; verify instant switch, no reload, persists across refresh (localStorage), and **no flash** on hard refresh in each theme.
  - Walk core pages + a sample of modules in LIGHT: cards, hairlines, pills, tables (DataTable), charts (tooltip/axes/series), map (positron tiles + choropleth legible), HUD corners/auras subtle-not-muddy, focus rings visible.
  - Confirm DARK looks **unchanged** vs current `main` (regression check on Dashboard/Map/Analytics).
  - Keyboard: toggle reachable, `aria-pressed` reflects state, focus ring shows.
  - Mobile (≤640px): toggle visible/usable in the condensed Topbar.
- No frontend test runner exists (per repo norms) — verification is build + manual.

## 7. Rollout / Sequencing

1. **Tokens foundation:** index.css variable blocks + tailwind.config mapping + remove static color-scheme. Verify DARK unchanged (this is the riskiest regression point). Commit.
2. **index.css utilities + shadows → vars** (glows/HUD/auras/grid/grain). Verify dark unchanged. Commit.
3. **Theme store + anti-flash script + ThemeToggle in Topbar + icons.** Now switching works for token-driven surfaces. Commit.
4. **Charts** (constants/ui + chart components). Commit.
5. **Map basemap** theme-aware. Commit.
6. **LoginPage + sweep for stray hardcoded dark-only literals** (grep for `#0`, `#1`, `rgba(` in `src` outside the var definitions). Commit.
7. Full clean build + manual QA in both themes. Merge to main + deploy (GitHub push; `railway up` fails for this project) — per user.

Each step keeps DARK visually identical; LIGHT becomes progressively correct. Subagent-driven execution with per-step dark-regression review.

## 8. Open Questions

None blocking. "Follow system" mode is intentionally deferred (§2). If the choropleth ramp proves illegible on positron tiles during QA, adjust the light ramp endpoints (tracked as a QA item, not a blocker).
