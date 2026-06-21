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

import { getDerived, getResultados } from "@/api/resultados";
import type { Derived, ElectionRow } from "@/api/resultados";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import type { Column } from "@/components/ui/DataTable";
import { DataTable } from "@/components/ui/DataTable";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { AnalyticsIcon, ShieldIcon, VotersIcon } from "@/components/ui/icons";
import { CHART_PALETTE, CHART_TOOLTIP_STYLE, PANEL_HEIGHTS } from "@/constants/ui";
import { useAsync } from "@/hooks/useAsync";

const pct = (v: number | null) =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;
const nf = new Intl.NumberFormat("es-MX");

type View = "nacional" | "entidad" | "historico";

const VIEW_OPTIONS: { id: View; label: string }[] = [
  { id: "nacional", label: "Nacional" },
  { id: "entidad", label: "Por entidad" },
  { id: "historico", label: "Histórico" },
];

// Assign stable colours to party names encountered in real data.
const PALETTE = [
  "#22d3ee",
  "#f5b53d",
  "#2dd4bf",
  "#7c8aa5",
  "#06b6d4",
  "#f4607a",
  "#8b9bf4",
];
function partyColor(party: string, index: number) {
  // Hash the string for deterministic colour from the palette.
  let h = 0;
  for (let i = 0; i < party.length; i++) h = (h * 31 + party.charCodeAt(i)) & 0xffff;
  return PALETTE[(h + index) % PALETTE.length];
}

export function ResultadosPage() {
  const [view, setView] = useState<View>("nacional");

  const rows = useAsync(() => getResultados(), []);
  const derived = useAsync(() => getDerived(), []);

  const loading = rows.loading || derived.loading;
  const error = rows.error ?? derived.error;
  const reload = () => {
    rows.reload();
    derived.reload();
  };

  const isEmpty = !loading && !error && (rows.data ?? []).length === 0;

  // Aggregate party totals from raw rows.
  const partyTotals = useMemo<{ party: string; votes: number; share: number; color: string }[]>(() => {
    const data = rows.data ?? [];
    if (data.length === 0) return [];
    const map = new Map<string, number>();
    let total = 0;
    for (const r of data) {
      map.set(r.partido, (map.get(r.partido) ?? 0) + r.votos);
      total += r.votos;
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([party, votes], i) => ({
        party,
        votes,
        share: total > 0 ? votes / total : 0,
        color: partyColor(party, i),
      }));
  }, [rows.data]);

  // Per-entity rollup for the "Entidad" tab.
  const entityRollup = useMemo(() => {
    const data = rows.data ?? [];
    const map = new Map<string, { votes: number; byParty: Map<string, number> }>();
    for (const r of data) {
      const key = r.territory_code;
      if (!map.has(key)) map.set(key, { votes: 0, byParty: new Map() });
      const e = map.get(key)!;
      e.votes += r.votos;
      e.byParty.set(r.partido, (e.byParty.get(r.partido) ?? 0) + r.votos);
    }
    return Array.from(map.entries()).map(([code, { votes, byParty }]) => {
      let winner = "";
      let winVotes = -1;
      byParty.forEach((v, p) => {
        if (v > winVotes) { winner = p; winVotes = v; }
      });
      const sorted = Array.from(byParty.values()).sort((a, b) => b - a);
      const margin = sorted.length >= 2 && votes > 0
        ? (sorted[0] - sorted[1]) / votes
        : 0;
      return { code, votes, winner, margin };
    }).sort((a, b) => b.votes - a.votes);
  }, [rows.data]);

  return (
    <AppLayout title="Resultados Electorales" crumb="Inteligencia Electoral">
      <PageHeader
        eyebrow="Inteligencia Electoral"
        title="Resultados"
        accent="Electorales"
        subtitle="Cómputo electoral, distribución del voto y métricas de participación derivadas de los datos ingestados."
      />

      <div className="reveal mb-5">
        <SegmentedControl<View>
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
          ariaLabel="Vista de resultados electorales"
        />
      </div>

      <DataState
        loading={loading}
        error={error}
        isEmpty={isEmpty}
        onRetry={reload}
        emptyMessage="Ingesta pendiente — sin resultados electorales disponibles."
        skeleton={
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-card bg-panel-hover" />
              ))}
            </div>
            <SkeletonRows rows={6} />
          </div>
        }
      >
        {/* Summary metric cards from derived endpoint */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            label="Participación"
            value={pct(derived.data?.participacion ?? null)}
            tone="accent"
            icon={<VotersIcon width={18} height={18} />}
            delay={0}
          />
          <MetricCard
            label="Total votos"
            value={nf.format(derived.data?.total_votos ?? 0)}
            tone="teal"
            icon={<ShieldIcon width={18} height={18} />}
            delay={80}
          />
          <MetricCard
            label="Partido líder"
            value={derived.data?.ganador ?? (partyTotals[0]?.party ?? "—")}
            tone="accent"
            icon={<AnalyticsIcon width={18} height={18} />}
            delay={160}
          />
        </div>

        {view === "nacional" && (
          <NacionalView partyTotals={partyTotals} derived={derived.data} />
        )}
        {view === "entidad" && <EntidadView rows={entityRollup} />}
        {view === "historico" && <HistoricoView rows={rows.data ?? []} />}
      </DataState>
    </AppLayout>
  );
}

