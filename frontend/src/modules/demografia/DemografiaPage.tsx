// frontend/src/modules/demografia/DemografiaPage.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Donut, type DonutDatum } from "@/components/charts/Donut";
import { RadialGauge } from "@/components/charts/RadialGauge";
import { DatabaseIcon, LayersIcon, UserIcon, VotersIcon } from "@/components/ui/icons";
import { CHART_TOOLTIP_STYLE, PANEL_HEIGHTS } from "@/constants/ui";
import { getDemografia } from "./client";
import type { DemografiaData, EntityDemografia } from "./fixtures";

const nf = new Intl.NumberFormat("es-MX");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });

type DemoTab = "poblacion" | "escolaridad";

const DEMO_TABS: { id: DemoTab; label: string }[] = [
  { id: "poblacion", label: "Población" },
  { id: "escolaridad", label: "Escolaridad y vivienda" },
];

// DataTable column definitions — memoized at module level (static fixtures, no closure deps).
const ENTITY_COLUMNS: Column<EntityDemografia>[] = [
  {
    key: "entity",
    header: "Entidad",
    render: (e) => e.entity,
    sortValue: (e) => e.entity,
    align: "left",
  },
  {
    key: "poblacion",
    header: "Población",
    render: (e) => nf.format(e.poblacion),
    sortValue: (e) => e.poblacion,
    align: "right",
  },
  {
    key: "escolaridad",
    header: "Escolaridad (años)",
    render: (e) => (
      <span className="text-teal">{e.escolaridad.toFixed(1)}</span>
    ),
    sortValue: (e) => e.escolaridad,
    align: "right",
    hideOnCard: true,
  },
  {
    key: "viviendas",
    header: "Viviendas",
    render: (e) => (
      <span className="text-ink-faint">{nf.format(e.viviendas)}</span>
    ),
    sortValue: (e) => e.viviendas,
    align: "right",
    hideOnCard: true,
  },
];

export function DemografiaPage() {
  const [data, setData] = useState<DemografiaData | null>(null);

  useEffect(() => {
    let active = true;
    void getDemografia().then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppLayout title="Demografía & Censo" crumb="Contexto socioeconómico">
      <PageHeader
        eyebrow="Contexto socioeconómico"
        title="Demografía"
        accent="& Censo"
        subtitle="Composición poblacional, escolaridad y vivienda por entidad como contexto para la planeación cívica y territorial."
        actions={<span className="pill border-line text-ink-muted">Fuente futura · INEGI</span>}
      />
      <PreviewBanner note="Datos de muestra · INEGI no está conectada (requiere token). Las cifras son ilustrativas." />

      {data ? <DemografiaBody data={data} /> : <LoadingState />}
    </AppLayout>
  );
}

// P-2: SkeletonCard replaces inline animate-pulse divs.
function LoadingState() {
  return (
    <div className="reveal grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} className="h-28" />
      ))}
    </div>
  );
}

function DemografiaBody({ data }: { data: DemografiaData }) {
  const { summary, entities } = data;
  const [tab, setTab] = useState<DemoTab>("poblacion");

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Población total"
          value={nf.format(summary.poblacion)}
          tone="accent"
          icon={<VotersIcon width={18} height={18} />}
          delay={0}
        />
        <MetricCard
          label="Escolaridad promedio"
          value={`${summary.escolaridad.toFixed(1)} años`}
          tone="teal"
          icon={<DatabaseIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Viviendas habitadas"
          value={nf.format(summary.viviendas)}
          tone="accent"
          icon={<LayersIcon width={18} height={18} />}
          delay={160}
        />
        <MetricCard
          label="Edad mediana"
          value={`${summary.edadMediana} años`}
          tone="teal"
          icon={<UserIcon width={18} height={18} />}
          delay={240}
        />
      </div>

      {/* P-3: SegmentedControl replaces hand-rolled tab bar */}
      <div className="reveal mt-5">
        <SegmentedControl<DemoTab>
          options={DEMO_TABS}
          value={tab}
          onChange={setTab}
          ariaLabel="Vista de demografía"
        />
      </div>

      {tab === "poblacion" ? <PoblacionTab data={data} /> : <EscolaridadTab data={data} />}

      {/* P-4: EntityTable → DataTable */}
      <EntityTable entities={entities} />
    </>
  );
}

