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
import { AnalyticsIcon, DatabaseIcon, LayersIcon, VotersIcon } from "@/components/ui/icons";
import { getEconomy, type EconomyData } from "./client";
import type { EntityEconomy } from "./fixtures";

const TOOLTIP_STYLE = {
  background: "#06090c",
  border: "1px solid #223a44",
  borderRadius: 10,
  color: "#e6f2f5",
  fontSize: 12,
} as const;

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

const SECTOR_SERIES: StackSeries[] = [
  { key: "primario", color: "#2dd4bf" },
  { key: "secundario", color: "#f5b53d" },
  { key: "terciario", color: "#22d3ee" },
];

type SortKey = keyof Pick<
  EntityEconomy,
  "pib" | "empleo" | "complejidad" | "comercio" | "crecimiento"
>;

const COLUMNS: { key: SortKey; label: string; render: (e: EntityEconomy) => string }[] = [
  { key: "pib", label: "PIB (MMDP)", render: (e) => compact.format(e.pib) },
  { key: "empleo", label: "Empleo formal", render: (e) => nf.format(e.empleo) },
  { key: "complejidad", label: "Complejidad (ECI)", render: (e) => e.complejidad.toFixed(2) },
  { key: "comercio", label: "Comercio (MMD USD)", render: (e) => e.comercio.toFixed(1) },
  { key: "crecimiento", label: "Crecimiento", render: (e) => pct(e.crecimiento) },
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

          {/* Segmented view switch */}
          <div className="reveal mt-5 inline-flex rounded-xl border border-line bg-bg-sunken p-1">
            {ECO_TABS.map((t) => (
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

          {tab === "sectores" && <SectoresTab data={data} />}
          {tab === "comercio" && <ComercioTab data={data} />}
          {tab === "complejidad" && <ComplejidadTab data={data} />}

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
          <StackedBars data={sectorRows} series={SECTOR_SERIES} xKey="entity" height={280} />
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
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#22d3ee" }} />
                Exportaciones
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#f5b53d" }} />
                Importaciones
              </span>
            </div>
          }
        >
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={balanceRows} margin={{ left: -16, top: 8 }}>
                <CartesianGrid stroke="#15242b" vertical={false} />
                <XAxis dataKey="year" stroke="#52646d" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#15242b" }} />
                <YAxis stroke="#52646d" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "rgba(34,211,238,0.06)" }} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="exportaciones" fill="#22d3ee" radius={[3, 3, 0, 0]} />
                <Bar dataKey="importaciones" fill="#f5b53d" radius={[3, 3, 0, 0]} />
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
          <div style={{ width: "100%", height: 380 }}>
            <ResponsiveContainer>
              <BarChart data={rows} layout="vertical" margin={{ left: 24, right: 12 }}>
                <CartesianGrid stroke="#15242b" horizontal={false} />
                <XAxis type="number" stroke="#52646d" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#15242b" }} />
                <YAxis type="category" dataKey="entity" stroke="#52646d" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                <Tooltip cursor={{ fill: "rgba(34,211,238,0.06)" }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v.toFixed(2), "ECI"]} />
                <Bar dataKey="eci" fill="#22d3ee" radius={[0, 3, 3, 0]} />
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

function LoadingState() {
  return (
    <div className="reveal grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card-premium h-28 animate-pulse p-5" />
      ))}
    </div>
  );
}

function EntityTable({ entities }: { entities: EntityEconomy[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("pib");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entities
      .filter((e) => e.entity.toLowerCase().includes(q))
      .sort((a, b) => b[sort] - a[sort]);
  }, [entities, query, sort]);

  return (
    <div className="reveal mt-5" style={{ animationDelay: "280ms" }}>
      <Card
        title="Indicadores por entidad"
        accentDot
        action={<span className="pill border-line text-ink-muted">muestra</span>}
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
            {rows.length} de {entities.length} entidades
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-4 font-medium text-ink-muted">Entidad</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="py-2 px-3 text-right font-medium">
                    <button
                      type="button"
                      onClick={() => setSort(c.key)}
                      className={`eyebrow inline-flex items-center gap-1 transition-colors hover:text-accent ${
                        sort === c.key ? "text-accent" : "text-ink-muted"
                      }`}
                    >
                      {c.label}
                      {sort === c.key && <span aria-hidden="true">▾</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr
                  key={e.entity}
                  className="reveal border-b border-line/60 transition-colors hover:bg-panel-hover"
                  style={{ animationDelay: `${40 + i * 30}ms` }}
                >
                  <td className="py-2.5 pr-4 text-ink">{e.entity}</td>
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                        sort === c.key ? "text-accent" : "text-ink-faint"
                      }`}
                    >
                      {c.render(e)}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="py-8 text-center text-sm text-ink-faint">
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
