import { useMemo } from "react";
import { Link } from "react-router-dom";

import { getExecutiveDashboard } from "@/api/dashboard";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { CountdownElectoral } from "@/components/CountdownElectoral";
import { AreaTrend } from "@/components/charts/AreaTrend";
import { Bars } from "@/components/charts/Bars";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Donut } from "@/components/charts/Donut";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StatusPill } from "@/components/ui/StatusPill";
import { useAsync } from "@/hooks/useAsync";
import { CHART_PALETTE } from "@/constants/ui";
import {
  AlertIcon,
  MapIcon,
  ShieldIcon,
  UserIcon,
  VotersIcon,
} from "@/components/ui/icons";
import type { ExecutiveDashboard } from "@/api/dashboard";

const nf = new Intl.NumberFormat("es-MX");
const pf = (n: number) => `${nf.format(Math.round(n))}%`;

export function DashboardPage() {
  const { data, loading, error, reload } = useAsync<ExecutiveDashboard>(
    () => getExecutiveDashboard(),
    [],
  );

  const promovidos = data?.promovidos;
  const afiliados = data?.afiliados;
  const casos = data?.casos;
  const cobertura = data?.cobertura;

  const promovidosContext = useMemo(() => {
    if (!promovidos || promovidos.meta == null) return undefined;
    const pct = promovidos.pct != null ? ` · ${nf.format(promovidos.pct)}%` : "";
    return `meta ${nf.format(promovidos.meta)}${pct}`;
  }, [promovidos]);

  const afiliadosContext = useMemo(() => {
    if (!afiliados) return undefined;
    return `${nf.format(afiliados.validados)} validados`;
  }, [afiliados]);

  const casosContext = useMemo(() => {
    if (!casos) return undefined;
    return `${nf.format(casos.sla_vencidos)} con SLA vencido`;
  }, [casos]);

  const casosTone: "critical" | "teal" = (casos?.sla_vencidos ?? 0) > 0 ? "critical" : "teal";

  const coberturaContext = useMemo(() => {
    if (!cobertura) return undefined;
    return `${nf.format(cobertura.al_dia)} al día · ${nf.format(cobertura.en_riesgo)} en riesgo`;
  }, [cobertura]);

  const tendenciaPoints = useMemo(
    () =>
      (data?.tendencia ?? []).map((t) => ({
        x: t?.semana ?? "—",
        y: t?.promovidos ?? 0,
      })),
    [data],
  );

  const porSeccionItems = useMemo(
    () =>
      (data?.por_seccion_top ?? []).map((s) => ({
        label: s?.seccion ?? "—",
        value: s?.promovidos ?? 0,
      })),
    [data],
  );

  const casosPorEstadoData = useMemo(
    () =>
      (data?.casos_por_estado ?? []).map((c, i) => ({
        name: c?.estado ?? "—",
        value: c?.n ?? 0,
        color: CHART_PALETTE[i % CHART_PALETTE.length],
      })),
    [data],
  );

  const casosPorEstadoLegend = useMemo(
    () => casosPorEstadoData.map((d) => ({ label: d.name, color: d.color })),
    [casosPorEstadoData],
  );

  const alertas = data?.alertas ?? [];
  const slaVencidos = casos?.sla_vencidos ?? 0;
  const hasAttention = alertas.length > 0 || slaVencidos > 0;

  return (
    <AppLayout title="Centro de Mando" crumb="Civic Intelligence Overview">
      {/* ---- Hero ---- */}
      <PageHeader
        eyebrow="Executive briefing"
        title="Centro de Mando"
        accent="Ejecutivo"
        subtitle="Avance de campaña en tiempo real: promoción, afiliación, atención ciudadana y cobertura territorial."
        actions={<CountdownElectoral date={data?.election_date ?? null} />}
      />

      <DataState
        loading={loading}
        error={error}
        onRetry={reload}
        skeleton={
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-card bg-panel-hover" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="h-64 animate-pulse rounded-card bg-panel-hover lg:col-span-2" />
              <div className="h-64 animate-pulse rounded-card bg-panel-hover" />
            </div>
          </div>
        }
      >
        {data && (
          <>
            {/* ---- KPI row ---- */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Promovidos"
                value={nf.format(promovidos?.total ?? 0)}
                countTo={promovidos?.total ?? 0}
                context={promovidosContext}
                tone="warm"
                icon={<VotersIcon width={18} height={18} />}
                delay={0}
              />
              <MetricCard
                label="Afiliados"
                value={nf.format(afiliados?.total ?? 0)}
                countTo={afiliados?.total ?? 0}
                context={afiliadosContext}
                tone="accent"
                icon={<ShieldIcon width={18} height={18} />}
                delay={80}
              />
              <MetricCard
                label="Casos abiertos"
                value={nf.format(casos?.abiertos ?? 0)}
                countTo={casos?.abiertos ?? 0}
                context={casosContext}
                tone={casosTone}
                icon={<AlertIcon width={18} height={18} />}
                delay={160}
              />
              <MetricCard
                label="Cobertura seccional"
                value={cobertura?.pct_global != null ? pf(cobertura.pct_global) : "—"}
                countTo={cobertura?.pct_global ?? undefined}
                format={cobertura?.pct_global != null ? pf : undefined}
                context={coberturaContext}
                tone="teal"
                icon={<MapIcon width={18} height={18} />}
                delay={240}
              />
            </div>

            {/* ---- Ritmo de captura ---- */}
            <div className="reveal mt-8">
              <SectionHeading
                eyebrow="Promoción"
                title="Ritmo de captura"
                note="Tendencia semanal y secciones destacadas"
              />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="reveal lg:col-span-2" style={{ animationDelay: "120ms" }}>
                <ChartFrame
                  title="Promovidos por semana"
                  caption="Tendencia de captura"
                  empty={tendenciaPoints.length === 0}
                >
                  <AreaTrend points={tendenciaPoints} />
                </ChartFrame>
              </div>
              <div className="reveal" style={{ animationDelay: "180ms" }}>
                <ChartFrame
                  title="Top secciones"
                  caption="Promovidos acumulados"
                  empty={porSeccionItems.length === 0}
                >
                  <Bars items={porSeccionItems} highlightFirst />
                </ChartFrame>
              </div>
            </div>

            {/* ---- Qué necesita atención ---- */}
            <div className="reveal mt-8" style={{ animationDelay: "40ms" }}>
              <SectionHeading
                eyebrow="Prioridades"
                title="Qué necesita atención"
                note="Casos y cobertura en riesgo"
              />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="reveal" style={{ animationDelay: "160ms" }}>
                <ChartFrame
                  title="Casos por estado"
                  caption="Atención ciudadana"
                  empty={casosPorEstadoData.length === 0}
                  legend={casosPorEstadoLegend}
                >
                  <Donut data={casosPorEstadoData} centerLabel="casos" />
                </ChartFrame>
              </div>
              <div className="reveal lg:col-span-2" style={{ animationDelay: "220ms" }}>
                <Card
                  title="Qué necesita atención"
                  accentDot
                  className="h-full"
                  action={
                    <Link
                      to="/atencion/casos"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent-strong"
                    >
                      <UserIcon width={14} height={14} /> Ver casos
                    </Link>
                  }
                >
                  <div className="space-y-2.5">
                    {slaVencidos > 0 && (
                      <div className="reveal flex items-center justify-between gap-3 rounded-lg border border-l-2 border-line border-l-state-critical bg-bg-sunken px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <AlertIcon width={16} height={16} className="shrink-0 text-state-critical" />
                          <span className="text-sm text-ink">
                            {nf.format(slaVencidos)} {slaVencidos === 1 ? "caso" : "casos"} con SLA vencido
                          </span>
                        </div>
                        <StatusPill kind="crit">urgente</StatusPill>
                      </div>
                    )}
                    {alertas.map((a, i) => (
                      <div
                        key={`${a?.seccion ?? "seccion"}-${i}`}
                        className="reveal flex items-center justify-between gap-3 rounded-lg border border-l-2 border-line border-l-state-warning bg-bg-sunken px-3 py-2.5"
                        style={{ animationDelay: `${60 + i * 70}ms` }}
                      >
                        <div className="flex items-center gap-2.5">
                          <MapIcon width={16} height={16} className="shrink-0 text-state-warning" />
                          <span className="text-sm text-ink">
                            Sección {a?.seccion ?? "—"}: faltan {nf.format(a?.faltan ?? 0)} promovidos
                          </span>
                        </div>
                        <StatusPill kind="warn">rezago</StatusPill>
                      </div>
                    ))}
                    {!hasAttention && (
                      <div className="flex items-center gap-2.5 rounded-lg border border-l-2 border-line border-l-teal bg-bg-sunken px-3 py-2.5">
                        <ShieldIcon width={16} height={16} className="text-teal" />
                        <p className="text-sm text-ink-muted">Sin alertas activas.</p>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </>
        )}
      </DataState>
    </AppLayout>
  );
}