function NacionalView({
  partyTotals,
  derived,
}: {
  partyTotals: { party: string; votes: number; share: number; color: string }[];
  derived: Derived | null;
}) {
  if (partyTotals.length === 0) return null;

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="reveal" style={{ animationDelay: "120ms" }}>
        <Card
          title="Distribución del voto"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">Cómputo ingestado</span>}
        >
          <div className={PANEL_HEIGHTS.chartMd}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={partyTotals} layout="vertical" margin={{ left: 24 }}>
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  stroke="var(--chart-axis)"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="party"
                  stroke="var(--chart-axis)"
                  tick={{ fontSize: 12 }}
                  width={120}
                />
                <Tooltip
                  cursor={{ fill: "color-mix(in srgb, var(--chart-1) 6%, transparent)" }}
                  formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                  contentStyle={CHART_TOOLTIP_STYLE}
                />
                <Bar dataKey="share" radius={[0, 6, 6, 0]}>
                  {partyTotals.map((p) => (
                    <Cell key={p.party} fill={p.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="reveal" style={{ animationDelay: "200ms" }}>
        <Card
          title="Composición del voto"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">Datos reales</span>}
        >
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={partyTotals}
                  dataKey="share"
                  nameKey="party"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="rgb(var(--c-panel))"
                  strokeWidth={2}
                >
                  {partyTotals.map((p) => (
                    <Cell key={p.party} fill={p.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, n: string) => [
                    `${(v * 100).toFixed(1)}%`,
                    n,
                  ]}
                  contentStyle={CHART_TOOLTIP_STYLE}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {derived && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
                <span className="eyebrow block">Margen</span>
                <span className="mt-1 block font-mono text-lg tabular-nums text-teal">
                  {pct(derived.margen)}
                </span>
              </div>
              <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
                <span className="eyebrow block">Abstención</span>
                <span className="mt-1 block font-mono text-lg tabular-nums text-state-warning">
                  {pct(derived.abstencion)}
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function EntidadView({
  rows,
}: {
  rows: { code: string; votes: number; winner: string; margin: number }[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.code.toLowerCase().includes(q));
  }, [rows, query]);

  const columns = useMemo<
    Column<{ code: string; votes: number; winner: string; margin: number }>[]
  >(
    () => [
      {
        key: "code",
        header: "Territorio",
        sortValue: (r) => r.code,
        render: (r) => (
          <span className="font-medium text-ink">{r.code}</span>
        ),
      },
      {
        key: "winner",
        header: "Ganador",
        render: (r) => <span className="text-ink">{r.winner || "—"}</span>,
      },
      {
        key: "margin",
        header: "Margen",
        align: "right",
        sortValue: (r) => r.margin,
        render: (r) => (
          <span className="font-mono tabular-nums text-ink-muted">
            {pct(r.margin)}
          </span>
        ),
        hideOnCard: true,
      },
      {
        key: "votes",
        header: "Votos",
        align: "right",
        sortValue: (r) => r.votes,
        render: (r) => (
          <span className="font-mono tabular-nums text-ink-muted">
            {nf.format(r.votes)}
          </span>
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
          placeholder="Filtrar por territorio…"
          className="field-input max-w-xs focus-ring"
          aria-label="Filtrar resultados por territorio"
        />
        <span className="pill border-line text-ink-muted">
          {filtered.length} de {rows.length} territorios
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.code}
        pageSize={16}
        defaultSortKey="votes"
        defaultSortDir="desc"
        emptyMessage={query ? `Sin coincidencias para "${query}".` : "Sin datos."}
      />
    </div>
  );
}

function HistoricoView({ rows }: { rows: ElectionRow[] }) {
  // Group by year + election type for a simple trend line.
  const byYear = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = String(r.anio);
      map.set(key, (map.get(key) ?? 0) + r.votos);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([year, votos]) => ({ year, votos }));
  }, [rows]);

  if (byYear.length === 0) {
    return (
      <div className="mt-5 text-sm text-ink-muted">
        Sin datos históricos disponibles para graficar.
      </div>
    );
  }

  return (
    <div className="mt-5">
      <Card title="Votos por año electoral" accentDot>
        <div className={PANEL_HEIGHTS.chartMd}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={byYear} margin={{ left: -12, top: 8, right: 8 }}>
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
                tickFormatter={(v: number) =>
                  new Intl.NumberFormat("es-MX", {
                    notation: "compact",
                  }).format(v)
                }
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(v: number) => [nf.format(v), "Votos"]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="votos"
                name="Total votos"
                stroke={CHART_PALETTE[0]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
