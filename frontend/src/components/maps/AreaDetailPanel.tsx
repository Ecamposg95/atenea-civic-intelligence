import type { AreaProperties } from "@/types/maps";

interface Props {
  area: (AreaProperties & { metric: number }) | null;
  onClose: () => void;
  /** Optional: state name for a selected municipio (its `code`), shown explicitly. */
  stateName?: string | null;
}

const LEVEL_LABEL: Record<string, string> = {
  state: "Entidad",
  district: "Distrito",
  municipality: "Municipio",
};

export function AreaDetailPanel({ area, onClose, stateName }: Props) {
  if (!area) return null;
  const pct = Math.max(0, Math.min(1, area.metric)) * 100;
  return (
    <div className="animate-fade-up absolute right-3 top-3 z-10 w-72 overflow-hidden rounded-xl border border-line-strong/70 bg-panel/75 p-4 shadow-glow-accent backdrop-blur-md">
      {/* accent hairline */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-accent-gradient opacity-70"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow text-accent">
            {LEVEL_LABEL[area.level] ?? area.level}
          </div>
          <div className="mt-0.5 truncate font-display text-lg font-semibold leading-tight text-ink">
            {area.name}
          </div>
          {area.code && (
            <span className="mt-1.5 inline-flex rounded-md border border-line bg-bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
              {area.code}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="shrink-0 rounded-md px-1 text-ink-faint transition-colors hover:bg-panel-hover hover:text-ink"
        >
          ✕
        </button>
      </div>

      {/* Explicit metadata: level, code, and (for municipios) the parent state. */}
      <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-faint">Nivel</dt>
          <dd className="font-medium text-ink-muted">
            {LEVEL_LABEL[area.level] ?? area.level}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-faint">Código</dt>
          <dd className="truncate font-mono text-ink-muted">{area.code ?? "—"}</dd>
        </div>
        {area.level === "municipality" && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-faint">Entidad</dt>
            <dd className="truncate font-medium text-teal">
              {stateName ?? area.code ?? "—"}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs text-ink-muted">Métrica (muestra)</span>
          <span className="font-mono text-sm font-semibold text-ink">
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-pill bg-bg-sunken ring-1 ring-inset ring-white/5">
          <div
            className="animate-fade-in h-full rounded-pill bg-accent-gradient shadow-glow-accent"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-bg-sunken px-3 py-2 text-[11px] leading-relaxed text-ink-faint">
        Drill-down a distritos/secciones disponible al ingerir niveles inferiores.
      </div>
    </div>
  );
}
