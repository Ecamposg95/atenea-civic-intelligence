import type { AreaProperties } from "@/types/maps";

interface Props { area: (AreaProperties & { metric: number }) | null; onClose: () => void; }

export function AreaDetailPanel({ area, onClose }: Props) {
  if (!area) return null;
  return (
    <div className="absolute right-3 top-3 z-10 w-64 rounded-lg border border-line bg-panel/95 p-4 backdrop-blur">
      <div className="flex items-start justify-between">
        <div>
          <div className="eyebrow">{area.level}</div>
          <div className="text-base font-semibold text-ink">{area.name}</div>
          {area.code && <div className="text-xs text-ink-faint">{area.code}</div>}
        </div>
        <button onClick={onClose} className="text-ink-faint hover:text-ink">✕</button>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-ink-muted">Métrica (muestra)</span><span className="text-ink">{(area.metric * 100).toFixed(1)}%</span></div>
        <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2 text-xs text-ink-faint">
          Drill-down a distritos/secciones disponible al ingerir niveles inferiores.
        </div>
      </div>
    </div>
  );
}
