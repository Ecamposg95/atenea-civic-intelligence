import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Bars } from "@/components/charts/Bars";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Donut, type DonutDatum } from "@/components/charts/Donut";
import { Avatar } from "@/components/ui/Avatar";
import { CellBar } from "@/components/ui/CellBar";
import type { Column } from "@/components/ui/DataTable";
import { DataTable } from "@/components/ui/DataTable";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StatusPill } from "@/components/ui/StatusPill";
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

/** Up to two initials from a full name, for the Avatar element. */
const initials = (nombre: string): string => {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

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
    key: "cobertura",
    header: "Cobertura",
    align: "right",
    sortValue: (r) => (r.lista_nominal ? r.militantes / r.lista_nominal : -1),
    render: (r) =>
      r.lista_nominal ? (
        <CellBar value={(r.militantes / r.lista_nominal) * 100} />
      ) : (
        <span className="text-ink-faint">—</span>
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
    render: (r) => (
      <span className="flex items-center gap-2.5">
        <Avatar initials={initials(r.nombre)} variant="brand" />
        <span className="font-medium text-ink">{r.nombre}</span>
      </span>
    ),
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
    render: (r) =>
      r.con_banderas > 0 ? (
        <StatusPill kind="warn">{r.con_banderas} banderas</StatusPill>
      ) : (
        <StatusPill kind="ok">Sin banderas</StatusPill>
      ),
  },
];

export default function PanoramaMilitantesPage() {
  const state = useAsync(getPanorama, []);
  const data = state.data;
  const isEmpty = !state.loading && !state.error && (data?.kpis?.total ?? 0) === 0;

  const kpis = data?.kpis;
  const avancePct = kpis && kpis.meta ? Math.min(1, kpis.total / kpis.meta) : null;

  const vsPromovidosData = (data?.por_seccion ?? []).map((s) => ({
    seccion: s.seccion,
    militantes: s.militantes,
    promovidos: s.promovidos,
  }));

  const estadoDonutData: DonutDatum[] = kpis
    ? [
        { name: "Validados", value: kpis.validados },
        { name: "Observados", value: kpis.observados },
        { name: "Registrados", value: kpis.registrados },
      ]
    : [];

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
        <div className="flex flex-col gap-8">
          {/* Bloque 1: Avance — el número que Lucy lee de un vistazo */}
          <section className="flex flex-col gap-4">
            <SectionHeading
              eyebrow="Afiliación"
              title="Avance"
              note={kpis?.meta ? `Meta ${kpis.meta.toLocaleString("en-US")}` : undefined}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <MetricCard
                  label="Total militantes"
                  value={String(kpis?.total ?? 0)}
                  countTo={kpis?.total ?? 0}
                  tone="warm"
                  trend={data?.trend}
                  context={
                    kpis?.meta
                      ? `${kpis.total.toLocaleString("en-US")} de ${kpis.meta.toLocaleString("en-US")} meta · ${
                          avancePct != null ? (avancePct * 100).toFixed(1) : "—"
                        }% de avance`
                      : undefined
                  }
                  delay={0}
                />
              </div>

              <ChartFrame
                title="Estado de calidad"
                caption="Composición de los militantes registrados"
                empty={!kpis || kpis.total === 0}
                legend={[
                  { label: "Validados", color: CHART_PALETTE[0] },
                  { label: "Observados", color: CHART_PALETTE[1] },
                  { label: "Registrados", color: CHART_PALETTE[2] },
                ]}
              >
                <Donut data={estadoDonutData} height={160} centerLabel="Total" />
              </ChartFrame>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label="% validados"
                value={kpis ? pct(kpis.validados, kpis.total) : "—"}
                tone="teal"
                context={kpis ? `${kpis.validados} de ${kpis.total}` : undefined}
                delay={80}
              />
              <MetricCard
                label="Ritmo 7 días"
                value={String(kpis?.ritmo_7d ?? 0)}
                countTo={kpis?.ritmo_7d ?? 0}
                tone="accent"
                context="militantes/día"
                delay={160}
              />
              <MetricCard
                label="Ritmo 30 días"
                value={String(kpis?.ritmo_30d ?? 0)}
                countTo={kpis?.ritmo_30d ?? 0}
                tone="accent"
                context="militantes/día"
                delay={240}
              />
            </div>
          </section>

          {/* Bloque 2: Por sección (SMA) */}
          <section className="flex flex-col gap-4 reveal">
            <SectionHeading eyebrow="Territorio" title="Por sección" note="SMA" />
            <DataTable
              columns={SECCION_COLUMNS}
              rows={data?.por_seccion ?? []}
              rowKey={(r) => r.seccion}
              defaultSortKey="militantes"
              defaultSortDir="desc"
              emptyMessage="Aún no hay militantes registrados"
            />
          </section>

          {/* Bloque 3: Por activista */}
          <section className="flex flex-col gap-4 reveal">
            <SectionHeading eyebrow="Estructura" title="Por activista" />
            <DataTable
              columns={ACTIVISTA_COLUMNS}
              rows={data?.por_activista ?? []}
              rowKey={(r) => r.activista_id ?? r.nombre}
              defaultSortKey="militantes"
              defaultSortDir="desc"
              emptyMessage="Aún no hay militantes registrados"
            />
          </section>

          {/* Bloque 4: Militantes vs promovidos */}
          <section className="flex flex-col gap-4">
            <SectionHeading eyebrow="Comparativo" title="Militantes vs. promovidos" />
            <ChartFrame
              title="Militantes vs. promovidos por sección"
              caption="Nuevos militantes captados frente a la base previa de promovidos"
              empty={vsPromovidosData.length === 0}
              legend={[
                { label: "Militantes", color: CHART_PALETTE[0] },
                { label: "Promovidos", color: CHART_PALETTE[2] },
              ]}
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <span className="eyebrow">Militantes</span>
                  <div className="mt-2">
                    <Bars
                      items={vsPromovidosData.map((d) => ({ label: d.seccion, value: d.militantes }))}
                      color={CHART_PALETTE[0]}
                    />
                  </div>
                </div>
                <div>
                  <span className="eyebrow">Promovidos</span>
                  <div className="mt-2">
                    <Bars
                      items={vsPromovidosData.map((d) => ({ label: d.seccion, value: d.promovidos }))}
                      color={CHART_PALETTE[2]}
                    />
                  </div>
                </div>
              </div>
            </ChartFrame>
          </section>
        </div>
      </DataState>
    </AppLayout>
  );
}
