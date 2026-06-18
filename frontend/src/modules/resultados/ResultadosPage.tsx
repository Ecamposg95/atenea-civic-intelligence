// frontend/src/modules/resultados/ResultadosPage.tsx
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PreviewBanner } from "@/components/modules/PreviewBanner";
import { Card } from "@/components/ui/Card";
import type { Column } from "@/components/ui/DataTable";
import { DataTable } from "@/components/ui/DataTable";
import { MetricCard } from "@/components/ui/MetricCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sparkline } from "@/components/ui/Sparkline";
import { RadialGauge } from "@/components/charts/RadialGauge";
import { AnalyticsIcon, ShieldIcon, VotersIcon } from "@/components/ui/icons";
import { CHART_PALETTE, CHART_TOOLTIP_STYLE, PANEL_HEIGHTS } from "@/constants/ui";
import { ENTITY_RESULTS, HISTORICAL, NATIONAL, PARTY_RESULTS } from "./fixtures";
import type { EntityResult } from "./fixtures";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const nf = new Intl.NumberFormat("es-MX");

/** Color chip keyed by the leading party/coalition (matches fixture palette). */
const PARTY_COLOR: Record<string, string> = Object.fromEntries(
  PARTY_RESULTS.map((p) => [p.party, p.color]),
);

// Historical coalition line colors sourced from fixture party data so they
// always stay in sync with the BarChart/PieChart Cell fills above.
// HISTORICAL keys (coalicionA/B/C) map 1:1 to PARTY_RESULTS[0/1/2].
const COALITION_COLOR: Record<string, string> = {
  coalicionA: PARTY_RESULTS[0].color,
  coalicionB: PARTY_RESULTS[1].color,
  coalicionC: PARTY_RESULTS[2].color,
};

type View = "nacional" | "entidad" | "historico";

const VIEW_OPTIONS: { id: View; label: string }[] = [
  { id: "nacional", label: "Nacional" },
  { id: "entidad", label: "Por entidad" },
  { id: "historico", label: "Histórico" },
];

