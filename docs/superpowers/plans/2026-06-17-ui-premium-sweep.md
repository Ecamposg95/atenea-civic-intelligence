# UI Premium Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every module up to the premium standard of the core pages by first hardening shared UI primitives, then sweeping modules one-by-one through a fixed quality checklist.

**Architecture:** Foundation-first (direction B). Phase 0 builds shared, accessible, responsive primitives (`SegmentedControl`, `DataTable`, `SkeletonCard`, `constants/ui.ts`, a global focus-ring baseline) plus a proven reference migration (UsersPage). Phases 1–3 sweep modules by polish tier, each applying the same Module Sweep Procedure. Frontend-only; no backend, no new data, no AI wiring.

**Tech Stack:** React 18 + TypeScript 5.7, Vite 6, Tailwind 3.4, Recharts 2, MapLibre 4, react-router 6, zustand 5. No frontend test runner exists — verification is `npm run lint` (`tsc -b --noEmit`), `npm run build`, and manual browser checks (per spec §8).

**Spec:** `docs/superpowers/specs/2026-06-17-ui-premium-sweep-design.md`

---

## Conventions for every task

- All paths are relative to repo root `/mnt/c/Users/ecamp/Devs/agora-civic-intelligence`.
- Verification commands run from `frontend/`.
- "Build clean" means: `cd frontend && rm -rf node_modules/.tmp *.tsbuildinfo dist && npm run lint && npm run build` (incremental tsc cache has produced false errors in this repo — always clear it).
- Manual check = `cd frontend && npm run dev -- --host` then open the listed route at desktop width AND a ≤640px viewport; tab through with the keyboard.
- Commit after each task. Co-author trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Honesty rule (spec §3): never add fabricated KPIs/series; keep `PreviewBanner` + "muestra" labels on `preview` modules; empty real data → "Ingesta pendiente".

---

## File Structure

**Phase 0 creates:**
- `frontend/src/constants/ui.ts` — shared tooltip style, chart palette, badge maps, responsive height helpers.
- `frontend/src/lib/table.ts` — pure helpers: `sortRows`, `paginate` (testable in isolation by reading).
- `frontend/src/components/ui/SegmentedControl.tsx` — accessible tab/segmented switch.
- `frontend/src/components/ui/SkeletonCard.tsx` — `SkeletonCard` + `SkeletonRows`.
- `frontend/src/components/ui/DataTable.tsx` — sortable/paginated/responsive table.

**Phase 0 modifies:**
- `frontend/src/index.css` — focus-ring baseline on `.btn`, new `.focus-ring` utility.
- `frontend/src/components/layout/Sidebar.tsx`, `Topbar.tsx`, `components/ui/Modal.tsx` — apply `.focus-ring`.
- `frontend/src/pages/UsersPage.tsx` — reference migration to `DataTable` + `SegmentedControl`/constants.
- `frontend/src/components/ui/DataState.tsx` — minor: default empty copy + doc.

**Phases 1–3 modify** module pages under `frontend/src/modules/*` and `frontend/src/pages/*` per the Module Sweep Procedure.

---

# PHASE 0 — Shared Foundation

### Task 0: Focus-ring accessibility baseline

**Files:**
- Modify: `frontend/src/index.css` (the `.btn` mixin ~line 61-71; add `.focus-ring` utility in the components layer)
- Modify: `frontend/src/components/layout/Sidebar.tsx:34-39` (NavLink class)
- Modify: `frontend/src/components/layout/Topbar.tsx` (icon buttons)
- Modify: `frontend/src/components/ui/Modal.tsx` (close button ~line 26-28)

- [ ] **Step 1: Add focus-visible to the `.btn` base + a shared utility**

In `frontend/src/index.css`, change the `.btn` rule to include focus-visible, and add a `.focus-ring` utility right after `.btn-ghost`:

```css
  .btn {
    @apply inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50;
  }
```

Add after `.btn-ghost { ... }`:

```css
  /* Keyboard focus ring for non-button interactive elements
     (NavLinks, tab buttons, sortable table headers, icon buttons). */
  .focus-ring {
    @apply outline-none focus-visible:ring-1 focus-visible:ring-accent/50;
  }
```

- [ ] **Step 2: Apply `.focus-ring` to Sidebar NavLink**

