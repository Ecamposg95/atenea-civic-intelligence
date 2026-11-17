import type { Legend } from "./mapaHelpers";

/**
 * Always-visible legend. Categorical modes list swatches; ordered modes
 * render a stepped ramp with each step labelled.
 */
export function MapLegend({ legend, className }: { legend: Legend; className?: string }) {
  const ramp = legend.kind !== "categorical";
  return (
    <figure className={`rounded-xl border border-line bg-panel/95 p-3 shadow-panel backdrop-blur ${className ?? ""}`}>
      <figcaption className="mb-2 text-xs font-semibold text-ink">{legend.title}</figcaption>
      {ramp ? (
        <ol className="flex flex-col gap-1" aria-label={legend.title}>
          {legend.items.map((it) => (
            <li key={it.label} className="flex items-center gap-2 text-xs text-ink-muted">
              <span
                className="h-3.5 w-6 shrink-0 rounded-[3px] ring-1 ring-inset ring-black/10"
                style={{ background: it.color }}
                aria-hidden="true"
              />
              <span className="tabular-nums">{it.label}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1" aria-label={legend.title}>
          {legend.items.map((it) => (
            <li key={it.label} className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                style={{ background: it.color }}
                aria-hidden="true"
              />
              <span className="truncate" title={it.label}>
                <strong className="font-semibold text-ink">{it.label.split(" ")[0]}</strong>{" "}
                {it.label.split(" ").slice(1).join(" ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {legend.note && <p className="mt-2 max-w-[16rem] text-[11px] leading-snug text-ink-muted">{legend.note}</p>}
    </figure>
  );
}