export function ResultadosPage() {
  const [view, setView] = useState<View>("nacional");

  return (
    <AppLayout title="Resultados Electorales" crumb="Inteligencia Electoral">
      <PageHeader
        eyebrow="Inteligencia Electoral"
        title="Resultados"
        accent="Electorales"
        subtitle="Cómputo nacional, distribución del voto y desempeño por entidad en una sola vista institucional."
      />
      <PreviewBanner />

      {/* Segmented view switch — accessible tablist with keyboard nav */}
      <div className="reveal mb-5">
        <SegmentedControl<View>
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
          ariaLabel="Vista de resultados electorales"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Participación nacional"
          value={pct(NATIONAL.turnout)}
          tone="accent"
          icon={<VotersIcon width={18} height={18} />}
          trend={NATIONAL.turnoutTrend}
          delay={0}
        />
        <MetricCard
          label="Casillas computadas"
          value={pct(NATIONAL.counted)}
          tone="teal"
          icon={<ShieldIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Fuerza líder"
          value={NATIONAL.leader}
          tone="accent"
          icon={<AnalyticsIcon width={18} height={18} />}
          delay={160}
        />
      </div>

      {view === "nacional" && <NacionalView />}
      {view === "entidad" && <EntidadView />}
      {view === "historico" && <HistoricoView />}
    </AppLayout>
  );
}

function NacionalView() {
  return (
    <>
      <div
        className="reveal mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3"
        style={{ animationDelay: "80ms" }}
      >
        <Card title="Participación nacional" accentDot className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 py-2">
            <RadialGauge value={NATIONAL.turnout} label="Participación" size={148} />
            <span className="text-[11px] text-ink-faint">Avance de cómputo (muestra)</span>
          </div>
        </Card>
        <Card title="Casillas computadas" accentDot className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 py-2">
            <RadialGauge value={NATIONAL.counted} label="Computadas" size={148} />
            <span className="text-[11px] text-ink-faint">Cobertura de casillas (muestra)</span>
          </div>
        </Card>
        <Card title="Fuerza líder" accentDot className="flex flex-col justify-center">
          <div className="space-y-2.5 py-1">
            {PARTY_RESULTS.slice(0, 3).map((p) => (
              <div key={p.party} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.party}
                </span>
                <span className="font-mono text-sm tabular-nums text-ink">{pct(p.share)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
          <Card
            title="Distribución del voto"
            accentDot
            className="h-full"
            action={<span className="pill border-line text-ink-muted">Cómputo nacional</span>}
          >
            <div className={PANEL_HEIGHTS.chartMd}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={PARTY_RESULTS} layout="vertical" margin={{ left: 24 }}>
                  <XAxis type="number" tickFormatter={pct} stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="party"
                    stroke="var(--chart-axis)"
                    tick={{ fontSize: 12 }}
                    width={110}
                  />
                  <Tooltip
                    cursor={{ fill: "color-mix(in srgb, var(--chart-1) 6%, transparent)" }}
                    formatter={(v: number) => pct(v)}
                    contentStyle={CHART_TOOLTIP_STYLE}
                  />
                  <Bar dataKey="share" radius={[0, 6, 6, 0]}>
                    {PARTY_RESULTS.map((p) => (
                      <Cell key={p.party} fill={p.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <PartyLegend />
          </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "200ms" }}>
          <Card
            title="Composición del voto"
            accentDot
            className="h-full"
            action={<span className="pill border-line text-ink-muted">Participación nacional</span>}
          >
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={PARTY_RESULTS}
                    dataKey="share"
                    nameKey="party"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={2}
                    stroke="rgb(var(--c-panel))"
                    strokeWidth={2}
                  >
                    {PARTY_RESULTS.map((p) => (
                      <Cell key={p.party} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, n: string) => [pct(v), n]}
                    contentStyle={CHART_TOOLTIP_STYLE}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Sample participation trend */}
            <div className="mt-4 flex items-end justify-between gap-4 rounded-lg border border-line bg-bg-sunken px-3 py-3">
              <div>
                <span className="eyebrow block">Avance de participación</span>
                <span className="mt-1 block font-mono text-lg tabular-nums text-accent">
                  {pct(NATIONAL.turnout)}
                </span>
                <span className="text-[11px] text-ink-faint">Tendencia de muestra</span>
              </div>
              <Sparkline data={NATIONAL.turnoutTrend} width={160} height={40} className="w-40" />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function PartyLegend() {
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
      {PARTY_RESULTS.map((p) => (
        <span key={p.party} className="inline-flex items-center gap-2 text-xs text-ink-muted">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          {p.party}
          <span className="font-mono text-ink-faint">{pct(p.share)}</span>
        </span>
      ))}
    </div>
  );
}

function EntidadView() {
  const [query, setQuery] = useState("");

  const rows = useMemo<EntityResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ENTITY_RESULTS;
    return ENTITY_RESULTS.filter((e) => e.entity.toLowerCase().includes(q));
  }, [query]);

  const columns = useMemo<Column<EntityResult>[]>(
    () => [
      {
        key: "entity",
        header: "Entidad",
        sortValue: (e) => e.entity,
        render: (e) => <span className="font-medium text-ink">{e.entity}</span>,
      },
      {
        key: "turnout",
        header: "Participación",
        align: "right",
        sortValue: (e) => e.turnout,
        render: (e) => (
          <span className="font-mono tabular-nums text-ink-muted">{pct(e.turnout)}</span>
        ),
      },
      {
        key: "winner",
        header: "Ganador",
        render: (e) => (
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: PARTY_COLOR[e.winner] ?? "#7c8aa5" }}
            />
            <span className="text-ink">{e.winner}</span>
          </span>
        ),
      },
      {
        key: "margin",
        header: "Margen",
        align: "right",
        sortValue: (e) => e.margin,
        render: (e) => (
          <span className="font-mono tabular-nums text-ink-muted">{pct(e.margin)}</span>
        ),
        hideOnCard: true,
      },
      {
        key: "votes",
        header: "Votos",
        align: "right",
        sortValue: (e) => e.votes,
        render: (e) => (
          <span className="font-mono tabular-nums text-ink-muted">{nf.format(e.votes)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="reveal mt-5" style={{ animationDelay: "120ms" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar por entidad…"
          className="field-input max-w-xs focus-ring"
          aria-label="Filtrar resultados por entidad"
        />
        <span className="pill border-line text-ink-muted">
          {rows.length} de {ENTITY_RESULTS.length} entidades · muestra
        </span>
      </div>

      <DataTable<EntityResult>
        columns={columns}
        rows={rows}
        rowKey={(e) => e.entity}
        pageSize={16}
        defaultSortKey="votes"
        defaultSortDir="desc"
        emptyMessage={`Sin coincidencias para "${query}".`}
      />
    </div>
  );
}

function HistoricoView() {
  const turnoutTrend = HISTORICAL.map((c) => ({ period: c.year, value: c.turnout }));
  const maxTurnout = [...HISTORICAL].sort((a, b) => b.turnout - a.turnout)[0];
  const minTurnout = [...HISTORICAL].sort((a, b) => a.turnout - b.turnout)[0];

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="reveal lg:col-span-2" style={{ animationDelay: "120ms" }}>
        <Card
          title="Voto por coalición · ciclos electorales (%)"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">muestra · histórico</span>}
        >
          <div className={PANEL_HEIGHTS.chartMd}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={HISTORICAL} margin={{ left: -12, top: 8, right: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="year"
                  stroke="var(--chart-axis)"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--chart-grid)" }}
                />
                <YAxis
                  stroke="var(--chart-axis)"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  domain={[0, 0.5]}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: number, n: string) => [pct(v), n]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="coalicionA"
                  name="Coalición A"
                  stroke={COALITION_COLOR.coalicionA}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="coalicionB"
                  name="Coalición B"
                  stroke={COALITION_COLOR.coalicionB}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="coalicionC"
                  name="Coalición C"
                  stroke={COALITION_COLOR.coalicionC}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="reveal" style={{ animationDelay: "200ms" }}>
        <Card
          title="Participación histórica"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">muestra</span>}
        >
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={turnoutTrend} margin={{ left: -12, top: 8, right: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="period"
                  stroke="var(--chart-axis)"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--chart-grid)" }}
                />
                <YAxis
                  stroke="var(--chart-axis)"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  domain={[0.3, 0.7]}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: number) => [pct(v), "Participación"]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_PALETTE[0]}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CHART_PALETTE[0] }}
                  activeDot={{ r: 5, fill: CHART_PALETTE[1] }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
              <span className="eyebrow block">Máxima participación (muestra)</span>
              <span className="mt-1 block font-mono text-sm tabular-nums text-teal">
                {maxTurnout ? `${pct(maxTurnout.turnout)} · ${maxTurnout.year}` : "—"}
              </span>
            </div>
            <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
              <span className="eyebrow block">Mínima participación (muestra)</span>
              <span className="mt-1 block font-mono text-sm tabular-nums text-state-warning">
                {minTurnout ? `${pct(minTurnout.turnout)} · ${minTurnout.year}` : "—"}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
