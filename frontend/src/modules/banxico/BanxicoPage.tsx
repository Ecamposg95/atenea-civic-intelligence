// frontend/src/modules/banxico/BanxicoPage.tsx
import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PreviewBanner } from "@/components/modules/PreviewBanner";
import { ParticipationChart } from "@/components/dashboards/ParticipationChart";
import { MetricCard } from "@/components/ui/MetricCard";
import { AnalyticsIcon } from "@/components/ui/icons";
import { SegmentedControl, type SegmentOption } from "@/components/ui/SegmentedControl";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { CHART_PALETTE, PANEL_HEIGHTS } from "@/constants/ui";
import { getSeries } from "./client";
import { SERIES_ORDER, type SerieDef, type SeriePoint } from "./fixtures";

// Semantically meaningful per-series colors (kept explicit — anti-pattern to
// swap these to generic palette since each color communicates economic tone).
const SERIES_COLORS: Record<string, string> = {
  SF43718: CHART_PALETTE[0], // USD/MXN exchange rate — cyan (neutral/info)
  SP1: CHART_PALETTE[3],     // Inflation — critical red (high = bad)
  SF61745: CHART_PALETTE[1], // Target rate — amber (policy/warning tone)
  SP68257: CHART_PALETTE[2], // UDIS value — teal (stable/tracking)
};

const TONES = ["accent", "teal", "warning", "accent"] as const;

const fmtValue = (s: SerieDef, v: number): string => {
  if (s.valueFormat === "percent") return `${(v * 100).toFixed(2)}%`;
  return `${v.toFixed(s.code === "SP68257" ? 3 : 2)}${s.suffix ?? ""}`;
};

const delta = (s: SerieDef): { text: string; up: boolean } | null => {
  const pts = s.points;
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1].value;
  const prev = pts[pts.length - 2].value;
  const diff = last - prev;
  if (diff === 0) return null;
  const text =
    s.valueFormat === "percent"
      ? `${diff > 0 ? "+" : ""}${(diff * 100).toFixed(2)} pp m/m`
      : `${diff > 0 ? "+" : ""}${diff.toFixed(3)} m/m`;
  return { text, up: diff > 0 };
};

// Extract numeric chart height from PANEL_HEIGHTS.chartMd token (e.g. "h-[260px]…")
const DETAIL_CHART_HEIGHT = (() => {
  const m = PANEL_HEIGHTS.chartMd.match(/h-\[(\d+)px\]/);
  return m ? parseInt(m[1], 10) : 260;
})();

// Memoized columns for the series data-point DataTable
const makeColumns = (s: SerieDef): Column<SeriePoint>[] => [
  {
    key: "period",
    header: "Período",
    sortValue: (r) => r.period,
    render: (r) => <span className="font-mono text-ink">{r.period}</span>,
  },
  {
    key: "value",
    header: s.unit,
    align: "right",
    sortValue: (r) => r.value,
    render: (r) => (
      <span className="font-mono tabular-nums text-ink">{fmtValue(s, r.value)}</span>
    ),
  },
];

