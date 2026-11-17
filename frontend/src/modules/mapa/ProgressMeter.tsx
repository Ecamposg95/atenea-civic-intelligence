import { barWidth, fmt, formatPct, pctOf } from "./mapaHelpers";

interface Props {
  label: string;
  value: number;
  meta: number;
  size?: "sm" | "md" | "lg";
  /** Hide the label row (when the caller renders its own). */
  compact?: boolean;
}

/**
 * "captured / meta" progress bar. Text stays in ink tokens; the bar carries
 * the magnitude, and turns to the OK tone once the meta is reached.
 */
export function ProgressMeter({ label, value, meta, size = "md", compact = false }: Props) {
  const p = pctOf(value, meta);
  const w = barWidth(value, meta);
  const done = p !== null && p >= 100;
  const h = size === "lg" ? "h-2.5" : size === "sm" ? "h-1.5" : "h-2";
  return (
    <span className="block min-w-0">
      {!compact && (
        <span className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
          <span className="text-ink-muted">{label}</span>
          <span className="tabular-nums text-ink">
            <strong className="font-semibold">{fmt(value)}</strong>
            <span className="text-ink-muted"> / {fmt(meta)}</span>
            <span className="ml-2 text-xs text-ink-muted">{formatPct(p)}</span>
          </span>
        </span>
      )}
      <span
        className={`${h} block w-full overflow-hidden rounded-full bg-line/70`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={meta || 100}
        aria-valuenow={Math.min(value, meta || value)}
        aria-valuetext={`${fmt(value)} de ${fmt(meta)} (${formatPct(p)})`}
      >
        <span
          className={`block h-full rounded-full transition-[width] duration-700 ease-out ${done ? "bg-state-ok" : "bg-accent"}`}
          style={{ width: `${w}%`, minWidth: value > 0 ? 4 : 0 }}
        />
      </span>
    </span>
  );
}
