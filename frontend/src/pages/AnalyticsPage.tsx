import { getOverview } from "@/api/analytics";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { ParticipationChart } from "@/components/dashboards/ParticipationChart";
import { Donut } from "@/components/charts/Donut";
import { Heatmap } from "@/components/charts/Heatmap";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { AnalyticsIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import type { AnalyticsOverview } from "@/types/analytics";

export function AnalyticsPage() {
  const { data, loading, error, reload } = useAsync<AnalyticsOverview>(
    () => getOverview(),
    [],
  );

  const activity = data?.trends.activity ?? [];
  const totalEvents = activity.reduce((acc, p) => acc + p.value, 0);
  const peakEvents = activity.reduce((max, p) => Math.max(max, p.value), 0);

  const byAction = data?.by_action ?? [];
  const byActor = data?.by_actor ?? [];
  const byEntityType = data?.by_entity_type ?? [];
  const byHour = data?.by_hour ?? [];
  const actionData = byAction.map((a) => ({ name: a.action, value: a.count }));
  const entityData = byEntityType.map((e) => ({
    name: e.entity_type,
    value: e.count,
  }));
  const heatData = activity.map((p) => ({ label: p.period, value: p.value }));
  const hourData = byHour.map((h) => ({
    label: `${String(h.hour).padStart(2, "0")}:00`,
    value: h.count,
  }));
  const maxActor = byActor.reduce((m, a) => Math.max(m, a.count), 0) || 1;

  function exportCsv() {
    if (!data) return;
    const rows: string[][] = [["section", "key", "value"]];
    for (const a of data.by_action) rows.push(["by_action", a.action, String(a.count)]);
    for (const a of data.by_actor) rows.push(["by_actor", a.actor_id, String(a.count)]);
    for (const e of data.by_entity_type)
      rows.push(["by_entity_type", e.entity_type, String(e.count)]);
    for (const h of data.by_hour)
      rows.push(["by_hour", String(h.hour), String(h.count)]);
    for (const p of data.trends.activity)
      rows.push(["activity", p.period, String(p.value)]);
    for (const c of data.coverage) rows.push(["coverage", c.level, String(c.count)]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agora-analytics-${data.generated_at.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppLayout title="Activity Analytics" crumb="Operational Intelligence">
      <PageHeader
        eyebrow="Operational intelligence"
        title="Activity"
        accent="Analytics"
        subtitle="Tenant-scoped platform activity from the audit trail. Civic participation series will appear here as padrón and PREP pipelines are onboarded."
        actions={
          data && (
            <>
              <div className="card-premium px-4 py-3">
                <div className="eyebrow mb-1.5">Eventos 14d</div>
                <div className="flex items-center gap-2">
                  <AnalyticsIcon className="h-5 w-5 text-accent" />
                  <AnimatedNumber
                    value={totalEvents}
                    className="font-display text-2xl font-bold tabular-nums text-ink"
                  />
                </div>
              </div>
              <div className="card-premium px-4 py-3">
                <div className="eyebrow mb-1.5">Pico diario</div>
                <AnimatedNumber
                  value={peakEvents}
                  className="font-display text-2xl font-bold tabular-nums text-teal"
                />
              </div>
              <button
                type="button"
                onClick={exportCsv}
                className="card-premium px-4 py-3 text-left transition-colors hover:border-accent/40"
              >
                <div className="eyebrow mb-1.5">Exportar</div>
                <span className="font-display text-sm font-semibold text-accent">
                  CSV ↓
                </span>
              </button>
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
          <Card title="Eventos por día (últimos 14 días)" accentDot className="h-full">
            <DataState
              loading={loading}
              error={error}
              onRetry={reload}
              skeleton={
                <div className="h-[260px] animate-pulse rounded-lg bg-panel-hover" />
              }
            >
              {data && (
                <ParticipationChart
                  data={data.trends.activity}
                  height={260}
                  valueFormat="number"
                  seriesLabel="Eventos"
                />
              )}
            </DataState>
          </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "200ms" }}>
          <Card title="Methodology & governance" accentDot className="h-full">
            <p className="text-sm leading-relaxed text-ink-muted">
              Metrics are aggregated live from the database and are tenant-scoped.
              Individual records are never exposed; all access is audit-logged. The
              activity series is built from the audit trail.
            </p>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-panel-hover">
                <span className="text-sm text-ink">Aggregation</span>
                <span className="pill border-accent/30 bg-accent/10 text-accent">
                  Tenant-scoped
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-panel-hover">
                <span className="text-sm text-ink">Privacy</span>
                <span className="pill border-teal/30 bg-teal/10 text-teal">
                  By design
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-panel-hover">
                <span className="text-sm text-ink">Auditability</span>
                <span className="pill border-state-warning/30 bg-state-warning/10 text-state-warning">
                  Full trail
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ---- Real audit breakdowns (by action / actor / activity heatmap) ---- */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
          <Card title="Eventos por acción" accentDot className="h-full">
            <DataState
              loading={loading}
              error={error}
              onRetry={reload}
              isEmpty={!!data && actionData.length === 0}
              emptyMessage="Sin eventos en la ventana."
              skeleton={
                <div className="h-[200px] animate-pulse rounded-lg bg-panel-hover" />
              }
            >
              {data && (
                <>
                  <Donut data={actionData} height={200} />
                  <ul className="mt-3 space-y-1.5">
                    {byAction.slice(0, 6).map((a) => (
                      <li
                        key={a.action}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="truncate font-mono text-ink-muted">
                          {a.action}
                        </span>
                        <span className="font-semibold tabular-nums text-ink">
                          {a.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </DataState>
          </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "200ms" }}>
          <Card title="Actores más activos" accentDot className="h-full">
            <DataState
              loading={loading}
              error={error}
              onRetry={reload}
              isEmpty={!!data && byActor.length === 0}
              emptyMessage="Sin actividad de actores en la ventana."
              skeleton={
                <div className="h-[200px] animate-pulse rounded-lg bg-panel-hover" />
              }
            >
              {data && (
                <ul className="space-y-3">
                  {byActor.map((a) => (
                    <li key={a.actor_id}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-mono text-ink-muted">
                          {a.actor_id.slice(0, 12)}…
                        </span>
                        <span className="font-semibold tabular-nums text-ink">
                          {a.count}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-pill bg-bg-sunken ring-1 ring-inset ring-white/5">
                        <div
                          className="h-full rounded-pill bg-accent-gradient shadow-glow-accent"
                          style={{ width: `${(a.count / maxActor) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DataState>
          </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "280ms" }}>
          <Card title="Mapa de actividad (14d)" accentDot className="h-full">
            <DataState
              loading={loading}
              error={error}
              onRetry={reload}
              isEmpty={!!data && heatData.length === 0}
              emptyMessage="Sin actividad en la ventana."
              skeleton={
                <div className="h-[140px] animate-pulse rounded-lg bg-panel-hover" />
              }
            >
              {data && (
                <>
                  <Heatmap data={heatData} columns={7} />
                  <p className="mt-3 text-[11px] text-ink-faint">
                    Intensidad relativa de eventos por día (audit trail).
                  </p>
                </>
              )}
            </DataState>
          </Card>
        </div>
      </div>

      {/* ---- Entity-type breakdown + hour-of-day heatmap (real audit) ---- */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
          <Card title="Eventos por tipo de entidad" accentDot className="h-full">
            <DataState
              loading={loading}
              error={error}
              onRetry={reload}
              isEmpty={!!data && entityData.length === 0}
              emptyMessage="Sin entidades registradas en la ventana."
              skeleton={
                <div className="h-[200px] animate-pulse rounded-lg bg-panel-hover" />
              }
            >
              {data && (
                <>
                  <Donut data={entityData} height={200} />
                  <ul className="mt-3 space-y-1.5">
                    {byEntityType.slice(0, 8).map((e) => (
                      <li
                        key={e.entity_type}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="truncate font-mono text-ink-muted">
                          {e.entity_type}
                        </span>
                        <span className="font-semibold tabular-nums text-ink">
                          {e.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </DataState>
          </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "200ms" }}>
          <Card title="Actividad por hora del día (24h)" accentDot className="h-full">
            <DataState
              loading={loading}
              error={error}
              onRetry={reload}
              isEmpty={!!data && hourData.length === 0}
              emptyMessage="Sin actividad en la ventana."
              skeleton={
                <div className="h-[140px] animate-pulse rounded-lg bg-panel-hover" />
              }
            >
              {data && (
                <>
                  <Heatmap data={hourData} columns={12} />
                  <p className="mt-3 text-[11px] text-ink-faint">
                    Distribución de eventos por hora UTC (00–23), audit trail.
                  </p>
                </>
              )}
            </DataState>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