export function BanxicoPage() {
  const [series, setSeries] = useState<SerieDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCode, setActiveCode] = useState<string>(SERIES_ORDER[0]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all(SERIES_ORDER.map((code) => getSeries(code))).then((res) => {
      if (active) {
        setSeries(res.filter((s): s is SerieDef => s !== null));
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const segmentOptions = useMemo<SegmentOption<string>[]>(
    () =>
      series.map((s) => ({
        id: s.code,
        label: s.label,
      })),
    [series],
  );

  const activeSeries = series.find((s) => s.code === activeCode) ?? series[0];

  // Reverse points so most-recent period appears first in the table
  const tableRows = useMemo<SeriePoint[]>(
    () => (activeSeries ? [...activeSeries.points].reverse() : []),
    [activeSeries],
  );

  const tableColumns = useMemo<Column<SeriePoint>[]>(
    () => (activeSeries ? makeColumns(activeSeries) : []),
    [activeSeries],
  );

  return (
    <AppLayout title="Indicadores Banxico" crumb="Macro-financiero">
      <PageHeader
        eyebrow="Macro-financiero"
        title="Indicadores"
        accent="Banxico"
        subtitle="Tipo de cambio, inflación, tasa objetivo y UDIS — contexto macro para la lectura territorial."
        actions={
          <span className="pill border-line text-ink-muted">
            Fuente futura · Banxico SIE
          </span>
        }
      />
      <PreviewBanner note="Datos de muestra (Banxico SIE) · Preview. Las series son ilustrativas y se conectarán a la fuente real." />

      {/* ── KPI overview grid ─────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      ) : (
        <div className="reveal grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {series.map((s, i) => {
            const latest = s.points[s.points.length - 1];
            const d = delta(s);
            return (
              <MetricCard
                key={s.code}
                label={s.label}
                value={latest ? fmtValue(s, latest.value) : "—"}
                tone={TONES[i % TONES.length]}
                delta={d?.up ? d.text : undefined}
                icon={<AnalyticsIcon width={18} height={18} />}
                delay={i * 80}
              />
            );
          })}
        </div>
      )}

      {/* ── Series detail section ──────────────────────────────────── */}
      {!loading && series.length > 0 && activeSeries && (
        <div className="reveal mt-7 space-y-4" style={{ animationDelay: "160ms" }}>
          {/* Segmented selector */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2
              id="series-detail-heading"
              className="font-display text-lg font-semibold text-ink"
            >
              Serie detallada
              <span className="ml-2 font-mono text-sm font-normal text-ink-faint">
                · muestra
              </span>
            </h2>
            <SegmentedControl
              options={segmentOptions}
              value={activeCode}
              onChange={setActiveCode}
              ariaLabel="Seleccionar indicador Banxico"
              size="sm"
            />
          </div>

          {/* Detail chart */}
          <div
            aria-labelledby="series-detail-heading"
            className="card-premium p-5"
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="font-display text-2xl font-bold tabular-nums text-ink">
                  {activeSeries.points.length > 0
                    ? fmtValue(
                        activeSeries,
                        activeSeries.points[activeSeries.points.length - 1].value,
                      )
                    : "—"}
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">{activeSeries.unit}</p>
              </div>
              <span className="pill border-line font-mono text-ink-muted">
                {activeSeries.code} · muestra
              </span>
            </div>

            <div className={PANEL_HEIGHTS.chartMd}>
              <ParticipationChart
                data={activeSeries.points}
                height={DETAIL_CHART_HEIGHT}
                valueFormat={activeSeries.valueFormat}
                seriesLabel={activeSeries.label}
                color={SERIES_COLORS[activeSeries.code]}
              />
            </div>

            <p className="mt-3 text-[11px] text-ink-faint">
              Fuente: Banxico SIE ({activeSeries.code}) · serie de muestra · datos
              ilustrativos
            </p>
          </div>

          {/* Data table — DataTable renders its own .card-premium, no extra wrapper */}
          <p className="text-sm font-medium text-ink">
            Valores mensuales ·{" "}
            <span className="font-mono text-ink-muted">{activeSeries.label}</span>
          </p>
          <DataTable
            columns={tableColumns}
            rows={tableRows}
            rowKey={(r) => r.period}
            pageSize={12}
            emptyMessage="Sin datos de muestra."
          />
        </div>
      )}

      {/* ── Mini overview charts (all 4 series) ───────────────────── */}
      {!loading && series.length > 0 && (
        <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {series.map((s, i) => (
            <div
              key={s.code}
              className="reveal card-premium p-5"
              style={{ animationDelay: `${240 + i * 80}ms` }}
            >
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-display text-base font-semibold text-ink">
                  {s.label}
                </span>
                <span className="pill border-line font-mono text-ink-muted text-[11px]">
                  {s.code} · muestra
                </span>
              </div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-display text-2xl font-bold tabular-nums text-ink">
                  {s.points.length > 0
                    ? fmtValue(s, s.points[s.points.length - 1].value)
                    : "—"}
                </span>
                <span className="text-xs text-ink-faint">{s.unit}</span>
              </div>
              <ParticipationChart
                data={s.points}
                height={180}
                valueFormat={s.valueFormat}
                seriesLabel={s.label}
                color={SERIES_COLORS[s.code]}
              />
              <p className="mt-3 text-[11px] text-ink-faint">
                Fuente: Banxico SIE ({s.code}) · serie de muestra
              </p>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