In `frontend/src/components/layout/Sidebar.tsx`, append `focus-ring` to the `navItem` constant (line 14-15):

```ts
const navItem =
  "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all focus-ring";
```

- [ ] **Step 3: Apply `.focus-ring` to Topbar icon buttons and Modal close**

In `frontend/src/components/layout/Topbar.tsx`, add `focus-ring` to the className of each `<button>` (hamburger, sign-out, any icon button). In `frontend/src/components/ui/Modal.tsx`, add `focus-ring rounded` to the close button's className (~line 26-28).

- [ ] **Step 4: Verify build clean**

Run: `cd frontend && rm -f *.tsbuildinfo && rm -rf dist && npm run lint && npm run build`
Expected: PASS, no TS errors.

- [ ] **Step 5: Manual keyboard check**

Run dev server; press Tab from the top of any page. Expected: a cyan ring appears on focused buttons / sidebar links / modal close, and does NOT appear on plain mouse clicks.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/index.css frontend/src/components/layout/Sidebar.tsx frontend/src/components/layout/Topbar.tsx frontend/src/components/ui/Modal.tsx
git commit -m "feat(ui): focus-visible accessibility baseline on buttons/links/modal"
```

---

### Task 1: `constants/ui.ts` — dedupe shared values

**Files:**
- Create: `frontend/src/constants/ui.ts`

- [ ] **Step 1: Create the constants module**

```ts
// frontend/src/constants/ui.ts
// Single home for UI values previously duplicated across pages/charts.

/** Recharts <Tooltip contentStyle> — matches the DataV panel look. */
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: "#06090c",
  border: "1px solid #223a44",
  borderRadius: 12,
  color: "#e6f2f5",
  fontSize: 12,
  boxShadow: "0 18px 50px -24px rgba(0,0,0,0.9)",
};

/** Ordered series palette (cyan → amber → teal → critical) for charts. */
export const CHART_PALETTE = ["#22d3ee", "#f5b53d", "#2dd4bf", "#f4607a", "#8ba0a8"];

/** Tailwind class fragments for a colored pill, keyed by tone. */
export const TONE_BADGE = {
  info: "border-accent/30 bg-accent/10 text-accent",
  warning: "border-state-warning/30 bg-state-warning/10 text-state-warning",
  critical: "border-state-critical/30 bg-state-critical/10 text-state-critical",
  ok: "border-teal/30 bg-teal/10 text-teal",
  neutral: "border-line bg-panel-hover text-ink-muted",
} as const;
export type Tone = keyof typeof TONE_BADGE;

/** Data-source kind → badge tone (dedupe Dashboard + Sources). */
export const KIND_BADGE: Record<string, Tone> = {
  wms: "info",
  geojson: "ok",
  ckan: "warning",
  api: "info",
  file: "neutral",
};

/** User role → badge tone (dedupe Users). */
export const ROLE_BADGE: Record<string, Tone> = {
  superadmin: "critical",
  admin: "info",
  analyst: "ok",
  viewer: "neutral",
};

/** Responsive panel heights — replaces hardcoded h-[600px]/h-[440px]. */
export const PANEL_HEIGHTS = {
  mapTall: "h-[420px] lg:h-[600px]",
  mapMini: "h-[200px] lg:h-[230px]",
  chartMd: "h-[260px] lg:h-[320px]",
  copilot: "min-h-[300px] lg:min-h-[440px]",
} as const;
```

- [ ] **Step 2: Verify build clean**

Run: `cd frontend && npm run lint`
Expected: PASS (file is referenced later; standalone it must still type-check — note `React` import is via global JSX types, but to be safe add `import type React from "react";` at top if `npm run lint` complains about the `React.CSSProperties` reference).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/constants/ui.ts
git commit -m "feat(ui): shared constants — chart tooltip/palette, badge tones, panel heights"
```

---

### Task 2: `lib/table.ts` — pure sort/pagination helpers

**Files:**
- Create: `frontend/src/lib/table.ts`

- [ ] **Step 1: Create pure helpers**

