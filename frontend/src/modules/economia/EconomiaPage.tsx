// frontend/src/modules/economia/EconomiaPage.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PreviewBanner } from "@/components/modules/PreviewBanner";
import { Donut } from "@/components/charts/Donut";
import { StackedBars, type StackSeries } from "@/components/charts/StackedBars";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { AnalyticsIcon, DatabaseIcon, LayersIcon, VotersIcon } from "@/components/ui/icons";
import { CHART_TOOLTIP_STYLE, CHART_PALETTE, PANEL_HEIGHTS } from "@/constants/ui";
import { getEconomy, type EconomyData } from "./client";
import type { EntityEconomy } from "./fixtures";

type EcoTab = "sectores" | "comercio" | "complejidad";

const ECO_TABS: { id: EcoTab; label: string }[] = [
  { id: "sectores", label: "Sectores" },
  { id: "comercio", label: "Comercio" },
  { id: "complejidad", label: "Complejidad" },
];

const nf = new Intl.NumberFormat("es-MX");
const compact = new Intl.NumberFormat("es-MX", { notation: "compact" });
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const mxn = (v: number) => `$${compact.format(v)} MMDP`;

// Semantically-named sector series — colors are intentional (primary/secondary/tertiary).
const SECTOR_SERIES: StackSeries[] = [
  { key: "primario", color: "#2dd4bf" },
  { key: "secundario", color: "#f5b53d" },
  { key: "terciario", color: "#22d3ee" },
];

// DataTable column definitions — memoized at module level (static fixtures, no closure deps).
const ENTITY_COLUMNS: Column<EntityEconomy>[] = [
  {
    key: "entity",
    header: "Entidad",
    render: (e) => e.entity,
    sortValue: (e) => e.entity,
    align: "left",
  },
  {
    key: "pib",
    header: "PIB (MMDP)",
    render: (e) => compact.format(e.pib),
    sortValue: (e) => e.pib,
    align: "right",
  },
  {
    key: "empleo",
    header: "Empleo formal",
    render: (e) => nf.format(e.empleo),
    sortValue: (e) => e.empleo,
    align: "right",
    hideOnCard: true,
  },
  {
    key: "complejidad",
    header: "Complejidad (ECI)",
    render: (e) => e.complejidad.toFixed(2),
    sortValue: (e) => e.complejidad,
    align: "right",
    hideOnCard: true,
  },
  {
    key: "comercio",
    header: "Comercio (MMD USD)",
    render: (e) => e.comercio.toFixed(1),
    sortValue: (e) => e.comercio,
    align: "right",
    hideOnCard: true,
  },
  {
    key: "crecimiento",
    header: "Crecimiento",
    render: (e) => pct(e.crecimiento),
    sortValue: (e) => e.crecimiento,
    align: "right",
  },
];

