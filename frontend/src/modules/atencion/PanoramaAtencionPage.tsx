// frontend/src/modules/atencion/PanoramaAtencionPage.tsx
import { Link, useNavigate } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Donut, type DonutDatum } from "@/components/charts/Donut";
import { DataState } from "@/components/ui/DataState";
import type { Column } from "@/components/ui/DataTable";
import { DataTable } from "@/components/ui/DataTable";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { AlertIcon, LayersIcon, ShieldIcon } from "@/components/ui/icons";
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

const nf = new Intl.NumberFormat("es-MX");

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
  const nav = useNavigate();
  const goToCasos = () => nav("/atencion/casos");
  const isEmpty = !state.loading && !state.error && (data?.kpis?.total ?? 0) === 0;

  const kpis = data?.kpis;

  const estadoDonut: DonutDatum[] = ESTADO_ORDER.filter(
    (estado) => (data?.por_estado?.[estado] ?? 0) > 0,
  ).map((estado) => ({
    name: ESTADO_LABEL[estado],
    value: data?.por_estado?.[estado] ?? 0,
    color: ESTADO_DONUT_COLOR[estado],
  }));

  const maxColonia = Math.max(0, ...(data?.por_colonia ?? []).map((c) => c.casos));

  return (
    <AppLayout title="Panorama de Atención Ciudadana" crumb="Atención Ciudadana">
      <PageHeader
        eyebrow="Atención Ciudadana"
        title="Panorama de"
        accent="Casos"
        subtitle="Volumen, cumplimiento de SLA y distribución territorial de los casos ciudadanos."
        actions={
          <Link to="/atencion/casos" className="btn-primary focus-ring">
            Ver casos
          </Link>
        }
      />

      <DataState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
        isEmpty={isEmpty}
        emptyMessage="Aún no hay casos"
      >
        <div className="flex flex-col gap-6">
          {/* Bloque 1: KPI row */}
          <section className="flex flex-col gap-4">
            <SectionHeading eyebrow="Atención Ciudadana" title="Estado general" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard
                label="Total casos"
                value={kpis ? nf.format(kpis.total) : "—"}
                countTo={kpis?.total ?? 0}
                tone="warm"
                context="Volumen total registrado"
                icon={<LayersIcon width={16} height={16} />}
                delay={0}
              />

              <MetricCard
                label="Pendientes"
                value={kpis ? nf.format(kpis.pendientes) : "—"}
                countTo={kpis?.pendientes ?? 0}
                tone="accent"
                context={kpis ? `${pct(kpis.pendientes, kpis.total)} del total` : undefined}
                delay={60}
              />

              <MetricCard
                label="Atendidos"
                value={kpis ? nf.format(kpis.atendidos) : "—"}
                countTo={kpis?.atendidos ?? 0}
                tone="teal"
                context={kpis ? `${pct(kpis.atendidos, kpis.total)} del total` : undefined}
                icon={<ShieldIcon width={16} height={16} />}
                delay={120}
              />

              <MetricCard
                label="SLA vencidos"
                value={kpis ? nf.format(kpis.sla_vencidos) : "—"}
                countTo={kpis?.sla_vencidos ?? 0}
                tone="critical"
                context="Requieren atención inmediata"
                icon={<AlertIcon width={16} height={16} />}
                delay={180}
              />

              <MetricCard
                label="Tiempo prom."
                value={kpis ? (kpis.tiempo_prom_dias ?? 0).toFixed(1) : "—"}
                countTo={kpis?.tiempo_prom_dias ?? 0}
                format={(n) => n.toFixed(1)}
                tone="accent"
                context="Días promedio de resolución"
                delay={240}
              />
            </div>
          </section>

          {/* Bloque 2: Por estado */}
          <ChartFrame
            title="Casos por estado"
            caption="Distribución del total de casos según su etapa actual."
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Donut data={estadoDonut} height={220} centerLabel="Casos" />
              <div className="flex flex-col justify-center gap-2">
                {ESTADO_ORDER.map((estado) => (
                  <div key={estado} className="flex items-center justify-between gap-3 text-sm">
                    <span className="inline-flex items-center gap-2 text-ink-muted">
                      <span className={`h-2.5 w-2.5 rounded-full ${ESTADO_DOT_CLASS[estado]}`} />
                      {ESTADO_LABEL[estado]}
                    </span>
                    <span className="font-mono tabular-nums text-ink">
                      {data?.por_estado?.[estado] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </ChartFrame>

          {/* Bloque 3: Por colonia — semáforo territorial */}
          <section className="flex flex-col gap-4">
            <SectionHeading title="Por colonia" note="Semáforo territorial" />
            <DataTable
              columns={COLONIA_COLUMNS(maxColonia)}
              rows={data?.por_colonia ?? []}
              rowKey={(r) => r.colonia}
              defaultSortKey="casos"
              defaultSortDir="desc"
              emptyMessage="Aún no hay casos"
              onRowClick={goToCasos}
            />
          </section>

          {/* Bloque 4: Por responsable */}
          <section className="flex flex-col gap-4">
            <SectionHeading title="Por responsable" />
            <DataTable
              columns={RESPONSABLE_COLUMNS}
              rows={data?.por_responsable ?? []}
              rowKey={(r) => r.asignado_a ?? r.nombre}
              defaultSortKey="casos"
              defaultSortDir="desc"
              emptyMessage="Aún no hay casos"
              onRowClick={goToCasos}
            />
          </section>
        </div>
      </DataState>
    </AppLayout>
  );
}
