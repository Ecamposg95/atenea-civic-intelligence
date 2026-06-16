// frontend/src/modules/padron/PadronPage.tsx
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
import { RadialGauge } from "@/components/charts/RadialGauge";
import { ParticipationChart } from "@/components/dashboards/ParticipationChart";
import { DatabaseIcon, LayersIcon, UserIcon, VotersIcon } from "@/components/ui/icons";
import {
  AGE_BANDS,
  ENTITY_COVERAGE,
  PADRON_HISTORY,
  SEX_DISTRIBUTION,
  SUMMARY,
} from "./fixtures";

const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });

const nf = new Intl.NumberFormat("es-MX");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const TOOLTIP_STYLE = {
  background: "#06090c",
  border: "1px solid #223a44",
  borderRadius: 10,
  color: "#e6f2f5",
} as const;

type Tab = "demografia" | "cobertura" | "tendencia";

const TABS: { id: Tab; label: string }[] = [
  { id: "demografia", label: "Demografía" },
  { id: "cobertura", label: "Cobertura" },
  { id: "tendencia", label: "Tendencia histórica" },
];

export function PadronPage() {
  const [tab, setTab] = useState<Tab>("demografia");

  return (
    <AppLayout title="Padrón / Lista Nominal" crumb="Inteligencia Electoral">
      <PageHeader
        eyebrow="Inteligencia Electoral"
        title="Padrón &"
        accent="Lista Nominal"
        subtitle="Composición demográfica del electorado y cobertura por entidad para planeación territorial."
      />
      <PreviewBanner />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Padrón electoral"
          value={nf.format(SUMMARY.padron)}
          tone="accent"
          icon={<VotersIcon width={18} height={18} />}
          delay={0}
        />
        <MetricCard
          label="Lista nominal"
          value={nf.format(SUMMARY.listaNominal)}
          tone="teal"
          icon={<UserIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Cobertura"
          value={pct(SUMMARY.cobertura)}
          tone="accent"
          icon={<LayersIcon width={18} height={18} />}
          delay={160}
        />
        <MetricCard
          label="Edad mediana"
          value={`${SUMMARY.edadMediana} años`}
          tone="teal"
          icon={<DatabaseIcon width={18} height={18} />}
          delay={240}
        />
      </div>

      {/* Tabs */}
      <div className="reveal mt-5 inline-flex rounded-xl border border-line bg-bg-sunken p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-accent text-bg shadow-glow-accent" : "text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "demografia" && <DemografiaTab />}
      {tab === "cobertura" && <CoberturaTab />}
      {tab === "tendencia" && <TendenciaTab />}
    </AppLayout>
  );
}

function DemografiaTab() {
  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="reveal" style={{ animationDelay: "120ms" }}>
        <Card
          title="Distribución por edad y sexo (%)"
          accentDot
          className="h-full"
          action={
            <div className="flex items-center gap-3 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#22d3ee" }} />
                Hombres
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#2dd4bf" }} />
                Mujeres
              </span>
            </div>
          }
        >
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={AGE_BANDS} margin={{ left: -16 }}>
                <XAxis dataKey="band" stroke="#52646d" tick={{ fontSize: 12 }} />
                <YAxis stroke="#52646d" tick={{ fontSize: 12 }} />
                <Tooltip cursor={{ fill: "rgba(34,211,238,0.06)" }} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="hombres" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                <Bar dataKey="mujeres" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="reveal" style={{ animationDelay: "200ms" }}>
        <Card
          title="Distribución por sexo"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">Lista nominal</span>}
        >
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={SEX_DISTRIBUTION}
                  dataKey="share"
                  nameKey="sex"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="#06090c"
                  strokeWidth={2}
                >
                  {SEX_DISTRIBUTION.map((s) => <Cell key={s.sex} fill={s.color} />)}
                </Pie>
                <Tooltip
                  formatter={(v: number, n: string) => [pct(v), n]}
                  contentStyle={TOOLTIP_STYLE}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {SEX_DISTRIBUTION.map((s) => (
              <div key={s.sex} className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.sex}
                </span>
                <div className="mt-1 font-mono text-lg tabular-nums text-ink">{pct(s.share)}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-3">
            <span className="eyebrow">Edad mediana</span>
            <span className="font-mono text-lg tabular-nums text-accent">
              {SUMMARY.edadMediana} años
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}

function CoberturaTab() {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ENTITY_COVERAGE.filter((e) => e.entity.toLowerCase().includes(q)).sort(
      (a, b) => b.cobertura - a.cobertura,
    );
  }, [query]);

  const minCov = Math.min(...ENTITY_COVERAGE.map((e) => e.cobertura));
  const maxCov = Math.max(...ENTITY_COVERAGE.map((e) => e.cobertura));
  const span = maxCov - minCov || 1;
  // Normalize fill so differences read clearly (floor at ~35% width).
  const fillWidth = (cov: number) => 0.35 + ((cov - minCov) / span) * 0.65;

  const avgCov = ENTITY_COVERAGE.reduce((s, e) => s + e.cobertura, 0) / ENTITY_COVERAGE.length;
  const best = [...ENTITY_COVERAGE].sort((a, b) => b.cobertura - a.cobertura)[0];
  const worst = [...ENTITY_COVERAGE].sort((a, b) => a.cobertura - b.cobertura)[0];

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="reveal lg:col-span-1" style={{ animationDelay: "120ms" }}>
        <Card title="Cobertura nacional" accentDot className="h-full">
          <div className="flex flex-col items-center gap-4 py-2">
            <RadialGauge value={SUMMARY.cobertura} label="Cobertura" size={148} />
            <div className="grid w-full grid-cols-2 gap-3">
              <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
                <span className="eyebrow block">Promedio entidades</span>
                <span className="mt-1 block font-mono text-lg tabular-nums text-accent">
                  {pct(avgCov)}
                </span>
              </div>
              <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
                <span className="eyebrow block">Mayor cobertura</span>
                <span className="mt-1 block font-mono text-sm tabular-nums text-teal">
                  {best ? pct(best.cobertura) : "—"}
                </span>
                <span className="text-[11px] text-ink-faint">{best?.entity}</span>
              </div>
            </div>
            <div className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
              <span className="eyebrow block">Menor cobertura (muestra)</span>
              <span className="mt-1 block font-mono text-sm tabular-nums text-state-warning">
                {worst ? `${pct(worst.cobertura)} · ${worst.entity}` : "—"}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <div className="reveal lg:col-span-2" style={{ animationDelay: "200ms" }}>
      <Card
        title="Cobertura por entidad"
        accentDot
        action={<span className="pill border-line text-ink-muted">Lista nominal / padrón</span>}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por entidad…"
            className="field-input max-w-xs"
          />
          <span className="pill border-line text-ink-muted">
            {rows.length} de {ENTITY_COVERAGE.length} entidades
          </span>
        </div>

        <div className="space-y-2.5">
          {rows.map((e, i) => (
            <div
              key={e.entity}
              className="reveal group relative overflow-hidden rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:bg-panel-hover"
              style={{ animationDelay: `${60 + i * 40}ms` }}
            >
              {/* Proportional fill bar */}
              <span
                className="pointer-events-none absolute inset-y-0 left-0 bg-accent/10"
                style={{ width: `${fillWidth(e.cobertura) * 100}%` }}
                aria-hidden="true"
              />
              <div className="relative flex items-center justify-between gap-3">
                <span className="text-sm text-ink">{e.entity}</span>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs tabular-nums text-ink-faint">
                    {nf.format(e.listaNominal)}
                  </span>
                  <span className="w-14 text-right font-mono text-sm tabular-nums text-accent">
                    {pct(e.cobertura)}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-faint">
              Sin coincidencias para “{query}”.
            </p>
          )}
        </div>
      </Card>
      </div>
    </div>
  );
}

