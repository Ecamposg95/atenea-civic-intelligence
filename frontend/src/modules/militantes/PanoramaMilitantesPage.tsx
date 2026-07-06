import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { StackedBars } from "@/components/charts/StackedBars";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import type { Column } from "@/components/ui/DataTable";
import { DataTable } from "@/components/ui/DataTable";
import { Sparkline } from "@/components/ui/Sparkline";
import { CHART_PALETTE } from "@/constants/ui";
import { useAsync } from "@/hooks/useAsync";
import { getPanorama, type Panorama } from "@/api/militantes";

const PRIORIDAD_CLASS: Record<string, string> = {
  DEFENDER_EXPANDIR: "bg-state-success/10 text-state-success",
  COMPETITIVA: "bg-state-warning/10 text-state-warning",
  RECUPERAR_OPOSICION: "bg-state-critical/10 text-state-critical",
  ALTA_PERSUADIBLE: "bg-accent/10 text-accent",
};

type PorSeccion = Panorama["por_seccion"][number];
type PorActivista = Panorama["por_activista"][number];

const pct = (num: number, den: number): string =>
  den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—";

const SECCION_COLUMNS: Column<PorSeccion>[] = [
  {
    key: "seccion",
    header: "Sección",
    sortValue: (r) => r.seccion,
    render: (r) => <span className="font-mono font-medium text-ink">{r.seccion}</span>,
  },
  {
    key: "militantes",
    header: "Militantes",
    align: "right",
    sortValue: (r) => r.militantes,
    render: (r) => <span className="font-mono tabular-nums text-accent">{r.militantes}</span>,
  },
  {
    key: "lista_nominal",
    header: "Lista nominal",
    align: "right",
    sortValue: (r) => r.lista_nominal ?? -1,
    render: (r) => (
      <span className="font-mono tabular-nums text-ink-muted">
        {r.lista_nominal != null ? r.lista_nominal.toLocaleString("en-US") : "—"}
      </span>
    ),
  },
  {
    key: "prioridad",
    header: "Prioridad",
    sortValue: (r) => r.prioridad ?? "",
    render: (r) =>
      r.prioridad ? (
        <span className={`pill ${PRIORIDAD_CLASS[r.prioridad] ?? ""}`}>
          {r.prioridad.replace(/_/g, " ")}
        </span>
      ) : (
        "—"
      ),
  },
  {
    key: "promovidos",
    header: "Promovidos",
    align: "right",
    sortValue: (r) => r.promovidos,
    render: (r) => <span className="font-mono tabular-nums text-teal">{r.promovidos}</span>,
  },
];

const ACTIVISTA_COLUMNS: Column<PorActivista>[] = [
  {
    key: "nombre",
    header: "Activista",
    sortValue: (r) => r.nombre,
    render: (r) => <span className="font-medium text-ink">{r.nombre}</span>,
  },
  {
    key: "militantes",
    header: "Militantes",
    align: "right",
    sortValue: (r) => r.militantes,
    render: (r) => <span className="font-mono tabular-nums text-accent">{r.militantes}</span>,
  },
  {
    key: "con_banderas",
    header: "Con banderas",
    align: "right",
    sortValue: (r) => r.con_banderas,
    render: (r) => (
      <span
        className={`font-mono tabular-nums ${r.con_banderas > 0 ? "text-state-warning" : "text-ink-faint"}`}
      >
        {r.con_banderas}
      </span>
    ),
  },
];

