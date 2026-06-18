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
import type { Column } from "@/components/ui/DataTable";
import { DataTable } from "@/components/ui/DataTable";
import { MetricCard } from "@/components/ui/MetricCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { RadialGauge } from "@/components/charts/RadialGauge";
import { ParticipationChart } from "@/components/dashboards/ParticipationChart";
import { DatabaseIcon, LayersIcon, UserIcon, VotersIcon } from "@/components/ui/icons";
import { CHART_TOOLTIP_STYLE, PANEL_HEIGHTS } from "@/constants/ui";
import {
  AGE_BANDS,
  ENTITY_COVERAGE,
  PADRON_HISTORY,
  SEX_DISTRIBUTION,
  SUMMARY,
} from "./fixtures";
import type { EntityCoverage } from "./fixtures";

const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });
const nf = new Intl.NumberFormat("es-MX");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

// Derive sex-split colors from the fixture so bar chart, legend, and pie chart
// stay in sync automatically when the palette is updated in one place.
const SEX_HOMBRES = SEX_DISTRIBUTION.find((s) => s.sex === "Hombres")!.color;
const SEX_MUJERES = SEX_DISTRIBUTION.find((s) => s.sex === "Mujeres")!.color;

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
          label="Padrón electoral (muestra)"
          value={nf.format(SUMMARY.padron)}
          tone="accent"
          icon={<VotersIcon width={18} height={18} />}
          delay={0}
        />
        <MetricCard
          label="Lista nominal (muestra)"
          value={nf.format(SUMMARY.listaNominal)}
          tone="teal"
          icon={<UserIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Cobertura (muestra)"
          value={pct(SUMMARY.cobertura)}
          tone="accent"
          icon={<LayersIcon width={18} height={18} />}
          delay={160}
        />
        <MetricCard
          label="Edad mediana (muestra)"
          value={`${SUMMARY.edadMediana} años`}
          tone="teal"
          icon={<DatabaseIcon width={18} height={18} />}
          delay={240}
        />
      </div>

      {/* Accessible tab switch — SegmentedControl (roving tabindex + keyboard nav) */}
      <div className="reveal mt-5">
        <SegmentedControl<Tab>
          options={TABS}
          value={tab}
          onChange={setTab}
          ariaLabel="Vista del padrón electoral"
        />
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
          title="Distribución por edad y sexo — muestra (%)"
          accentDot
          className="h-full"
          action={
            <div className="flex items-center gap-3 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEX_HOMBRES }} />
                Hombres
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEX_MUJERES }} />
                Mujeres
              </span>
            </div>
          }
        >
          <div className={`w-full ${PANEL_HEIGHTS.chartMd}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={AGE_BANDS} margin={{ left: -16 }}>
                <XAxis dataKey="band" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
                <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
                <Tooltip cursor={{ fill: "color-mix(in srgb, var(--chart-1) 6%, transparent)" }} contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="hombres" fill={SEX_HOMBRES} radius={[4, 4, 0, 0]} />
                <Bar dataKey="mujeres" fill={SEX_MUJERES} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="reveal" style={{ animationDelay: "200ms" }}>
        <Card
          title="Distribución por sexo — muestra"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">Lista nominal · muestra</span>}
        >
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={SEX_DISTRIBUTION}
                  dataKey="share"
                  nameKey="sex"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="rgb(var(--c-panel))"
                  strokeWidth={2}
                >
                  {SEX_DISTRIBUTION.map((s) => <Cell key={s.sex} fill={s.color} />)}
                </Pie>
                <Tooltip
                  formatter={(v: number, n: string) => [pct(v), n]}
                  contentStyle={CHART_TOOLTIP_STYLE}
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
            <span className="eyebrow">Edad mediana (muestra)</span>
            <span className="font-mono text-lg tabular-nums text-accent">
              {SUMMARY.edadMediana} años
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}

const COVERAGE_COLUMNS: Column<EntityCoverage>[] = [
  {
    key: "entity",
    header: "Entidad",
    render: (r) => <span className="text-ink">{r.entity}</span>,
  },
  {
    key: "padron",
    header: "Padrón",
    align: "right",
    sortValue: (r) => r.padron,
    render: (r) => (
      <span className="font-mono tabular-nums text-ink-muted">{nf.format(r.padron)}</span>
    ),
    hideOnCard: true,
  },
  {
    key: "listaNominal",
    header: "Lista nominal",
    align: "right",
    sortValue: (r) => r.listaNominal,
    render: (r) => (
      <span className="font-mono tabular-nums text-ink-muted">{nf.format(r.listaNominal)}</span>
    ),
  },
  {
    key: "cobertura",
    header: "Cobertura",
    align: "right",
    sortValue: (r) => r.cobertura,
    render: (r) => (
      <span className="font-mono tabular-nums text-accent">{pct(r.cobertura)}</span>
    ),
  },
];

function CoberturaTab() {
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ENTITY_COVERAGE;
    return ENTITY_COVERAGE.filter((e) => e.entity.toLowerCase().includes(q));
  }, [query]);

  const avgCov = ENTITY_COVERAGE.reduce((s, e) => s + e.cobertura, 0) / ENTITY_COVERAGE.length;
  const best = [...ENTITY_COVERAGE].sort((a, b) => b.cobertura - a.cobertura)[0];
  const worst = [...ENTITY_COVERAGE].sort((a, b) => a.cobertura - b.cobertura)[0];

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="reveal lg:col-span-1" style={{ animationDelay: "120ms" }}>
        <Card title="Cobertura nacional — muestra" accentDot className="h-full">
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
        {/* Plain header row — DataTable renders its own .card-premium, no wrapping Card needed. */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-gradient shadow-glow" aria-hidden="true" />
            Cobertura por entidad — muestra
            <span className="pill border-line text-ink-muted">Lista nominal / padrón</span>
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar por entidad…"
              className="field-input focus-ring max-w-xs"
              aria-label="Filtrar entidades"
            />
            <span className="pill border-line text-ink-muted">
              {filteredRows.length} de {ENTITY_COVERAGE.length} entidades
            </span>
          </div>
        </div>

        <DataTable<EntityCoverage>
          columns={COVERAGE_COLUMNS}
          rows={filteredRows}
          rowKey={(r) => r.entity}
          pageSize={10}
          defaultSortKey="cobertura"
          defaultSortDir="desc"
          emptyMessage={`Sin coincidencias para "${query}".`}
        />
      </div>
    </div>
  );
}

function TendenciaTab() {
  const padronTrend = useMemo(
    () => PADRON_HISTORY.map((y) => ({ period: y.year, value: y.padron })),
    [],
  );
  const listaTrend = useMemo(
    () => PADRON_HISTORY.map((y) => ({ period: y.year, value: y.listaNominal })),
    [],
  );
  const covTrend = useMemo(
    () => PADRON_HISTORY.map((y) => ({ period: y.year, value: y.cobertura })),
    [],
  );

  const first = PADRON_HISTORY[0];
  const last = PADRON_HISTORY[PADRON_HISTORY.length - 1];
  const growth = first && last ? (last.padron - first.padron) / first.padron : 0;

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="reveal lg:col-span-2" style={{ animationDelay: "120ms" }}>
        <Card
          title="Padrón electoral · evolución anual — muestra"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">muestra · personas</span>}
        >
          <ParticipationChart
            data={padronTrend}
            valueFormat="number"
            seriesLabel="Padrón (muestra)"
            height={260}
          />
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
          title="Lista nominal · evolución — muestra"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">muestra</span>}
        >
          <ParticipationChart
            data={listaTrend}
            valueFormat="number"
            seriesLabel="Lista nominal (muestra)"
            height={180}
          />
          <div className="mt-4">
            <span className="eyebrow block">Cobertura por año (muestra)</span>
            <ParticipationChart
              data={covTrend}
              valueFormat="percent"
              seriesLabel="Cobertura (muestra)"
              height={120}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