export function EconomiaPage() {
  const [data, setData] = useState<EconomyData | null>(null);
  const [tab, setTab] = useState<EcoTab>("sectores");

  useEffect(() => {
    let active = true;
    void getEconomy().then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppLayout title="Economía Territorial" crumb="Inteligencia Económica">
      <PageHeader
        eyebrow="Inteligencia Económica"
        title="Economía"
        accent="Territorial"
        subtitle="PIB, empleo, complejidad económica y comercio por entidad — base para la estrategia territorial."
        actions={<span className="pill border-line text-ink-muted">Fuente futura · DataMéxico</span>}
      />
      <PreviewBanner note="Datos de muestra (DataMéxico) · Preview. Las cifras son ilustrativas y se conectarán a la fuente real." />

      {data ? (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="PIB nacional (MMDP)"
              value={mxn(data.summary.pibNacional)}
              tone="accent"
              icon={<AnalyticsIcon width={18} height={18} />}
              delay={0}
            />
            <MetricCard
              label="Empleo formal"
              value={compact.format(data.summary.empleoFormal)}
              tone="teal"
              icon={<VotersIcon width={18} height={18} />}
              delay={80}
            />
            <MetricCard
              label="Exportaciones (MMD USD)"
              value={`$${nf.format(data.summary.exportaciones)}`}
              tone="warning"
              icon={<DatabaseIcon width={18} height={18} />}
              delay={160}
            />
            <MetricCard
              label="Crecimiento anual"
              value={pct(data.summary.crecimientoAnual)}
              tone="accent"
              icon={<LayersIcon width={18} height={18} />}
              delay={240}
            />
          </div>

          {/* P-3: SegmentedControl replaces hand-rolled tab bar */}
          <div className="reveal mt-5">
            <SegmentedControl<EcoTab>
              options={ECO_TABS}
              value={tab}
              onChange={setTab}
              ariaLabel="Vista de economía territorial"
            />
          </div>

          {tab === "sectores" && <SectoresTab data={data} />}
          {tab === "comercio" && <ComercioTab data={data} />}
          {tab === "complejidad" && <ComplejidadTab data={data} />}

          {/* P-4: EntityTable → DataTable */}
          <EntityTable entities={data.entities} />
        </>
      ) : (
        <LoadingState />
      )}
    </AppLayout>
  );
}

function SectoresTab({ data }: { data: EconomyData }) {
  const sectorRows = useMemo<Record<string, number | string>[]>(
    () =>
      data.sectors.map((s) => ({
        entity: s.entity,
        primario: s.primario,
        secundario: s.secundario,
        terciario: s.terciario,
      })),
    [data.sectors],
  );

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="reveal lg:col-span-2" style={{ animationDelay: "120ms" }}>
        <Card
          title="Composición del PIB por sector (%)"
          accentDot
          className="h-full"
          action={
            <div className="flex items-center gap-3 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#2dd4bf" }} />
                Primario
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#f5b53d" }} />
                Secundario
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#22d3ee" }} />
                Terciario
              </span>
            </div>
          }
        >
          {/* P-6: PANEL_HEIGHTS.chartMd instead of hardcoded height; pass "100%" so StackedBars fills it */}
          <div className={PANEL_HEIGHTS.chartMd}>
            <StackedBars data={sectorRows} series={SECTOR_SERIES} xKey="entity" height="100%" />
          </div>
        </Card>
      </div>

      <div className="reveal" style={{ animationDelay: "200ms" }}>
        <Card
          title="Exportaciones por sector"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">muestra · MMD USD</span>}
        >
          <Donut data={data.exports} height={220} />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {data.exports.map((s) => (
              <div key={s.name} className="rounded-lg border border-line bg-bg-sunken px-3 py-2">
                <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
                  {/* P-5: s.color is an explicit per-datum fixture color — preserve */}
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
                <div className="mt-1 font-mono text-sm tabular-nums text-ink">
                  ${nf.format(s.value)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ComercioTab({ data }: { data: EconomyData }) {
  const balanceRows = useMemo(
    () =>
      data.trade.map((p) => ({
        year: p.year,
        exportaciones: p.exportaciones,
        importaciones: p.importaciones,
        balanza: p.exportaciones - p.importaciones,
      })),
    [data.trade],
  );
  const last = balanceRows[balanceRows.length - 1];

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="reveal lg:col-span-2" style={{ animationDelay: "120ms" }}>
        <Card
          title="Balanza comercial anual (MMD USD)"
          accentDot
          className="h-full"
          action={
            <div className="flex items-center gap-3 text-xs text-ink-muted">
              {/* Series colors match Bar fills below — explicit semantic pairing */}
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_PALETTE[0] }} />
                Exportaciones
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_PALETTE[1] }} />
                Importaciones
              </span>
            </div>
          }
        >
          {/* P-6: responsive height via PANEL_HEIGHTS */}
          <div className={PANEL_HEIGHTS.chartMd}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={balanceRows} margin={{ left: -16, top: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="year" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} />
                <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                {/* P-5: CHART_TOOLTIP_STYLE replaces local TOOLTIP_STYLE */}
                <Tooltip cursor={{ fill: "color-mix(in srgb, var(--chart-1) 6%, transparent)" }} contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="exportaciones" fill={CHART_PALETTE[0]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="importaciones" fill={CHART_PALETTE[1]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {last && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-3">
              <span className="eyebrow">Balanza {last.year} (muestra)</span>
              <span
                className={`font-mono text-lg tabular-nums ${
                  last.balanza >= 0 ? "text-teal" : "text-state-critical"
                }`}
              >
                {last.balanza >= 0 ? "+" : ""}
                {nf.format(last.balanza)} MMD
              </span>
            </div>
          )}
        </Card>
      </div>

      <div className="reveal" style={{ animationDelay: "200ms" }}>
        <Card
          title="Comercio por subsector"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">muestra · miles de est.</span>}
        >
          <Donut data={data.comercio} height={220} />
          <div className="mt-4 space-y-2">
            {data.comercio.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-2"
              >
                <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
                  {/* P-5: s.color is an explicit per-datum fixture color — preserve */}
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
                <span className="font-mono text-sm tabular-nums text-ink">{nf.format(s.value)}k</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ComplejidadTab({ data }: { data: EconomyData }) {
  const rows = useMemo(
    () => [...data.complexity].sort((a, b) => b.eci - a.eci),
    [data.complexity],
  );
  const maxDiv = Math.max(...rows.map((r) => r.diversidad)) || 1;

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="reveal lg:col-span-2" style={{ animationDelay: "120ms" }}>
        <Card
          title="Índice de complejidad económica (ECI) por entidad"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">muestra · ECI</span>}
        >
          {/* P-6: taller panel for vertical bar chart — chartMd height */}
          <div className={`${PANEL_HEIGHTS.chartMd} min-h-[320px]`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ left: 24, right: 12 }}>
                <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                <XAxis type="number" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} />
                <YAxis type="category" dataKey="entity" stroke="var(--chart-axis)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                {/* P-5: CHART_TOOLTIP_STYLE replaces local TOOLTIP_STYLE */}
                <Tooltip cursor={{ fill: "color-mix(in srgb, var(--chart-1) 6%, transparent)" }} contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => [v.toFixed(2), "ECI"]} />
                <Bar dataKey="eci" fill={CHART_PALETTE[0]} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="reveal" style={{ animationDelay: "200ms" }}>
        <Card
          title="Diversidad productiva"
          accentDot
          className="h-full"
          action={<span className="pill border-line text-ink-muted">muestra · proxy</span>}
        >
          <div className="space-y-2.5">
            {rows.slice(0, 10).map((r, i) => (
              <div
                key={r.entity}
                className="reveal relative overflow-hidden rounded-lg border border-line bg-bg-sunken px-3 py-2.5"
                style={{ animationDelay: `${60 + i * 35}ms` }}
              >
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-teal/10"
                  style={{ width: `${(r.diversidad / maxDiv) * 100}%` }}
                  aria-hidden="true"
                />
                <div className="relative flex items-center justify-between gap-3">
                  <span className="truncate text-sm text-ink">{r.entity}</span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-teal">
                    {r.diversidad}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// P-2: SkeletonCard replaces inline animate-pulse divs
function LoadingState() {
  return (
    <div className="reveal grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} className="h-28" />
      ))}
    </div>
  );
}

// P-4: DataTable replaces hand-rolled EntityTable (handles sort, filter is done via parent rows prop)
function EntityTable({ entities }: { entities: EntityEconomy[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter((e) => e.entity.toLowerCase().includes(q));
  }, [entities, query]);

  return (
    <div className="reveal mt-5" style={{ animationDelay: "280ms" }}>
      {/* Plain header row — DataTable renders its own .card-premium, no wrapping Card needed. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-gradient shadow-glow" aria-hidden="true" />
          Indicadores por entidad
          <span className="pill border-line text-ink-muted">muestra</span>
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
            {filtered.length} de {entities.length} entidades
          </span>
        </div>
      </div>

      <DataTable<EntityEconomy>
        columns={ENTITY_COLUMNS}
        rows={filtered}
        rowKey={(e) => e.entity}
        defaultSortKey="pib"
        defaultSortDir="desc"
        emptyMessage={`Sin coincidencias para "${query}".`}
        pageSize={16}
      />
    </div>
  );
}
