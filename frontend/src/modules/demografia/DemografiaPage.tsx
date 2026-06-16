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
import { Donut, type DonutDatum } from "@/components/charts/Donut";
import { RadialGauge } from "@/components/charts/RadialGauge";
import { DatabaseIcon, LayersIcon, UserIcon, VotersIcon } from "@/components/ui/icons";
import { getDemografia } from "./client";
import type { DemografiaData, EntityDemografia } from "./fixtures";

const nf = new Intl.NumberFormat("es-MX");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });

const TOOLTIP_STYLE = {
  background: "#06090c",
  border: "1px solid #223a44",
  borderRadius: 10,
  color: "#e6f2f5",
  fontSize: 12,
} as const;

type SortKey = "entity" | "poblacion" | "escolaridad" | "viviendas";
type SortDir = "asc" | "desc";

type DemoTab = "poblacion" | "escolaridad";

const DEMO_TABS: { id: DemoTab; label: string }[] = [
  { id: "poblacion", label: "Población" },
  { id: "escolaridad", label: "Escolaridad y vivienda" },
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

function LoadingState() {
  return (
    <div className="reveal grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card-premium h-28 animate-pulse p-5" />
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

      {/* Segmented view switch */}
      <div className="reveal mt-5 inline-flex rounded-xl border border-line bg-bg-sunken p-1">
        {DEMO_TABS.map((t) => (
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

      {tab === "poblacion" ? <PoblacionTab data={data} /> : <EscolaridadTab data={data} />}

      <EntityTable entities={entities} />
    </>
  );
}

function PoblacionTab({ data }: { data: DemografiaData }) {
  const { summary, ageSex, sexSplit } = data;

  const sexDonut: DonutDatum[] = sexSplit.map((s) => ({
    name: s.sex,
    value: Number((s.share * 100).toFixed(1)),
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
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={pyramid} layout="vertical" stackOffset="sign" margin={{ left: -8 }}>
                <CartesianGrid stroke="#15242b" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[-pyramidMax, pyramidMax]}
                  tickFormatter={(v: number) => `${Math.abs(v)}%`}
                  stroke="#52646d"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#15242b" }}
                />
                <YAxis
                  type="category"
                  dataKey="band"
                  stroke="#52646d"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  cursor={{ fill: "rgba(34,211,238,0.06)" }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, n: string) => [`${Math.abs(v).toFixed(1)}%`, n]}
                />
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
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={schooling} margin={{ left: -16, top: 8 }}>
                <CartesianGrid stroke="#15242b" vertical={false} />
                <XAxis dataKey="level" stroke="#52646d" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#15242b" }} interval={0} />
                <YAxis stroke="#52646d" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip cursor={{ fill: "rgba(34,211,238,0.06)" }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, "Población"]} />
                <Bar dataKey="share" radius={[4, 4, 0, 0]}>
                  {schooling.map((s) => (
                    <Cell key={s.level} fill={s.color ?? "#22d3ee"} />
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

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "entity", label: "Entidad", numeric: false },
  { key: "poblacion", label: "Población", numeric: true },
  { key: "escolaridad", label: "Escolaridad", numeric: true },
  { key: "viviendas", label: "Viviendas", numeric: true },
];

function EntityTable({ entities }: { entities: EntityDemografia[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("poblacion");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = entities.filter((e) => e.entity.toLowerCase().includes(q));
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "entity") return a.entity.localeCompare(b.entity, "es");
      return a[sortKey] - b[sortKey];
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [entities, query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "entity" ? "asc" : "desc");
    }
  };

  return (
    <div className="reveal mt-5" style={{ animationDelay: "280ms" }}>
      <Card
        title="Población por entidad"
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                {COLUMNS.map((c) => (
                  <th key={c.key} className={c.numeric ? "py-2.5 pr-2 text-right" : "py-2.5 pr-2"}>
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={`eyebrow inline-flex items-center gap-1 transition-colors hover:text-ink ${
                        sortKey === c.key ? "text-accent" : ""
                      } ${c.numeric ? "flex-row-reverse" : ""}`}
                    >
                      {c.label}
                      <span className="text-[10px]">
                        {sortKey === c.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
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
                  style={{ animationDelay: `${40 + i * 25}ms` }}
                >
                  <td className="py-2.5 pr-2 text-ink">{e.entity}</td>
                  <td className="py-2.5 pr-2 text-right font-mono tabular-nums text-ink">
                    {nf.format(e.poblacion)}
                  </td>
                  <td className="py-2.5 pr-2 text-right font-mono tabular-nums text-teal">
                    {e.escolaridad.toFixed(1)}
                  </td>
                  <td className="py-2.5 pr-2 text-right font-mono tabular-nums text-ink-faint">
                    {nf.format(e.viviendas)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-8 text-center text-sm text-ink-faint">
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
