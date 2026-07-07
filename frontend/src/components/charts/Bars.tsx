// frontend/src/components/charts/Bars.tsx
export interface BarItem { label: string; value: number; }

interface BarsProps {
  items: BarItem[];
  /** Fill color for non-highlighted bars; defaults to `--c-accent`. */
  color?: string;
  /** Paint the first bar with `--c-warm` instead of `color`. */
  highlightFirst?: boolean;
}

const numberFormat = new Intl.NumberFormat("es-MX");

/** Horizontal magnitude bars, single tone, with the value right-aligned. */
export function Bars({ items, color = "rgb(var(--c-accent))", highlightFirst }: BarsProps) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item, i) => {
        const pct = Math.max(0, Math.min(100, (item.value / max) * 100));
        const fill = highlightFirst && i === 0 ? "rgb(var(--c-warm))" : color;
        return (
          <div key={item.label} className="grid items-center gap-2" style={{ gridTemplateColumns: "64px 1fr 52px" }}>
            <span className="truncate text-xs text-ink-faint">{item.label}</span>
            <div className="h-2.5 overflow-hidden rounded-pill bg-ink-faint/15">
              <div className="h-full rounded-pill" style={{ width: `${pct}%`, background: fill }} />
            </div>
            <span className="text-right text-xs font-semibold tabular-nums text-ink">
              {numberFormat.format(item.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
