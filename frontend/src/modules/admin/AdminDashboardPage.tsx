import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getMetricas } from "@/api/admin";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { CHART_PALETTE, CHART_TOOLTIP_STYLE } from "@/constants/ui";
import { useAsync } from "@/hooks/useAsync";

export function AdminDashboardPage() {
  const { data, loading, error, reload } = useAsync(getMetricas, []);
  const uid = useId();
  const gradientId = `adminDailyFill-${uid.replace(/:/g, "")}`;

  const byDay = data?.by_day ?? [];
  const byActivista = data?.by_activista ?? [];
  const bySeccion = data?.by_seccion ?? [];
  const topActivista = byActivista[0] ?? null;
  const seccionesCubiertas = bySeccion.length;

  const activistaBarData = byActivista
    .slice(0, 10)
    .map((b) => ({ label: b.label, count: b.count }));

  const seccionBarData = bySeccion
    .slice(0, 15)
    .map((b) => ({ label: b.label, count: b.count }));

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
              tone="accent"
              delay={0}
            />
            <MetricCard
              label="Top activista"
              value={topActivista ? topActivista.label : "—"}
              delta={
                topActivista ? `${topActivista.count} registros` : undefined
              }
              tone="teal"
              delay={80}
            />
            <MetricCard
              label="Secciones cubiertas"
              value={String(seccionesCubiertas)}
              countTo={seccionesCubiertas}
              tone="warning"
              delay={160}
            />
          </div>
        )}
      </DataState>

      {/* ── Avance diario ─────────────────────────────────────────────── */}
      <div className="mt-5">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
          <Card title="Avance diario (registros)" accentDot>
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
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={byDay}
                      margin={{ top: 10, right: 8, bottom: 0, left: -16 }}
                    >
                      <defs>
                        <linearGradient
                          id={gradientId}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor={CHART_PALETTE[0]}
                            stopOpacity={0.42}
                          />
                          <stop
                            offset="100%"
                            stopColor={CHART_PALETTE[0]}
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="var(--chart-grid)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        stroke="var(--chart-axis)"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--chart-grid)" }}
                        tickFormatter={(v: string) => v.slice(5)}
                      />
                      <YAxis
                        stroke="var(--chart-axis)"
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        domain={[0, "auto"]}
                      />
                      <Tooltip
                        cursor={{
                          stroke: "var(--chart-axis-strong)",
                          strokeWidth: 1,
                        }}
                        contentStyle={CHART_TOOLTIP_STYLE}
                        labelStyle={{ color: "var(--chart-5)" }}
                        formatter={(value: number) => [value, "Registros"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke={CHART_PALETTE[0]}
                        strokeWidth={2}
                        fill={`url(#${gradientId})`}
                        dot={{ r: 3, fill: CHART_PALETTE[0], strokeWidth: 0 }}
                        activeDot={{
                          r: 5,
                          fill: CHART_PALETTE[1],
                          strokeWidth: 0,
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </DataState>
          </Card>
        </div>
      </div>

      {/* ── Top activistas + Cobertura por sección ────────────────────── */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="reveal" style={{ animationDelay: "160ms" }}>
          <Card title="Top 10 activistas" accentDot className="h-full">
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
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={activistaBarData}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
                    >
                      <CartesianGrid
                        stroke="var(--chart-grid)"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        stroke="var(--chart-axis)"
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={110}
                        stroke="var(--chart-axis)"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: string) =>
                          v.length > 14 ? `${v.slice(0, 14)}…` : v
                        }
                      />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: number) => [value, "Registros"]}
                      />
                      <Bar
                        dataKey="count"
                        fill={CHART_PALETTE[1]}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </DataState>
          </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "200ms" }}>
          <Card title="Cobertura por sección (top 15)" accentDot className="h-full">
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
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={seccionBarData}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
                    >
                      <CartesianGrid
                        stroke="var(--chart-grid)"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        stroke="var(--chart-axis)"
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={80}
                        stroke="var(--chart-axis)"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: number) => [value, "Registros"]}
                      />
                      <Bar
                        dataKey="count"
                        fill={CHART_PALETTE[2]}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </DataState>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
