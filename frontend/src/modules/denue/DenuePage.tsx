// frontend/src/modules/denue/DenuePage.tsx
import { useMemo, useState } from "react";

import { getUnits } from "@/api/denue";
import type { DenueUnit } from "@/api/denue";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { DataState } from "@/components/ui/DataState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { StackedBars } from "@/components/charts/StackedBars";
import { DatabaseIcon, LayersIcon, MapIcon } from "@/components/ui/icons";
import { CHART_PALETTE, PANEL_HEIGHTS } from "@/constants/ui";
import { useAsync } from "@/hooks/useAsync";

const nf = new Intl.NumberFormat("es-MX");
const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });

// Column definitions — memoized at module level.
const UNIT_COLUMNS: Column<DenueUnit>[] = [
  {
    key: "nombre",
    header: "Unidad",
    render: (u) => u.nombre,
    sortValue: (u) => u.nombre,
    align: "left",
  },
  {
    key: "actividad",
    header: "Actividad",
    render: (u) => u.actividad ?? "—",
    sortValue: (u) => u.actividad ?? "",
    align: "left",
  },
  {
    key: "territory_code",
    header: "Clave territorio",
    render: (u) => u.territory_code,
    sortValue: (u) => u.territory_code,
    align: "left",
  },
  {
    key: "estrato",
    header: "Estrato",
    render: (u) => (
      <span className="text-ink-faint">{u.estrato ?? "—"}</span>
    ),
    sortValue: (u) => u.estrato ?? "",
    align: "left",
    hideOnCard: true,
  },
  {
    key: "coords",
    header: "Coordenadas",
    render: (u) =>
      u.lat != null && u.lon != null ? (
        <span className="font-mono text-xs tabular-nums text-ink-faint">
          {u.lat.toFixed(4)}, {u.lon.toFixed(4)}
        </span>
      ) : (
        <span className="text-ink-faint">—</span>
      ),
    align: "right",
    hideOnCard: true,
  },
];

export function DenuePage() {
  const units = useAsync(() => getUnits(), []);
  const { loading, error, data, reload } = units;

  const isEmpty = !loading && !error && (data ?? []).length === 0;

  // Summary stats derived from real data.
  const summary = useMemo(() => {
    const rows = data ?? [];
    const actividadSet = new Set(rows.map((u) => u.actividad ?? "Sin clasificar"));
    const territorioSet = new Set(rows.map((u) => u.territory_code));
    return {
      total: rows.length,
      actividades: actividadSet.size,
      municipios: territorioSet.size,
    };
  }, [data]);

  // Top actividades by count for chart.
  const actividadData = useMemo(() => {
    const rows = data ?? [];
    const map = new Map<string, number>();
    for (const u of rows) {
      const k = u.actividad ?? "Sin clasificar";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([actividad, count]) => ({ actividad, count }));
  }, [data]);

  return (
    <AppLayout title="Unidades Económicas" crumb="Inteligencia Económica">
      <PageHeader
        eyebrow="Inteligencia Económica"
        title="Unidades"
        accent="Económicas"
        subtitle="Tejido económico por actividad y territorio derivado de las unidades ingestadas vía DENUE."
        actions={<span className="pill border-line text-ink-muted">INEGI DENUE</span>}
      />

      <DataState
        loading={loading}
        error={error}
        isEmpty={isEmpty}
        onRetry={reload}
        emptyMessage="Ingesta pendiente — sin unidades económicas disponibles."
        skeleton={
          <div className="reveal grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} className="h-28" />
            ))}
          </div>
        }
      >
        <div className="reveal">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label="Unidades económicas"
              value={nf.format(summary.total)}
              tone="accent"
              icon={<DatabaseIcon width={18} height={18} />}
              delay={0}
            />
            <MetricCard
              label="Actividades"
              value={String(summary.actividades)}
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
          </div>

          {actividadData.length > 0 && (
            <div className="reveal mt-5" style={{ animationDelay: "120ms" }}>
              <Card
                title="Top actividades económicas"
                accentDot
                action={
                  <span className="pill border-line text-ink-muted">
                    {compact.format(summary.total)} unidades · datos reales
                  </span>
                }
              >
                <div className={PANEL_HEIGHTS.chartMd}>
                  <StackedBars
                    data={actividadData}
                    xKey="actividad"
                    series={[{ key: "count", color: CHART_PALETTE[0] }]}
                    height="100%"
                  />
                </div>
              </Card>
            </div>
          )}

          <UnitsTable units={data ?? []} />
        </div>
      </DataState>
    </AppLayout>
  );
}

function UnitsTable({ units }: { units: DenueUnit[] }) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return units.filter(
      (u) =>
        u.nombre.toLowerCase().includes(q) ||
        (u.actividad ?? "").toLowerCase().includes(q) ||
        u.territory_code.toLowerCase().includes(q),
    );
  }, [units, query]);

  return (
    <div className="reveal mt-5" style={{ animationDelay: "200ms" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-gradient shadow-glow" aria-hidden="true" />
          Unidades geolocalizadas
          <span className="pill border-line text-ink-muted">datos reales</span>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por nombre, actividad o clave de territorio…"
            aria-label="Filtrar unidades económicas"
            className="field-input focus-ring max-w-sm"
          />
          <span className="pill border-line text-ink-muted">
            {rows.length} de {units.length} registros
          </span>
        </div>
      </div>

      <DataTable<DenueUnit>
        columns={UNIT_COLUMNS}
        rows={rows}
        rowKey={(u) => u.clave}
        defaultSortKey="nombre"
        defaultSortDir="asc"
        emptyMessage={query ? `Sin coincidencias para "${query}".` : "Sin registros."}
        pageSize={12}
      />
    </div>
  );
}
