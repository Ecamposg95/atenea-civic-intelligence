import { ProgressMeter } from "./ProgressMeter";
import { fmt, formatPct, pctOf, type Totales } from "./mapaHelpers";

function Kpi({ label, value, meta, hero = false }: { label: string; value: number; meta: number; hero?: boolean }) {
  const p = pctOf(value, meta);
  return (
    <div className={`panel flex min-w-0 flex-col justify-between gap-3 p-4 ${hero ? "col-span-2 lg:col-span-1" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-ink-muted">{label}</h2>
        <span className="text-sm font-semibold tabular-nums text-ink">{formatPct(p)}</span>
      </div>
      <p className="font-display leading-none tracking-tight text-ink">
        <span className={`font-bold tabular-nums ${hero ? "text-4xl" : "text-3xl"}`}>{fmt(value)}</span>
        <span className="ml-1.5 text-sm font-medium text-ink-muted">de {fmt(meta)}</span>
      </p>
      <ProgressMeter label={`${label} capturados contra la meta`} value={value} meta={meta} size={hero ? "lg" : "md"} compact />
    </div>
  );
}

/** Campaign-wide progress: three metas plus the legacy count, always on top. */
export function KpiStrip({ totales }: { totales: Totales }) {
  const { meta, avance } = totales;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1.35fr_0.9fr]">
      <Kpi label="Líderes" value={avance.lideres} meta={meta.lideres} />
      <Kpi label="Activistas" value={avance.activistas} meta={meta.activistas} />
      <Kpi label="Promovidos" value={avance.promovidos} meta={meta.promovidos} hero />
      <div className="panel col-span-2 flex min-w-0 flex-col justify-between gap-2 p-4 lg:col-span-1">
        <h2 className="text-sm font-medium text-ink-muted">Valores viejos</h2>
        <p className="font-display text-3xl font-bold leading-none tracking-tight tabular-nums text-ink">
          {fmt(avance.viejos)}
        </p>
        <p className="text-xs leading-snug text-ink-muted">Registros previos; se muestran aparte y no suman a la meta.</p>
      </div>
    </div>
  );
}
