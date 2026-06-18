import type { ReactNode } from "react";
import { ArrowUpIcon } from "./icons";
import { AnimatedNumber } from "./AnimatedNumber";
import { Sparkline } from "./Sparkline";

type Tone = "accent" | "teal" | "warning" | "critical";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  /** Directional indicator for the delta badge.
   * - omitted / undefined → same as before: up-arrow + tone-colored accent text
   * - "up"   → up-arrow + positive/accent color (same as default)
   * - "down" → down-arrow + muted/critical color
   * - "flat" → no arrow, neutral muted color
   */
  deltaDir?: "up" | "down" | "flat";
  icon?: ReactNode;
  trend?: number[];
  tone?: Tone;
  countTo?: number;
  format?: (n: number) => string;
  delay?: number;
}

const TONE: Record<
  Tone,
  { text: string; glow: string; stroke: string; fill: string }
> = {
  accent: {
    text: "text-accent",
    glow: "shadow-glow-accent",
    stroke: "var(--chart-1)",
    fill: "color-mix(in srgb, var(--chart-1) 32%, transparent)",
  },
  teal: {
    text: "text-teal",
    glow: "shadow-glow-teal",
    stroke: "var(--chart-3)",
    fill: "color-mix(in srgb, var(--chart-3) 30%, transparent)",
  },
  warning: {
    text: "text-state-warning",
    glow: "shadow-glow",
    stroke: "var(--chart-2)",
    fill: "color-mix(in srgb, var(--chart-2) 28%, transparent)",
  },
  critical: {
    text: "text-state-critical",
    glow: "shadow-glow",
    stroke: "var(--chart-4)",
    fill: "color-mix(in srgb, var(--chart-4) 28%, transparent)",
  },
};

export function MetricCard({
  label,
  value,
  delta,
  deltaDir,
  icon,
  trend,
  tone = "accent",
  countTo,
  format,
  delay,
}: MetricCardProps) {
  const t = TONE[tone];

  return (
    <div
      className="card-premium hud-corners reveal p-5"
      style={{ animationDelay: delay ? `${delay}ms` : undefined }}
    >
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        {icon && (
          <span className={`metric-chip h-9 w-9 ${t.text} ${t.glow}`}>
            {icon}
          </span>
        )}
      </div>

      <div className="mt-3 font-display text-3xl font-bold tabular-nums tracking-tight text-ink">
        {typeof countTo === "number" ? (
          <AnimatedNumber value={countTo} format={format} />
        ) : (
          value
        )}
      </div>

      {delta ? (
        deltaDir === "down" ? (
          // Falling series: down-arrow + muted/critical color
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-state-critical">
            <ArrowUpIcon style={{ transform: "rotate(180deg)" }} /> {delta}
          </span>
        ) : deltaDir === "flat" ? (
          // Flat/neutral: no arrow
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
            {delta}
          </span>
        ) : (
          // "up" or omitted (default behavior — backward-compatible)
          <span className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${t.text}`}>
            <ArrowUpIcon /> {delta}
          </span>
        )
      ) : (
        <span className="mt-2 inline-flex text-xs text-ink-faint">Baseline</span>
      )}

      {trend && trend.length > 0 && (
        <div className="mt-3 -mb-1">
          <Sparkline
            data={trend}
            width={220}
            height={32}
            stroke={t.stroke}
            fillFrom={t.fill}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
