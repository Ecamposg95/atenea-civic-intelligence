// frontend/src/constants/ui.ts
// Single home for UI values previously duplicated across pages/charts.
import type { CSSProperties } from "react";

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
  copilot: "h-[300px] lg:h-[440px]",
} as const;