```ts
// frontend/src/lib/table.ts
export type SortDir = "asc" | "desc";

/** Stable sort by a key extractor; strings use locale compare, numbers numeric. */
export function sortRows<T>(
  rows: T[],
  getValue: (row: T) => string | number | null | undefined,
  dir: SortDir,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows]
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const va = getValue(a.row);
      const vb = getValue(b.row);
      if (va == null && vb == null) return a.i - b.i;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return va === vb ? a.i - b.i : (va - vb) * sign;
      }
      const cmp = String(va).localeCompare(String(vb), "es");
      return cmp === 0 ? a.i - b.i : cmp * sign;
    })
    .map((x) => x.row);
}

/** Slice rows for a 1-based page. */
export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

/** Human range label, e.g. "1–20 de 7053". */
export function pageRangeLabel(total: number, page: number, pageSize: number): string {
  if (total === 0) return "0 de 0";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `${start}–${end} de ${total}`;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
```

- [ ] **Step 2: Verify build clean + correctness read-through**

Run: `cd frontend && npm run lint`
Expected: PASS. Read each function once: `sortRows` is stable (ties keep original index), nulls sort last, `paginate` is 1-based, `pageRangeLabel` clamps end to total.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/table.ts
git commit -m "feat(ui): pure table helpers — stable sort, pagination, range label"
```

---

### Task 3: `<SegmentedControl>` — accessible tab switch

**Files:**
- Create: `frontend/src/components/ui/SegmentedControl.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// frontend/src/components/ui/SegmentedControl.tsx
import { useRef, type ComponentType, type KeyboardEvent } from "react";

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  icon?: ComponentType<{ width?: number; height?: number; className?: string }>;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible label for the tablist. */
  ariaLabel: string;
  size?: "sm" | "md";
}

/**
 * Accessible segmented / tab switch. role=tablist with roving tabindex and
 * Arrow/Home/End keyboard navigation. Replaces ad-hoc segmented buttons.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (i: number) => {
    const next = (i + options.length) % options.length;
    refs.current[next]?.focus();
    onChange(options[next].id);
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(i + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(-i); // -> index 0
    } else if (e.key === "End") {
      e.preventDefault();
      move(options.length - 1 - i);
    }
  };

  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex gap-1 rounded-lg border border-line bg-panel p-1"
    >
      {options.map((o, i) => {
        const active = o.id === value;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            type="button"
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`focus-ring inline-flex items-center gap-1.5 rounded-md font-medium transition-colors ${pad} ${
              active
                ? "bg-accent/10 text-accent ring-1 ring-inset ring-accent/25"
                : "text-ink-muted hover:bg-panel-hover hover:text-ink"
            }`}
          >
            {Icon && <Icon width={15} height={15} className="shrink-0" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify build clean**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/SegmentedControl.tsx
git commit -m "feat(ui): accessible SegmentedControl (role=tablist, arrow-key nav)"
```

---

### Task 4: `<SkeletonCard>` + `<SkeletonRows>`

**Files:**
- Create: `frontend/src/components/ui/SkeletonCard.tsx`

- [ ] **Step 1: Implement**

```tsx
// frontend/src/components/ui/SkeletonCard.tsx
/** Pulsing placeholder card; defaults match .card-premium dimensions. */
export function SkeletonCard({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`card-premium animate-pulse space-y-3 p-5 ${className}`}>
      <div className="h-3 w-1/3 rounded bg-panel-hover" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-panel-hover" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** Pulsing placeholder for table bodies. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 rounded bg-panel-hover" />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify build clean**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/SkeletonCard.tsx
git commit -m "feat(ui): SkeletonCard + SkeletonRows placeholders"
```

---

### Task 5: `<DataTable>` — sortable, paginated, responsive

**Files:**
- Create: `frontend/src/components/ui/DataTable.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// frontend/src/components/ui/DataTable.tsx
import { useMemo, useState, type ReactNode } from "react";

import { pageCount, pageRangeLabel, paginate, sortRows, type SortDir } from "@/lib/table";

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer; defaults to String(row[key]). */
  render?: (row: T) => ReactNode;
  /** Value used for sorting; enables the sortable header when present. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  /** Hide this column on the mobile card fallback. */
  hideOnCard?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize?: number;
  /** Empty-state message when rows.length === 0. */
  emptyMessage?: string;
  /** Optional click handler per row. */
  onRowClick?: (row: T) => void;
}