export default function PanoramaMilitantesPage() {
  const state = useAsync(getPanorama, []);
  const data = state.data;
  const isEmpty = !state.loading && !state.error && (data?.kpis.total ?? 0) === 0;

  const kpis = data?.kpis;
  const avancePct = kpis && kpis.meta ? Math.min(1, kpis.total / kpis.meta) : null;

  const vsPromovidosData =
    data?.por_seccion.map((s) => ({
      seccion: s.seccion,
      militantes: s.militantes,
      promovidos: s.promovidos,
    })) ?? [];

  return (
    <AppLayout title="Panorama de Militantes" crumb="Afiliación">
      <PageHeader
        eyebrow="Afiliación"
        title="Panorama de"
        accent="Militantes"
        subtitle="Avance de afiliación, cobertura por sección y desempeño por activista."
      />

      <DataState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
        isEmpty={isEmpty}
        emptyMessage="Aún no hay militantes registrados"
      >
        <div className="flex flex-col gap-4">
          {/* Bloque 1: Avance — el número que Lucy lee de un vistazo */}
          <Card title="Avance de afiliación" accentDot>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              {/* Hero KPI: total de militantes vs. meta */}
              <div className="hud-corners card-premium relative overflow-hidden p-6 lg:col-span-3">
                <span className="eyebrow">Total militantes</span>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-display text-5xl font-bold leading-none tabular-nums text-gradient sm:text-6xl">
                    <AnimatedNumber value={kpis?.total ?? 0} />
                  </span>
                  {kpis?.meta ? (
                    <span className="font-mono text-sm text-ink-faint">
                      / {kpis.meta.toLocaleString("en-US")} meta
                    </span>
                  ) : null}
                </div>

                {data && data.trend.length > 0 && (
                  <div className="mt-3 -mb-1 max-w-xs">
                    <Sparkline data={data.trend} height={32} className="w-full" />
                  </div>
                )}

                {avancePct != null && (
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-xs text-ink-faint">
                      <span>Avance hacia la meta</span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-accent">
                        {(avancePct * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-panel-hover">
                      <div
                        className="h-full rounded-full bg-accent-gradient shadow-glow-accent transition-all duration-700 ease-out"
                        style={{ width: `${(avancePct * 100).toFixed(1)}%` }}
                      />
                    </div>
                    <span className="mt-1 block text-right font-mono text-[11px] text-ink-faint">
                      {kpis?.total} / {kpis?.meta}
                    </span>
                  </div>
                )}
              </div>

              {/* Métricas de apoyo — deliberadamente más discretas que el hero */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-1">
                <div className="card-premium p-4">
                  <span className="eyebrow block">% validados</span>
                  <div className="mt-1.5 font-display text-xl font-bold tabular-nums text-teal">
                    {kpis ? pct(kpis.validados, kpis.total) : "—"}
                  </div>
                  <span className="mt-0.5 block text-xs text-ink-faint">
                    {kpis?.validados ?? 0} de {kpis?.total ?? 0}
                  </span>
                </div>
                <div className="card-premium p-4">
                  <span className="eyebrow block">Ritmo 7 días</span>
                  <div className="mt-1.5 font-display text-xl font-bold tabular-nums text-accent">
                    <AnimatedNumber value={kpis?.ritmo_7d ?? 0} />
                  </div>
                  <span className="mt-0.5 block text-xs text-ink-faint">militantes/día</span>
                </div>
                <div className="card-premium p-4">
                  <span className="eyebrow block">Ritmo 30 días</span>
                  <div className="mt-1.5 font-display text-xl font-bold tabular-nums text-accent">
                    <AnimatedNumber value={kpis?.ritmo_30d ?? 0} />
                  </div>
                  <span className="mt-0.5 block text-xs text-ink-faint">militantes/día</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Bloque 2: Por sección (SMA) */}
          <Card title="Por sección (SMA)" accentDot>
            <DataTable
              columns={SECCION_COLUMNS}
              rows={data?.por_seccion ?? []}
              rowKey={(r) => r.seccion}
              defaultSortKey="militantes"
              defaultSortDir="desc"
              emptyMessage="Aún no hay militantes registrados"
            />
          </Card>

          {/* Bloque 3: Por activista */}
          <Card title="Por activista" accentDot>
            <DataTable
              columns={ACTIVISTA_COLUMNS}
              rows={data?.por_activista ?? []}
              rowKey={(r) => r.activista_id ?? r.nombre}
              defaultSortKey="militantes"
              defaultSortDir="desc"
              emptyMessage="Aún no hay militantes registrados"
            />
          </Card>

          {/* Bloque 4: Militantes vs promovidos */}
          <Card title="Militantes vs. promovidos por sección" accentDot>
            {vsPromovidosData.length > 0 ? (
              <StackedBars
                data={vsPromovidosData}
                xKey="seccion"
                series={[
                  { key: "militantes", color: CHART_PALETTE[0] },
                  { key: "promovidos", color: CHART_PALETTE[2] },
                ]}
              />
            ) : (
              <div className="grid place-items-center px-5 py-8 text-center text-sm text-ink-faint">
                Aún no hay militantes registrados
              </div>
            )}
          </Card>
        </div>
      </DataState>
    </AppLayout>
  );
}