function TendenciaTab() {
  const padronTrend = PADRON_HISTORY.map((y) => ({ period: y.year, value: y.padron }));
  const listaTrend = PADRON_HISTORY.map((y) => ({ period: y.year, value: y.listaNominal }));
  const covTrend = PADRON_HISTORY.map((y) => ({ period: y.year, value: y.cobertura }));
  const first = PADRON_HISTORY[0];
  const last = PADRON_HISTORY[PADRON_HISTORY.length - 1];
  const growth = first && last ? (last.padron - first.padron) / first.padron : 0;

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="reveal lg:col-span-2" style={{ animationDelay: "120ms" }}>
        <Card
          title="Padrón electoral · evolución anual"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">muestra · personas</span>}
        >
          <ParticipationChart data={padronTrend} valueFormat="number" seriesLabel="Padrón" height={260} />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
              <span className="eyebrow block">{first?.year}</span>
              <span className="mt-1 block font-mono text-sm tabular-nums text-ink">
                {first ? compact.format(first.padron) : "—"}
              </span>
            </div>
            <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
              <span className="eyebrow block">{last?.year}</span>
              <span className="mt-1 block font-mono text-sm tabular-nums text-accent">
                {last ? compact.format(last.padron) : "—"}
              </span>
            </div>
            <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
              <span className="eyebrow block">Crecimiento</span>
              <span className="mt-1 block font-mono text-sm tabular-nums text-teal">
                +{pct(growth)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <div className="reveal" style={{ animationDelay: "200ms" }}>
        <Card
          title="Lista nominal · evolución"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">muestra</span>}
        >
          <ParticipationChart data={listaTrend} valueFormat="number" seriesLabel="Lista nominal" height={180} />
          <div className="mt-4">
            <span className="eyebrow block">Cobertura por año (muestra)</span>
            <ParticipationChart data={covTrend} valueFormat="percent" seriesLabel="Cobertura" height={120} />
          </div>
        </Card>
      </div>
    </div>
  );
}
