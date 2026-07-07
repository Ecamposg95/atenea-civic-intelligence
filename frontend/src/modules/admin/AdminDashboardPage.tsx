import { getMetricas } from "@/api/admin";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { AreaTrend } from "@/components/charts/AreaTrend";
import { Bars } from "@/components/charts/Bars";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useAsync } from "@/hooks/useAsync";
import { useCampaignStore } from "@/store/campaignStore";

export function AdminDashboardPage() {
  const activeId = useCampaignStore((s) => s.activeId);
  const { data, loading, error, reload } = useAsync(getMetricas, [activeId]);

  const byDay = data?.by_day ?? [];
  const byActivista = data?.by_activista ?? [];
  const bySeccion = data?.by_seccion ?? [];
  const topActivista = byActivista[0] ?? null;
  const seccionesCubiertas = bySeccion.length;

  const activistaBarData = byActivista
    .slice(0, 10)
    .map((b) => ({ label: b.label, value: b.count }));

  const seccionBarData = bySeccion
    .slice(0, 15)
    .map((b) => ({ label: b.label, value: b.count }));

  const trendPoints = byDay.map((d) => ({ x: d.date.slice(5), y: d.count }));

  return (
    <AppLayout title="Consola Activistas">
      <PageHeader
        eyebrow="Administración"
        title="Consola"
        accent="Activistas"
        subtitle="Métricas de captura de activistas en tiempo real — totales, avance diario y cobertura por sección."
      />

      {/* ── Metric Cards ──────────────────────────────────────────────── */}
      <DataState
        loading={loading}
        error={error}
        onRetry={reload}
        skeleton={
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="card-premium h-[120px] animate-pulse rounded-lg bg-panel-hover"
              />
            ))}
          </div>
        }
      >
        {data && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label="Total registros"
              value={String(data.total)}
              countTo={data.total}
              tone="warm"
              trend={trendPoints.length > 0 ? byDay.map((d) => d.count) : undefined}
              context={
                byDay.length > 0
                  ? `${byDay.length} día${byDay.length === 1 ? "" : "s"} con actividad`
                  : undefined
              }
              delay={0}
            />
            <MetricCard
              label="Top activista"
              value={topActivista ? topActivista.label : "—"}
              delta={
                topActivista ? `${topActivista.count} registros` : undefined
              }
              context={
                byActivista.length > 0
                  ? `de ${byActivista.length} activista${byActivista.length === 1 ? "" : "s"} con registros`
                  : undefined
              }
              tone="teal"
              delay={80}
            />
            <MetricCard
              label="Secciones cubiertas"
              value={String(seccionesCubiertas)}
              countTo={seccionesCubiertas}
              tone="accent"
              delay={160}
            />
          </div>
        )}
      </DataState>

      {/* ── Avance diario ─────────────────────────────────────────────── */}
      <div className="mt-8">
        <SectionHeading
          eyebrow="Tendencia"
          title="Avance diario"
          note={data ? `${data.total} registros totales` : undefined}
        />
        <div className="mt-4 reveal" style={{ animationDelay: "120ms" }}>
          <DataState
            loading={loading}
            error={error}
            onRetry={reload}
            isEmpty={!loading && !error && byDay.length === 0}
            emptyMessage="Sin registros aún."
            skeleton={
              <div className="h-[260px] animate-pulse rounded-lg bg-panel-hover" />
            }
          >
            {data && (
              <ChartFrame
                title="Registros por día"
                caption="Captura diaria en la campaña activa"
              >
                <AreaTrend points={trendPoints} />
              </ChartFrame>
            )}
          </DataState>
        </div>
      </div>

      {/* ── Top activistas + Cobertura por sección ────────────────────── */}
      <div className="mt-8">
        <SectionHeading eyebrow="Desempeño" title="Ranking y cobertura" />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="reveal" style={{ animationDelay: "160ms" }}>
            <DataState
              loading={loading}
              error={error}
              onRetry={reload}
              isEmpty={!loading && !error && activistaBarData.length === 0}
              emptyMessage="Sin activistas con registros aún."
              skeleton={
                <div className="h-[280px] animate-pulse rounded-lg bg-panel-hover" />
              }
            >
              {data && (
                <ChartFrame title="Top 10 activistas" caption="Registros por activista">
                  <Bars items={activistaBarData} highlightFirst />
                </ChartFrame>
              )}
            </DataState>
          </div>

          <div className="reveal" style={{ animationDelay: "200ms" }}>
            <DataState
              loading={loading}
              error={error}
              onRetry={reload}
              isEmpty={!loading && !error && seccionBarData.length === 0}
              emptyMessage="Sin secciones registradas aún."
              skeleton={
                <div className="h-[280px] animate-pulse rounded-lg bg-panel-hover" />
              }
            >
              {data && (
                <ChartFrame
                  title="Cobertura por sección"
                  caption="Top 15 secciones con más registros"
                >
                  <Bars items={seccionBarData} highlightFirst />
                </ChartFrame>
              )}
            </DataState>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
