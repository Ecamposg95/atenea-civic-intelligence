import { useState } from "react";

import { getWbIndicator } from "@/api/intel";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { ParticipationChart } from "@/components/dashboards/ParticipationChart";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { CHART_PALETTE, PANEL_HEIGHTS } from "@/constants/ui";
import { useAsync } from "@/hooks/useAsync";

const CODES = [
  { code: "NY.GDP.MKTP.CD",    label: "PIB (USD)" },
  { code: "NY.GDP.PCAP.CD",    label: "PIB per cápita (USD)" },
  { code: "SP.POP.TOTL",       label: "Población" },
  { code: "SP.URB.TOTL.IN.ZS", label: "Población urbana (%)" },
  { code: "SP.DYN.LE00.IN",    label: "Esperanza de vida (años)" },
  { code: "FP.CPI.TOTL.ZG",   label: "Inflación (%)" },
  { code: "SL.UEM.TOTL.ZS",   label: "Desempleo (%)" },
  { code: "IT.NET.USER.ZS",   label: "Usuarios de internet (%)" },
] as const;

type IndicatorCode = (typeof CODES)[number]["code"];

const compact = new Intl.NumberFormat("es-MX", { notation: "compact" });
const pct    = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const precise = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });

interface SeriesRow {
  year: number;
  value: number;
}

const SERIES_COLUMNS: Column<SeriesRow>[] = [
  {
    key: "year",
    header: "Año",
    sortValue: (r) => r.year,
    render: (r) => (
      <span className="font-mono text-ink-muted">{r.year}</span>
    ),
    align: "left",
  },
  {
    key: "value",
    header: "Valor",
    sortValue: (r) => r.value,
    render: (r) => (
      <span className="font-mono tabular-nums text-ink">
        {precise.format(r.value)}
      </span>
    ),
    align: "right",
  },
];

function IndicatorCard({
  code,
  label,
  colorIndex,
}: {
  code: string;
  label: string;
  colorIndex: number;
}) {
  const { data, loading, error, reload } = useAsync(
    () => getWbIndicator(code),
    [code],
  );
  const points = data?.points ?? [];
  const series = points.map((p) => ({
    period: String(p.year),
    value: p.value,
  }));
  const tableRows: SeriesRow[] = points.map((p) => ({
    year: p.year,
    value: p.value,
  }));

  // Latest vs previous: percentage change between the two most recent points.
  const latest   = points.at(-1);
  const previous = points.at(-2);
  const deltaPct =
    latest && previous && previous.value !== 0
      ? ((latest.value - previous.value) / Math.abs(previous.value)) * 100
      : null;

  const seriesColor = CHART_PALETTE[colorIndex % CHART_PALETTE.length];

  return (
    <Card
      title={label}
      accentDot
      className="card-premium hud-corners h-full"
      action={
        data?.latest && (
          <span className="pill border-line font-mono text-ink-muted">
            {data.latest.year}
          </span>
        )
      }
    >
      <DataState
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={!!data && series.length === 0}
        emptyMessage="Sin serie disponible para este indicador."
        skeleton={
          <SkeletonCard lines={4} className="border-0 p-0 shadow-none" />
        }
      >
        {data && (
          <>
            {/* Hero metric + delta badge */}
            <div className="mb-3 flex items-end gap-2">
              <span className="font-display text-3xl font-bold tabular-nums tracking-tight text-ink">
                {data.latest ? compact.format(data.latest.value) : "—"}
              </span>
              {deltaPct !== null && (
                <span
                  className={`pill mb-1 font-mono text-[11px] ${
                    deltaPct >= 0
                      ? "border-emerald-500/30 text-emerald-400"
                      : "border-rose-500/30 text-rose-400"
                  }`}
                  title={`Variación vs ${previous?.year}`}
                >
                  {deltaPct >= 0 ? "▲" : "▼"} {pct.format(deltaPct)}%
                </span>
              )}
            </div>

            {/* Area chart using shared palette + PANEL_HEIGHTS */}
            <div className={PANEL_HEIGHTS.chartMd}>
              <ParticipationChart
                data={series}
                height={undefined}
                valueFormat="number"
                seriesLabel={label}
                color={seriesColor}
              />
            </div>

            {/* Series table — year desc by default */}
            {tableRows.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Serie histórica
                </p>
                <DataTable<SeriesRow>
                  columns={SERIES_COLUMNS}
                  rows={tableRows}
                  rowKey={(r) => String(r.year)}
                  pageSize={8}
                  defaultSortKey="year"
                  defaultSortDir="desc"
                  emptyMessage="Sin datos."
                />
              </div>
            )}

            <p className="mt-3 text-[11px] text-ink-faint">
              Fuente: {data.source}
            </p>
          </>
        )}
      </DataState>
    </Card>
  );
}

export function WorldBankPage() {
  const [filter, setFilter] = useState<IndicatorCode | "all">("all");

  const visibleCodes =
    filter === "all"
      ? CODES
      : CODES.filter((c) => c.code === filter);

  return (
    <AppLayout title="Indicadores Nacionales" crumb="World Bank · Macro">
      <PageHeader
        eyebrow="Contexto macro"
        title="Indicadores"
        accent="Nacionales"
        subtitle="Series macroeconómicas de México (Banco Mundial). Datos reales."
        actions={
          <label className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted sr-only">
              Indicador
            </span>
            <select
              id="wb-indicator-select"
              aria-label="Filtrar indicador"
              value={filter}
              onChange={(e) => setFilter(e.target.value as IndicatorCode | "all")}
              className="focus-ring rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-ink transition-colors hover:bg-panel-hover"
            >
              <option value="all">Todos los indicadores</option>
              {CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {/* Stats row: indicator count */}
        <div className="flex items-center gap-3">
          <span className="pill border-line font-mono text-xs text-ink-muted">
            {visibleCodes.length} indicador{visibleCodes.length !== 1 ? "es" : ""}
          </span>
          <span className="text-xs text-ink-faint">Fuente: World Bank Open Data</span>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {visibleCodes.map((c, i) => (
          <div
            key={c.code}
            className="reveal"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <IndicatorCard
              {...c}
              colorIndex={CODES.findIndex((x) => x.code === c.code)}
            />
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
