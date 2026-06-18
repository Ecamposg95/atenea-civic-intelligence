// frontend/src/modules/denue/DenuePage.tsx
import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PreviewBanner } from "@/components/modules/PreviewBanner";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Donut, type DonutDatum } from "@/components/charts/Donut";
import { StackedBars } from "@/components/charts/StackedBars";
import { DatabaseIcon, LayersIcon, MapIcon, AnalyticsIcon } from "@/components/ui/icons";
import { CHART_PALETTE, PANEL_HEIGHTS } from "@/constants/ui";
import { getUnidades } from "./client";
import type { DenueData, SampleUnit } from "./fixtures";

const nf = new Intl.NumberFormat("es-MX");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });

// DataTable column definitions — memoized at module level (static fixtures, no closure deps).
const UNIT_COLUMNS: Column<SampleUnit>[] = [
  {
    key: "name",
    header: "Unidad",
    render: (u) => u.name,
    sortValue: (u) => u.name,
    align: "left",
  },
  {
    key: "sector",
    header: "Sector",
    render: (u) => u.sector,
    sortValue: (u) => u.sector,
    align: "left",
  },
  {
    key: "municipio",
    header: "Municipio",
    render: (u) => u.municipio,
    sortValue: (u) => u.municipio,
    align: "left",
  },
  {
    key: "coords",
    header: "Coordenadas",
    render: (u) => (
      <span className="font-mono text-xs tabular-nums text-ink-faint">
        {u.lat.toFixed(4)}, {u.lng.toFixed(4)}
      </span>
    ),
    align: "right",
    hideOnCard: true,
  },
];

export function DenuePage() {
  const [data, setData] = useState<DenueData | null>(null);

  useEffect(() => {
    let active = true;
    void getUnidades().then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppLayout title="Unidades Económicas" crumb="Inteligencia Económica">
      <PageHeader
        eyebrow="Inteligencia Económica"
        title="Unidades"
        accent="Económicas"
        subtitle="Tejido económico por sector y tamaño de establecimiento como insumo para análisis territorial y de desarrollo."
        actions={<span className="pill border-line text-ink-muted">Fuente futura · INEGI DENUE</span>}
      />
      <PreviewBanner note="Datos de muestra · DENUE no está conectada (requiere token). Las cifras son ilustrativas." />

      {data ? <DenueBody data={data} /> : <LoadingState />}
    </AppLayout>
  );
}

// P-2: SkeletonCard replaces hand-rolled animate-pulse divs.
function LoadingState() {
  return (
    <div className="reveal grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} className="h-28" />
      ))}
    </div>
  );
}

function DenueBody({ data }: { data: DenueData }) {
  const { summary, sectors, sizeBands, units } = data;

  // P-5: Keep per-datum s.color (explicit fixture palette) — donut uses semantic colors.
  const sectorDonut: DonutDatum[] = sectors.map((s) => ({
    name: s.sector,
    value: s.count,
    color: s.color,
  }));

  const sizeData = useMemo(
    () => sizeBands.map((b) => ({ band: b.band, establecimientos: b.count })),
    [sizeBands],
  );

  return (
    // P-8: reveal wraps primary content.
    <div className="reveal">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Unidades económicas"
          value={nf.format(summary.total)}
          tone="accent"
          icon={<DatabaseIcon width={18} height={18} />}
          delay={0}
        />
        <MetricCard
          label="Sectores"
          value={String(summary.sectores)}
          tone="teal"
          icon={<LayersIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Municipios"
          value={nf.format(summary.municipios)}
          tone="accent"
          icon={<MapIcon width={18} height={18} />}
          delay={160}
        />
        <MetricCard
          label="Microempresas"
          value={pct(summary.microShare)}
          tone="warning"
          icon={<AnalyticsIcon width={18} height={18} />}
          delay={240}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
          <Card
            title="Unidades por sector"
            accentDot
            className="h-full"
            action={<span className="pill border-line text-ink-muted">muestra</span>}
          >
            <Donut data={sectorDonut} height={220} />
            <div className="mt-4 space-y-2">
              {sectors.map((s) => (
                <div key={s.sector} className="flex items-center justify-between gap-3 text-sm">
                  <span className="inline-flex items-center gap-2 text-ink-muted">
                    {/* P-5: s.color is an explicit per-datum fixture color — preserve. */}
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.sector}
                  </span>
                  <span className="font-mono tabular-nums text-ink">{compact.format(s.count)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "200ms" }}>
          <Card
            title="Establecimientos por tamaño (empleados)"
            accentDot
            className="h-full"
            action={<span className="pill border-line text-ink-muted">muestra</span>}
          >
            {/* P-6: PANEL_HEIGHTS.chartMd replaces hardcoded height={240}. */}
            {/* P-5: CHART_PALETTE[0] replaces hardcoded "#22d3ee" generic series color. */}
            <div className={PANEL_HEIGHTS.chartMd}>
              <StackedBars
                data={sizeData}
                xKey="band"
                series={[{ key: "establecimientos", color: CHART_PALETTE[0] }]}
                height="100%"
              />
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-3">
              <span className="eyebrow">Predominio micro (0–5)</span>
              <span className="font-mono text-lg tabular-nums text-state-warning">
                {pct(summary.microShare)}
              </span>
            </div>
          </Card>
        </div>
      </div>

      {/* P-4: DataTable replaces hand-rolled <table> in UnitsTable. */}
      <UnitsTable units={units} />
    </div>
  );
}

// P-4: DataTable + P-7: aria-label on search input.
function UnitsTable({ units }: { units: SampleUnit[] }) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return units.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.sector.toLowerCase().includes(q) ||
        u.municipio.toLowerCase().includes(q),
    );
  }, [units, query]);

  return (
    <div className="reveal mt-5" style={{ animationDelay: "280ms" }}>
      <Card
        title="Unidades geolocalizadas (muestra)"
        accentDot
        action={<span className="pill border-line text-ink-muted">{units.length} registros</span>}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {/* P-7: aria-label + focus-ring on search input. */}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por nombre, sector o municipio…"
            aria-label="Filtrar unidades económicas"
            className="field-input focus-ring max-w-sm"
          />
          <span className="pill border-line text-ink-muted">
            {rows.length} de {units.length}
          </span>
        </div>

        <DataTable<SampleUnit>
          columns={UNIT_COLUMNS}
          rows={rows}
          rowKey={(u) => u.id}
          defaultSortKey="name"
          defaultSortDir="asc"
          emptyMessage={`Sin coincidencias para "${query}".`}
          pageSize={12}
        />
      </Card>
    </div>
  );
}