const SortGlyph = ({ dir }: { dir: SortDir | null }) => (
  <span className="ml-1 inline-block text-[9px] leading-none text-accent">
    {dir === "asc" ? "▲" : dir === "desc" ? "▼" : ""}
  </span>
);

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize = 20,
  emptyMessage = "Sin datos.",
  onRowClick,
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    return sortRows(rows, col.sortValue, sortDir);
  }, [rows, columns, sortKey, sortDir]);

  const total = sorted.length;
  const pages = pageCount(total, pageSize);
  const current = Math.min(page, pages);
  const visible = paginate(sorted, current, pageSize);

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const alignCls = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  if (total === 0) {
    return (
      <div className="card-premium grid place-items-center px-5 py-10 text-center text-sm text-ink-faint">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="card-premium overflow-hidden">
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-bg-sunken/70 text-ink-muted backdrop-blur">
              {columns.map((c) => {
                const isSorted = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={isSorted ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                    className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${alignCls(c.align)}`}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c)}
                        className="focus-ring inline-flex items-center rounded hover:text-ink"
                      >
                        {c.header}
                        <SortGlyph dir={isSorted ? sortDir : null} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-line/60 transition-colors hover:bg-panel-hover ${
                  onRowClick ? "cursor-pointer" : ""
                }`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2.5 text-ink ${alignCls(c.align)}`}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card fallback */}
      <div className="divide-y divide-line/60 md:hidden">
        {visible.map((row) => (
          <button
            key={rowKey(row)}
            type="button"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className="focus-ring block w-full px-4 py-3 text-left"
          >
            {columns
              .filter((c) => !c.hideOnCard)
              .map((c) => (
                <div key={c.key} className="flex justify-between gap-3 py-0.5 text-sm">
                  <span className="text-ink-faint">{c.header}</span>
                  <span className="text-ink">
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                  </span>
                </div>
              ))}
          </button>
        ))}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-ink-muted">
          <span className="font-mono">{pageRangeLabel(total, current, pageSize)}</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="btn-ghost px-2.5 py-1 text-xs"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              className="btn-ghost px-2.5 py-1 text-xs"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build clean**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/DataTable.tsx
git commit -m "feat(ui): DataTable — sortable headers, pagination, mobile card fallback"
```

---

### Task 6: Reference migration — UsersPage → DataTable + constants

Proves the primitives end-to-end on a real page with a real backend table.

**Files:**
- Modify: `frontend/src/pages/UsersPage.tsx`

- [ ] **Step 1: Replace the hand-rolled `<table>` with `<DataTable>`**

In `UsersPage.tsx`, remove the manual `<table>/<thead>/<tbody>` block (the audit located it ~line 213-343) and the local `ROLE_BADGE` map (~line 25-30). Add imports:

```tsx
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ROLE_BADGE, TONE_BADGE } from "@/constants/ui";
```

Define columns above the return (use the existing user fields — adapt names to the real `User` type in the file):

```tsx
const columns: Column<User>[] = [
  { key: "name", header: "Nombre", sortValue: (u) => u.full_name ?? u.email,
    render: (u) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-ink">{u.full_name ?? "—"}</div>
        <div className="truncate text-xs text-ink-faint">{u.email}</div>
      </div>
    ) },
  { key: "role", header: "Rol", sortValue: (u) => u.role,
    render: (u) => (
      <span className={`pill ${TONE_BADGE[ROLE_BADGE[u.role] ?? "neutral"]}`}>{u.role}</span>
    ) },
  { key: "status", header: "Estado", sortValue: (u) => (u.is_active ? "activo" : "inactivo"),
    render: (u) => (
      <span className={`pill ${u.is_active ? TONE_BADGE.ok : TONE_BADGE.neutral}`}>
        {u.is_active ? "Activo" : "Inactivo"}
      </span>
    ) },
  { key: "phone", header: "Teléfono", render: (u) => u.phone ?? "—", hideOnCard: true },
];
```

Render inside the existing `DataState` wrapper:

```tsx
<DataState loading={loading} error={error} onRetry={reload} isEmpty={users.length === 0}
  emptyMessage="No hay usuarios todavía.">
  <DataTable columns={columns} rows={users} rowKey={(u) => u.id} pageSize={20} />
</DataState>
```

Keep the existing role/status filter controls and search; if a sort `<select>` existed it is now redundant (DataTable headers sort) — remove it.

- [ ] **Step 2: Verify build clean**

Run: `cd frontend && rm -f *.tsbuildinfo && rm -rf dist && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Manual check (route `/users`)**

Log in as admin (`admin@agora.gob.mx` / `Demo12345`). Verify: table sorts when clicking headers (▲▼ shows), pagination appears if >20 users, rows collapse to cards at ≤640px, keyboard Tab reaches sort buttons with a focus ring.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/UsersPage.tsx
git commit -m "refactor(users): migrate table to shared DataTable + constants (reference migration)"
```

---

### Task 7: DataState doc + Phase 0 build gate

**Files:**
- Modify: `frontend/src/components/ui/DataState.tsx`

- [ ] **Step 1: Parameterize default empty copy**

In `DataState.tsx`, leave the API intact; just confirm `emptyMessage` default reads `"Sin datos."` and add a one-line JSDoc note that real-but-uningested datasets should pass `emptyMessage="Ingesta pendiente"`. No behavior change.

- [ ] **Step 2: Full clean build of the whole app**

Run: `cd frontend && rm -f *.tsbuildinfo && rm -rf dist && npm run lint && npm run build`
Expected: PASS — Phase 0 foundation is green.

- [ ] **Step 3: Commit + deploy**

```bash
git add frontend/src/components/ui/DataState.tsx
git commit -m "docs(ui): DataState empty-state usage note"
git push   # triggers Railway GitHub auto-deploy
```

---

# Module Sweep Procedure (applies to every module task in Phases 1–3)

For each module, apply these concrete edits. This is the full procedure — module tasks reference it plus their module-specific notes.

**P-1. Header.** Ensure the page renders `<PageHeader eyebrow=… title=… accent=… subtitle=… />`. If the module is `preview`, render `<PreviewBanner />` immediately below it. Remove any bespoke heading markup.

**P-2. Async states.** Wrap every data fetch in `<DataState loading error onRetry isEmpty emptyMessage>`. Replace inline `animate-pulse` blocks with `<SkeletonCard>`/`<SkeletonRows>` passed as the `skeleton` prop. Confirm `onRetry` actually refetches (re-runs the `useAsync` loader, not a stale closure). Real-but-empty data uses `emptyMessage="Ingesta pendiente"`.

**P-3. Tabs/segmented views.** Replace ad-hoc segmented button rows with `<SegmentedControl options value onChange ariaLabel />`.

**P-4. Tables.** Replace hand-rolled `<table>` markup with `<DataTable columns rows rowKey />`. Define `Column<T>[]` with `sortValue` on sortable columns.

**P-5. Charts.** Replace inline tooltip hex objects with `contentStyle={CHART_TOOLTIP_STYLE}`; pull series colors from `CHART_PALETTE`. Remove local tooltip-style constants.

**P-6. Layout.** Replace hardcoded pixel heights with the matching `PANEL_HEIGHTS` value. Ensure grids are responsive (`grid gap-4 sm:grid-cols-2 xl:grid-cols-4` style); section rhythm uses `mb-6`/`gap-4`.

**P-7. Accessibility.** Every interactive element has `.focus-ring` (or is a `.btn`); icons-only buttons get `aria-label`.

**P-8. Motion.** Wrap primary content blocks so they enter with `reveal` (fade-up). Global reduced-motion guard already handles opt-out.

**P-9. Honesty.** Keep `PreviewBanner` + "muestra" labels on preview modules; no fabricated KPIs.

**Per-module verification (every module task):**
- Build clean: `cd frontend && rm -f *.tsbuildinfo && rm -rf dist && npm run lint && npm run build` → PASS.
- Manual: open the module's route at desktop + ≤640px; Tab through to confirm focus rings, sort, and tab nav.
- Commit: `git add <module dir> && git commit -m "feat(<module>): premium sweep — DataState/DataTable/SegmentedControl/a11y"`.

---

# PHASE 1 — Tier 3 modules (draft → premium)

Each task = one module run through the Module Sweep Procedure + the notes below.

### Task 8: `ai-analyst`
- Files: `frontend/src/modules/ai-analyst/AiAnalystPage.tsx`
- Notes: Replace hardcoded `h-[440px]` (audit: line ~42) with `PANEL_HEIGHTS.copilot`. Make the 2-col layout collapse to 1-col below `lg`. Give the idle copilot panel a richer empty state (icon + example prompts) — keep it clearly "preview / sin conexión real" per the standing no-AI directive. Apply full procedure.

### Task 9: `configuracion`
- Files: `frontend/src/modules/configuracion/ConfiguracionPage.tsx`
- Notes: Wrap integration/status rows in `<DataState>`; status pills use `TONE_BADGE`. Add `<PageHeader>` if missing. Procedure P-1..P-9.

### Task 10: `busqueda`
- Files: `frontend/src/modules/busqueda/BusquedaPage.tsx`
- Notes: Clear grouped-results layout; explicit "0 resultados" empty state via `DataState` `isEmpty`. Result rows keyboard-navigable (`.focus-ring`). Procedure P-1..P-9.

### Task 11: `organizaciones`
- Files: `frontend/src/modules/organizaciones/OrgsPage.tsx`
- Notes: Migrate the orgs list/table to `<DataTable>`; CRUD buttons use `.btn`/`.btn-ghost`. Procedure P-1..P-9.

### Task 12: `indice`
- Files: `frontend/src/modules/indice/IndicePage.tsx`
- Notes: Charts → `CHART_TOOLTIP_STYLE`/`CHART_PALETTE`; composite-score table → `DataTable`. Keep preview labelling. Procedure P-1..P-9.

### Task 13: `worldbank`
- Files: `frontend/src/modules/worldbank/WorldBankPage.tsx`
- Notes: Indicator switch → `SegmentedControl`; charts use shared palette/tooltip; ensure `DataState` wraps the World Bank fetch (real source). Procedure P-1..P-9.

**Phase 1 gate:** after Task 13, full clean build + `git push` (deploy).

---

# PHASE 2 — Tier 2 modules (standard → premium)

### Task 14: `resultados`
- Files: `frontend/src/modules/resultados/ResultadosPage.tsx`
- Notes: Remove local `TOOLTIP_STYLE` (audit: line ~37-42) → `CHART_TOOLTIP_STYLE`. View tabs (nacional/entidad/historico, ~line 69-83) → `SegmentedControl`. Results table → `DataTable`. Keep PreviewBanner. Procedure P-1..P-9.

### Task 15: `padron`
- Files: `frontend/src/modules/padron/PadronPage.tsx`
- Notes: Remove local tooltip style (~line 36-41) → constant. Tabs → `SegmentedControl`. The 7053-row per-section table → `DataTable` (pagination is essential here). Procedure P-1..P-9.

### Task 16: `ieem`
- Files: `frontend/src/modules/ieem/IeemPage.tsx`
- Notes: Dataset picker (~line 52-70) → `SegmentedControl` with loading indicator; verify `reload` retry is wired correctly (audit flagged possible stale closure). Table → `DataTable`. Procedure P-1..P-9.

### Task 17: `territorios`
- Files: `frontend/src/modules/territorios/TerritoriosPage.tsx`
- Notes: Add missing `DataState` (audit: error set but never shown, ~line 40-44). Drill-down lists → `DataTable` where tabular. Procedure P-1..P-9.

### Task 18: `economia`
- Files: `frontend/src/modules/economia/EconomiaPage.tsx`
- Notes: Charts → shared palette/tooltip; tables → `DataTable`. Keep preview labelling. Procedure P-1..P-9.

### Task 19: `denue`
- Files: `frontend/src/modules/denue/DenuePage.tsx`
- Notes: Replace local `LoadingState` manual pulse divs (audit: ~line 48-56) with `SkeletonRows`. Tables → `DataTable`. Procedure P-1..P-9.

### Task 20: `banxico`
- Files: `frontend/src/modules/banxico/BanxicoPage.tsx`
- Notes: Indicator switch → `SegmentedControl`; charts shared palette/tooltip. Procedure P-1..P-9.

### Task 21: `demografia`
- Files: `frontend/src/modules/demografia/DemografiaPage.tsx`
- Notes: Charts shared palette/tooltip; tables → `DataTable`. Keep preview labelling. Procedure P-1..P-9.

### Task 22: `auditoria`
- Files: `frontend/src/modules/auditoria/AuditoriaPage.tsx`
- Notes: Audit-events table → `DataTable` (sort by time/actor; pagination). Keep existing filters + detail drawer; ensure drawer trigger is keyboard-accessible. Procedure P-1..P-9.

### Task 23: `historial`
- Files: `frontend/src/modules/historial/HistorialPage.tsx`
- Notes: Ingest-history list → `DataTable`; `DataState` around the `/api/audit?action=ine.ingest.cartografia` fetch. Procedure P-1..P-9.

### Task 24: `reportes`
- Files: `frontend/src/modules/reportes/ReportesPage.tsx`
- Notes: Ensure export buttons (`CSV`/`window.print`) use `.btn`; wrap data sections in `DataState`. Procedure P-1..P-9.

**Phase 2 gate:** after Task 24, full clean build + `git push` (deploy).

---

# PHASE 3 — Core fine-tuning + ComingSoon

### Task 25: Core pages — additive consistency only
- Files: `frontend/src/pages/DashboardPage.tsx`, `MapExplorerPage.tsx`, `AnalyticsPage.tsx`, `SourcesPage.tsx`, `LoginPage.tsx`, `OrganizationSettingsPage.tsx`, `ProfilePage.tsx`, `ChangePasswordPage.tsx`
- Notes: These are already premium — apply ONLY: (a) replace hardcoded heights with `PANEL_HEIGHTS` (`MapExplorerPage` map `h-[600px]`→`PANEL_HEIGHTS.mapTall`; Dashboard mini-map→`PANEL_HEIGHTS.mapMini`); (b) replace any local `KIND_BADGE` (Dashboard ~line 56-61, Sources ~line 12-17) and tooltip hex with the shared constants; (c) `ParticipationChart` (`components/dashboards/ParticipationChart.tsx` ~line 58-66) tooltip → `CHART_TOOLTIP_STYLE`; (d) migrate any segmented controls to `SegmentedControl`. Do NOT restructure layouts. Verify core pages look unchanged except focus rings.
- Verify: full clean build; manual diff-check Dashboard/Map/Analytics visually.
- Commit: `git commit -m "refactor(core): adopt shared constants + responsive heights (no visual regressions)"`

### Task 26: ComingSoonPage polish pass
- Files: `frontend/src/components/modules/ComingSoonPage.tsx`
- Notes: One polish pass — ensure it uses `PageHeader`, auras, and a consistent feature-list layout. The four `soon` stubs (candidaturas/sentimiento/participacion/riesgo) inherit it; no per-stub edits.
- Commit: `git commit -m "feat(modules): polish ComingSoonPage shell"`

### Task 27: Final full-app gate + deploy
- [ ] Full clean build: `cd frontend && rm -f *.tsbuildinfo && rm -rf dist && npm run lint && npm run build` → PASS.
- [ ] Manual sweep: visit every route once at ≤640px and desktop; confirm no broken layouts, all tables sort/paginate, all async views show skeleton→data or error→retry.
- [ ] `git push` → Railway deploy. Verify https://agora-gobtech.up.railway.app loads and a sampling of swept modules render.
- [ ] Update memory `project-state.md` with the completed UI sweep.

---

## Self-Review (completed during authoring)

- **Spec coverage:** §4.1 focus baseline → Task 0. §4.2 SegmentedControl → Task 3. §4.3 DataTable → Task 5. §4.4 SkeletonCard/DataState → Tasks 4,7. §4.5 constants → Task 1. §4.6 recipe → Module Sweep Procedure. §5 tier sweep → Tasks 8-24. core fine-tuning → Task 25. soon stubs → Task 26. §6 checklist → Procedure P-1..P-9. §7 edge cases → DataTable empty/pagination, DataState retry, mobile fallback. §8 testing → per-task build+manual gates. §9 sequencing → phase gates + push deploys.
- **Placeholder scan:** no TBD/TODO; every primitive has complete code; module tasks reference the full procedure (not "similar to Task N") plus concrete file paths and line hints.
- **Type consistency:** `sortRows`/`paginate`/`pageRangeLabel`/`pageCount` (lib/table.ts) used consistently in DataTable. `Column<T>`/`SegmentOption<T>`/`Tone`/`TONE_BADGE`/`CHART_TOOLTIP_STYLE`/`PANEL_HEIGHTS` names match across tasks. `DataState` API unchanged.
- **Known adaptation:** module tasks give line hints from the 2026-06-17 audit — the executor must re-confirm exact lines (files evolve). Column defs in Task 6 must be adapted to the real `User` type field names in the file.
