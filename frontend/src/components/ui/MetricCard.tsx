import type { ReactNode } from "react";
import { ArrowUpIcon } from "./icons";
import { AnimatedNumber } from "./AnimatedNumber";
import { Sparkline } from "./Sparkline";

type Tone = "accent" | "teal" | "warning" | "critical";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
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
    stroke: "#22d3ee",
    fill: "rgba(34,211,238,0.32)",
  },
  teal: {
    text: "text-teal",
    glow: "shadow-glow-teal",
    stroke: "#2dd4bf",
    fill: "rgba(45,212,191,0.30)",
  },
  warning: {
    text: "text-state-warning",
    glow: "shadow-glow",
    stroke: "#f5b53d",
    fill: "rgba(216,178,90,0.28)",
  },
  critical: {
    text: "text-state-critical",
    glow: "shadow-glow",
    stroke: "#f4607a",
    fill: "rgba(244,96,122,0.28)",
  },
};

export function MetricCard({
  label,
  value,
  delta,
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
        <span className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${t.text}`}>
          <ArrowUpIcon /> {delta}
        </span>
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
