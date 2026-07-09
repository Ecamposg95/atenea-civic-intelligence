import { Link, useNavigate } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { MetricCard } from "@/components/ui/MetricCard";
import { CellBar } from "@/components/ui/CellBar";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { AreaTrend } from "@/components/charts/AreaTrend";
import { DataState } from "@/components/ui/DataState";
import { useAsync } from "@/hooks/useAsync";
import { getSeguimiento, type SemaforoRow } from "@/api/operacion";

const STATUS: Record<string, { dot: string; label: string }> = {
  verde: { dot: "rgb(var(--c-ok))", label: "Al día" },
  ambar: { dot: "rgb(var(--c-amber))", label: "Atención" },
  rojo: { dot: "rgb(var(--c-critical))", label: "En riesgo" },
};
// Fallback for any status value not covered above (unexpected/legacy data).
const DEFAULT_STATUS = { dot: "rgb(var(--c-ink-faint))", label: "Sin estado" };
const prio = (p: string | null) =>
  (p ?? "—").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function Semaforo({ rows, onRowClick }: { rows: SemaforoRow[]; onRowClick: (seccion: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-ink-faint">
            <th className="px-3 py-2 font-semibold">Estado</th>
            <th className="px-3 py-2 font-semibold">Sección</th>
            <th className="px-3 py-2 font-semibold">Prioridad</th>
            <th className="px-3 py-2 font-semibold" style={{ minWidth: 150 }}>Avance</th>
            <th className="px-3 py-2 font-semibold text-right">Prom. / meta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = STATUS[r.status] ?? DEFAULT_STATUS;
            return (
              <tr
                key={r.seccion}
                onClick={() => onRowClick(r.seccion)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(r.seccion);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Ver plan territorial de la sección ${r.seccion}`}
                className="cursor-pointer border-t border-line/70 transition-colors hover:bg-panel-hover focus-ring"
              >
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.dot }} />
                    {st.label}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium tabular-nums">
                  {r.seccion}
                  {r.persuadible && <span className="ml-1.5 rounded-pill bg-warm/14 px-1.5 py-0.5 text-[10px] font-semibold text-warm">persuadible</span>}
                </td>
                <td className="px-3 py-2 text-ink-muted">{prio(r.prioridad)}</td>
                <td className="px-3 py-2"><CellBar value={r.pct} /></td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{r.promovidos} / {r.meta}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function WarRoomPage() {
  const state = useAsync(() => getSeguimiento(), []);
  const d = state.data;
  const nav = useNavigate();
  const goToPlan = () => nav("/plan-territorial");

  return (
    <AppLayout title="War Room" crumb="Seguimiento territorial">
      <PageHeader
        eyebrow="Operación · Seguimiento"
        title="War Room"
        subtitle="Avance de la operación territorial en vivo: cumplimiento de metas, tendencia semanal y secciones que necesitan atención."
        actions={
          <Link to="/plan-territorial" className="btn-primary focus-ring">
            Ver Plan Territorial
          </Link>
        }
      />

      <DataState loading={state.loading} error={state.error} onRetry={state.reload}>
        {d && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <MetricCard label="Cumplimiento global"
                value={d.resumen.pct_global !== null ? `${d.resumen.pct_global}%` : "—"}
                context={`${d.resumen.promovidos_total} de ${d.resumen.meta_total} meta`} tone="warm" delay={80} />
              <MetricCard label="En riesgo" value={String(d.resumen.en_riesgo)} context="secciones rojas" tone="critical" delay={120} />
              <MetricCard label="Al día" value={String(d.resumen.al_dia)} context={`de ${d.resumen.secciones} secciones`} tone="teal" delay={160} />
              <MetricCard label="Promovidos" value={String(d.resumen.promovidos_total)} context="acumulados" tone="accent" delay={200} />
            </div>

            <section>
              <SectionHeading eyebrow="Tendencia" title="Promovidos acumulados por semana" note="últimas 12 semanas" />
              <div className="mt-4">
                <ChartFrame title="Ritmo de captura" caption="acumulado semanal" empty={d.tendencia.length === 0}>
                  <AreaTrend points={d.tendencia.map((t) => ({ x: t.semana.replace(/^\d+-/, ""), y: t.promovidos }))} />
                </ChartFrame>
              </div>
            </section>

            {d.alertas.length > 0 && (
              <section>
                <SectionHeading eyebrow="Alertas" title="Secciones que necesitan refuerzo" note={`${d.alertas.length} en riesgo`} />
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {d.alertas.map((a) => (
                    <Link
                      key={a.seccion}
                      to="/plan-territorial"
                      className="card-premium focus-ring block p-4"
                      aria-label={`Ver plan territorial de la sección ${a.seccion}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-lg font-bold tabular-nums text-ink">Sec. {a.seccion}</span>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS.rojo.dot }} />
                      </div>
                      <div className="mt-1 text-xs text-ink-muted">{prio(a.prioridad)}</div>
                      <div className="mt-3 text-sm">
                        <span className="font-semibold text-state-critical tabular-nums">Faltan {a.faltan}</span>
                        <span className="text-ink-faint"> · {a.promovidos}/{a.meta}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionHeading eyebrow="Semáforo" title="Todas las secciones" note="ordenadas por avance (rezagadas primero)" />
              <div className="mt-4 card-premium p-2">
                {d.semaforo.length > 0 ? (
                  <Semaforo rows={d.semaforo} onRowClick={goToPlan} />
                ) : (
                  <p className="p-4 text-sm text-ink-faint">Sin secciones registradas.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </DataState>
    </AppLayout>
  );
}
