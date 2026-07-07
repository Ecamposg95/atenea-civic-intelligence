// frontend/src/modules/atencion/PanoramaAtencionPage.tsx
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Donut, type DonutDatum } from "@/components/charts/Donut";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import type { Column } from "@/components/ui/DataTable";
import { DataTable } from "@/components/ui/DataTable";
import { AlertIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import { getCasoPanorama, type CasoPanorama } from "@/api/atencion";

type PorColonia = CasoPanorama["por_colonia"][number];
type PorResponsable = CasoPanorama["por_responsable"][number];

const ESTADO_ORDER = ["PENDIENTE", "EN_PROCESO", "ATENDIDO", "CERRADO"] as const;

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  ATENDIDO: "Atendido",
  CERRADO: "Cerrado",
};

// Estado color semantics (global-constraints): PENDIENTE=neutral, EN_PROCESO=accent/cyan,
// ATENDIDO=success/teal, CERRADO=muted.
const ESTADO_DONUT_COLOR: Record<string, string> = {
  PENDIENTE: "rgb(var(--c-ink-faint))",
  EN_PROCESO: "rgb(var(--c-accent))",
  ATENDIDO: "rgb(var(--c-teal))",
  CERRADO: "rgb(var(--c-ink-muted))",
};

const ESTADO_DOT_CLASS: Record<string, string> = {
  PENDIENTE: "bg-ink-faint",
  EN_PROCESO: "bg-accent",
  ATENDIDO: "bg-teal",
  CERRADO: "bg-ink-muted",
};

const pct = (num: number, den: number): string =>
  den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—";

// Territorial "semáforo": colonias con más casos pendientes que atendidos se marcan en rojo/ámbar.
const semaforoClass = (count: number, max: number): string => {
  if (max <= 0) return "text-ink-muted";
  const ratio = count / max;
  if (ratio >= 0.66) return "text-state-critical";
  if (ratio >= 0.33) return "text-state-warning";
  return "text-teal";
};

const COLONIA_COLUMNS = (max: number): Column<PorColonia>[] => [
  {
    key: "colonia",
    header: "Colonia",
    sortValue: (r) => r.colonia,
    render: (r) => <span className="font-medium text-ink">{r.colonia || "Sin colonia"}</span>,
  },
  {
    key: "casos",
    header: "Casos",
    align: "right",
    sortValue: (r) => r.casos,
    render: (r) => (
      <span className={`font-mono font-semibold tabular-nums ${semaforoClass(r.casos, max)}`}>
        {r.casos}
      </span>
    ),
  },
];

const RESPONSABLE_COLUMNS: Column<PorResponsable>[] = [
  {
    key: "nombre",
    header: "Responsable",
    sortValue: (r) => r.nombre,
    render: (r) => <span className="font-medium text-ink">{r.nombre || "Sin asignar"}</span>,
  },
  {
    key: "casos",
    header: "Casos",
    align: "right",
    sortValue: (r) => r.casos,
    render: (r) => (
      <span className="font-mono tabular-nums text-accent">{r.casos}</span>
    ),
  },
];

