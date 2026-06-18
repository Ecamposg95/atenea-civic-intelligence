// frontend/src/constants/ui.ts
// Single home for UI values previously duplicated across pages/charts.
import type { CSSProperties } from "react";

/** Recharts <Tooltip contentStyle> — matches the DataV panel look. */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
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
