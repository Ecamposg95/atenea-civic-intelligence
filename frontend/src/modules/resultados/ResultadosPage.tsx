// frontend/src/modules/resultados/ResultadosPage.tsx
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
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
import { MetricCard } from "@/components/ui/MetricCard";
import { Sparkline } from "@/components/ui/Sparkline";
import { AnalyticsIcon, ShieldIcon, VotersIcon } from "@/components/ui/icons";
import { ENTITY_RESULTS, NATIONAL, PARTY_RESULTS } from "./fixtures";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const nf = new Intl.NumberFormat("es-MX");

/** Color chip keyed by the leading party/coalition (matches fixture palette). */
const PARTY_COLOR: Record<string, string> = Object.fromEntries(
  PARTY_RESULTS.map((p) => [p.party, p.color]),
);

const TOOLTIP_STYLE = {
  background: "#06090c",
  border: "1px solid #223a44",
  borderRadius: 10,
  color: "#e6f2f5",
} as const;

type View = "nacional" | "entidad";
type SortKey = "entity" | "turnout" | "margin" | "votes";
type SortDir = "asc" | "desc";

const VIEWS: { id: View; label: string }[] = [
  { id: "nacional", label: "Nacional" },
  { id: "entidad", label: "Por entidad" },
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

      {/* Segmented view switch */}
      <div className="reveal mb-5 inline-flex rounded-xl border border-line bg-bg-sunken p-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              view === v.id
                ? "bg-accent text-bg shadow-glow-accent"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {v.label}
          </button>
        ))}
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

      {view === "nacional" ? <NacionalView /> : <EntidadView />}
    </AppLayout>
  );
}

function NacionalView() {
  return (
    <>
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
          <Card
            title="Distribución del voto"
            accentDot
            className="h-full"
            action={<span className="pill border-line text-ink-muted">Cómputo nacional</span>}
          >
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={PARTY_RESULTS} layout="vertical" margin={{ left: 24 }}>
                  <XAxis type="number" tickFormatter={pct} stroke="#52646d" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="party" stroke="#52646d" tick={{ fontSize: 12 }} width={110} />
                  <Tooltip
                    cursor={{ fill: "rgba(34,211,238,0.06)" }}
                    formatter={(v: number) => pct(v)}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Bar dataKey="share" radius={[0, 6, 6, 0]}>
                    {PARTY_RESULTS.map((p) => <Cell key={p.party} fill={p.color} />)}
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
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={PARTY_RESULTS}
                    dataKey="share"
                    nameKey="party"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={2}
                    stroke="#06090c"
                    strokeWidth={2}
                  >
                    {PARTY_RESULTS.map((p) => <Cell key={p.party} fill={p.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, n: string) => [pct(v), n]}
                    contentStyle={TOOLTIP_STYLE}
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
  const [sortKey, setSortKey] = useState<SortKey>("turnout");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = ENTITY_RESULTS.filter((e) => e.entity.toLowerCase().includes(q));
    const sorted = [...filtered].sort((a, b) => {
      let cmp: number;
      if (sortKey === "entity") cmp = a.entity.localeCompare(b.entity, "es");
      else cmp = a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "entity" ? "asc" : "desc");
    }
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "";

  return (
    <div className="reveal mt-5" style={{ animationDelay: "120ms" }}>
      <Card title="Resultados por entidad" accentDot className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por entidad…"
            className="field-input max-w-xs"
          />
          <span className="pill border-line text-ink-muted">
            {rows.length} de {ENTITY_RESULTS.length} entidades
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-bg-sunken/60 text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3 font-medium">
                  <button type="button" onClick={() => toggleSort("entity")} className="inline-flex items-center gap-1 hover:text-ink">
                    Entidad <span className="text-accent">{arrow("entity")}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <button type="button" onClick={() => toggleSort("turnout")} className="inline-flex items-center gap-1 hover:text-ink">
                    Participación <span className="text-accent">{arrow("turnout")}</span>
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">Ganador</th>
                <th className="px-4 py-3 text-right font-medium">
                  <button type="button" onClick={() => toggleSort("margin")} className="inline-flex items-center gap-1 hover:text-ink">
                    Margen <span className="text-accent">{arrow("margin")}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <button type="button" onClick={() => toggleSort("votes")} className="inline-flex items-center gap-1 hover:text-ink">
                    Votos <span className="text-accent">{arrow("votes")}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.entity}
                  className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-hover/50"
                >
                  <td className="px-4 py-3 text-ink">{e.entity}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-muted">
                    {pct(e.turnout)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: PARTY_COLOR[e.winner] ?? "#7c8aa5" }}
                      />
                      <span className="text-ink">{e.winner}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-muted">
                    {pct(e.margin)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-muted">
                    {nf.format(e.votes)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-faint">
                    Sin coincidencias para “{query}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