export default function PanoramaAtencionPage() {
  const state = useAsync(getCasoPanorama, []);
  const data = state.data;
  const isEmpty = !state.loading && !state.error && (data?.kpis.total ?? 0) === 0;

  const kpis = data?.kpis;

  const estadoDonut: DonutDatum[] = ESTADO_ORDER.filter(
    (estado) => (data?.por_estado[estado] ?? 0) > 0,
  ).map((estado) => ({
    name: ESTADO_LABEL[estado],
    value: data?.por_estado[estado] ?? 0,
    color: ESTADO_DONUT_COLOR[estado],
  }));

  const maxColonia = Math.max(0, ...(data?.por_colonia.map((c) => c.casos) ?? [0]));

  return (
    <AppLayout title="Panorama de Atención Ciudadana" crumb="Atención Ciudadana">
      <PageHeader
        eyebrow="Atención Ciudadana"
        title="Panorama de"
        accent="Casos"
        subtitle="Volumen, cumplimiento de SLA y distribución territorial de los casos ciudadanos."
      />

      <DataState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
        isEmpty={isEmpty}
        emptyMessage="Aún no hay casos"
      >
        <div className="flex flex-col gap-4">
          {/* Bloque 1: KPI row */}
          <Card title="Estado general" accentDot>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="card-premium p-4">
                <span className="eyebrow block">Total casos</span>
                <div className="mt-1.5 font-display text-3xl font-bold tabular-nums text-gradient">
                  <AnimatedNumber value={kpis?.total ?? 0} />
                </div>
              </div>

              <div className="card-premium p-4">
                <span className="eyebrow block">Pendientes</span>
                <div className="mt-1.5 font-display text-3xl font-bold tabular-nums text-ink-muted">
                  <AnimatedNumber value={kpis?.pendientes ?? 0} />
                </div>
                <span className="mt-0.5 block text-xs text-ink-faint">
                  {kpis ? pct(kpis.pendientes, kpis.total) : "—"} del total
                </span>
              </div>

              <div className="card-premium p-4">
                <span className="eyebrow block">Atendidos</span>
                <div className="mt-1.5 font-display text-3xl font-bold tabular-nums text-teal">
                  <AnimatedNumber value={kpis?.atendidos ?? 0} />
                </div>
                <span className="mt-0.5 block text-xs text-ink-faint">
                  {kpis ? pct(kpis.atendidos, kpis.total) : "—"} del total
                </span>
              </div>

              {/* Hero warning: SLA vencidos */}
              <div className="hud-corners card-premium relative overflow-hidden border-state-critical/30 bg-state-critical/5 p-4">
                <div className="flex items-center gap-2">
                  <span className="metric-chip h-8 w-8 shrink-0 text-state-critical">
                    <AlertIcon width={16} height={16} />
                  </span>
                  <span className="eyebrow block text-state-critical">SLA vencidos</span>
                </div>
                <div className="mt-1.5 font-display text-3xl font-bold tabular-nums text-state-critical">
                  <AnimatedNumber value={kpis?.sla_vencidos ?? 0} />
                </div>
                <span className="mt-0.5 block text-xs text-ink-faint">requieren atención inmediata</span>
              </div>

              <div className="card-premium p-4">
                <span className="eyebrow block">Tiempo prom.</span>
                <div className="mt-1.5 font-display text-3xl font-bold tabular-nums text-accent">
                  <AnimatedNumber value={kpis?.tiempo_prom_dias ?? 0} format={(n) => n.toFixed(1)} />
                </div>
                <span className="mt-0.5 block text-xs text-ink-faint">días promedio de resolución</span>
              </div>
            </div>
          </Card>

          {/* Bloque 2: Por estado */}
          <Card title="Casos por estado" accentDot>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Donut data={estadoDonut} height={220} />
              <div className="flex flex-col justify-center gap-2">
                {ESTADO_ORDER.map((estado) => (
                  <div key={estado} className="flex items-center justify-between gap-3 text-sm">
                    <span className="inline-flex items-center gap-2 text-ink-muted">
                      <span className={`h-2.5 w-2.5 rounded-full ${ESTADO_DOT_CLASS[estado]}`} />
                      {ESTADO_LABEL[estado]}
                    </span>
                    <span className="font-mono tabular-nums text-ink">
                      {data?.por_estado[estado] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Bloque 3: Por colonia — semáforo territorial */}
          <Card title="Por colonia (semáforo territorial)" accentDot>
            <DataTable
              columns={COLONIA_COLUMNS(maxColonia)}
              rows={data?.por_colonia ?? []}
              rowKey={(r) => r.colonia}
              defaultSortKey="casos"
              defaultSortDir="desc"
              emptyMessage="Aún no hay casos"
            />
          </Card>

          {/* Bloque 4: Por responsable */}
          <Card title="Por responsable" accentDot>
            <DataTable
              columns={RESPONSABLE_COLUMNS}
              rows={data?.por_responsable ?? []}
              rowKey={(r) => r.asignado_a ?? r.nombre}
              defaultSortKey="casos"
              defaultSortDir="desc"
              emptyMessage="Aún no hay casos"
            />
          </Card>
        </div>
      </DataState>
    </AppLayout>
  );
}