function PoblacionTab({ data }: { data: DemografiaData }) {
  const { summary, ageSex, sexSplit } = data;

  const sexDonut: DonutDatum[] = sexSplit.map((s) => ({
    name: s.sex,
    value: Number((s.share * 100).toFixed(1)),
    // P-5: semantic per-datum colors — preserve (sex-split fixture colors).
    color: s.color,
  }));

  // Diverging pyramid: men to the left (negative), women to the right.
  const pyramid = useMemo(
    () => ageSex.map((b) => ({ band: b.band, hombres: -b.hombres, mujeres: b.mujeres })),
    [ageSex],
  );
  const pyramidMax = useMemo(
    () => Math.ceil(Math.max(...ageSex.flatMap((b) => [b.hombres, b.mujeres]))),
    [ageSex],
  );

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="reveal lg:col-span-2" style={{ animationDelay: "120ms" }}>
        <Card
          title="Pirámide poblacional por edad y sexo (%)"
          accentDot
          className="h-full"
          action={
            <div className="flex items-center gap-3 text-xs text-ink-muted">
              {/* P-5: semantic colors for sex split — preserved from fixtures. */}
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
          {/* P-6: PANEL_HEIGHTS.chartMd instead of hardcoded height */}
          <div className={PANEL_HEIGHTS.chartMd}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pyramid} layout="vertical" stackOffset="sign" margin={{ left: -8 }}>
                <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[-pyramidMax, pyramidMax]}
                  tickFormatter={(v: number) => `${Math.abs(v)}%`}
                  stroke="var(--chart-axis)"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--chart-grid)" }}
                />
                <YAxis
                  type="category"
                  dataKey="band"
                  stroke="var(--chart-axis)"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                {/* P-5: CHART_TOOLTIP_STYLE replaces local TOOLTIP_STYLE */}
                <Tooltip
                  cursor={{ fill: "color-mix(in srgb, var(--chart-1) 6%, transparent)" }}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: number, n: string) => [`${Math.abs(v).toFixed(1)}%`, n]}
                />
                {/* P-5: semantic bar colors for sex — preserve (cyan=hombres, teal=mujeres) */}
                <Bar dataKey="hombres" stackId="p" fill="#22d3ee" radius={[2, 0, 0, 2]} />
                <Bar dataKey="mujeres" stackId="p" fill="#2dd4bf" radius={[0, 2, 2, 0]} />
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
          action={<span className="pill border-line text-ink-muted">muestra</span>}
        >
          <Donut data={sexDonut} height={200} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {sexSplit.map((s) => (
              <div key={s.sex} className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
                  {/* P-5: per-datum fixture color — preserve */}
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.sex}
                </span>
                <div className="mt-1 font-mono text-lg tabular-nums text-ink">{pct(s.share)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-3">
            <span className="eyebrow">Población total</span>
            <span className="font-mono text-lg tabular-nums text-accent">
              {compact.format(summary.poblacion)}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}

function EscolaridadTab({ data }: { data: DemografiaData }) {
  const { summary, schooling, dwellings } = data;

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="reveal lg:col-span-2" style={{ animationDelay: "120ms" }}>
        <Card
          title="Nivel de escolaridad de la población (%)"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">muestra</span>}
        >
          {/* P-6: PANEL_HEIGHTS.chartMd instead of hardcoded height */}
          <div className={PANEL_HEIGHTS.chartMd}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={schooling} margin={{ left: -16, top: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="level"
                  stroke="var(--chart-axis)"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--chart-grid)" }}
                  interval={0}
                />
                <YAxis
                  stroke="var(--chart-axis)"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                {/* P-5: CHART_TOOLTIP_STYLE replaces local TOOLTIP_STYLE */}
                <Tooltip
                  cursor={{ fill: "color-mix(in srgb, var(--chart-1) 6%, transparent)" }}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: number) => [`${v}%`, "Población"]}
                />
                <Bar dataKey="share" radius={[4, 4, 0, 0]}>
                  {/* P-5: per-level semantic colors from fixtures — preserve */}
                  {schooling.map((s) => (
                    <Cell key={s.level} fill={s.color ?? "var(--chart-1)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4">
            <span className="eyebrow block">Servicios en la vivienda (muestra)</span>
            <div className="mt-3 space-y-2.5">
              {dwellings.map((d) => (
                <div key={d.service}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted">{d.service}</span>
                    <span className="font-mono tabular-nums text-accent">{pct(d.share)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-sunken">
                    <div
                      className="h-full rounded-full bg-accent-gradient"
                      style={{ width: `${d.share * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="reveal" style={{ animationDelay: "200ms" }}>
        <Card title="Razón de dependencia" accentDot className="h-full">
          <div className="flex flex-col items-center gap-4 py-2">
            <RadialGauge value={summary.dependencia} label="Dependencia" size={148} />
            <p className="text-center text-xs leading-relaxed text-ink-muted">
              Población dependiente (menores de 15 y de 65+) respecto a la población en
              edad productiva. Cifra de muestra.
            </p>
            <div className="grid w-full grid-cols-2 gap-3">
              <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
                <span className="eyebrow block">Escolaridad prom.</span>
                <span className="mt-1 block font-mono text-lg tabular-nums text-teal">
                  {summary.escolaridad.toFixed(1)} años
                </span>
              </div>
              <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
                <span className="eyebrow block">Edad mediana</span>
                <span className="mt-1 block font-mono text-lg tabular-nums text-accent">
                  {summary.edadMediana} años
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// P-4: DataTable replaces hand-rolled EntityTable (handles sort/paginate; no double-card).
function EntityTable({ entities }: { entities: EntityDemografia[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter((e) => e.entity.toLowerCase().includes(q));
  }, [entities, query]);

  return (
    <div className="reveal mt-5" style={{ animationDelay: "280ms" }}>
      {/* Plain element above DataTable — no wrapping Card (DataTable renders its own .card-premium). */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">
          Población por entidad
          <span className="ml-2 pill border-line text-ink-muted">muestra</span>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por entidad…"
            aria-label="Filtrar entidades"
            className="field-input focus-ring max-w-xs"
          />
          <span className="pill border-line text-ink-muted">
            {filtered.length} de {entities.length} entidades
          </span>
        </div>
      </div>

      <DataTable<EntityDemografia>
        columns={ENTITY_COLUMNS}
        rows={filtered}
        rowKey={(e) => e.entity}
        defaultSortKey="poblacion"
        defaultSortDir="desc"
        emptyMessage={`Sin coincidencias para "${query}".`}
        pageSize={16}
      />
    </div>
  );
}
