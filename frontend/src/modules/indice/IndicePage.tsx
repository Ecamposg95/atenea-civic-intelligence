// frontend/src/modules/indice/IndicePage.tsx
import { useMemo, useState } from "react";

import { getAreas } from "@/api/maps";
import { Donut } from "@/components/charts/Donut";
import type { DonutDatum } from "@/components/charts/Donut";
import { RadialGauge } from "@/components/charts/RadialGauge";
import { StackedBars } from "@/components/charts/StackedBars";
import type { StackSeries } from "@/components/charts/StackedBars";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PreviewBanner } from "@/components/modules/PreviewBanner";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import type { Column } from "@/components/ui/DataTable";
import { DataTable } from "@/components/ui/DataTable";
import { MetricCard } from "@/components/ui/MetricCard";
import { SkeletonCard, SkeletonRows } from "@/components/ui/SkeletonCard";
import { AnalyticsIcon, ArrowUpIcon, SearchIcon } from "@/components/ui/icons";
import { PANEL_HEIGHTS } from "@/constants/ui";
import { useAsync } from "@/hooks/useAsync";
import {
  DIMENSIONS,
  nationalAverage,
  scoreArea,
  type ScoredArea,
} from "./score";

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

/** Tier color for the inline index bar (sample-only thresholds). */
function tierColor(v: number): string {
  if (v >= 0.7) return "#22d3ee";
  if (v >= 0.5) return "#2dd4bf";
  return "#f5b53d";
}

/** Trim long entity names so stacked-bar axis labels stay readable. */
function shortName(name: string): string {
  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}

export function IndicePage() {
  const { data, loading, error, reload } = useAsync(
    () => getAreas("state"),
    [],
  );

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scored = useMemo<ScoredArea[]>(() => {
    const features = data?.features ?? [];
    return features.map((f) => scoreArea(f.properties));
  }, [data]);

  const rankedDesc = useMemo<ScoredArea[]>(
    () => [...scored].sort((a, b) => b.index - a.index),
    [scored],
  );

  const top = rankedDesc[0] ?? null;
  const bottom = rankedDesc[rankedDesc.length - 1] ?? null;
  const avg = useMemo(() => nationalAverage(scored), [scored]);

  // The selected territory for the sub-dimension breakdown; default to #1.
  const selected = useMemo<ScoredArea | null>(() => {
    if (selectedId) {
      return scored.find((s) => s.id === selectedId) ?? top;
    }
    return top;
  }, [scored, selectedId, top]);

  // Filtered rows passed to DataTable (DataTable owns sort internally).
  const rows = useMemo<ScoredArea[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scored;
    return scored.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.code ?? "").toLowerCase().includes(q),
    );
  }, [scored, search]);

  // Rank lookup (by composite index, independent of current table sort).
  const rankById = useMemo<Map<string, number>>(() => {
    const m = new Map<string, number>();
    rankedDesc.forEach((s, i) => m.set(s.id, i + 1));
    return m;
  }, [rankedDesc]);

  // DataTable columns — memoized so the reference is stable across renders.
  const columns = useMemo<Column<ScoredArea>[]>(
    () => [
      {
        key: "rank",
        header: "#",
        align: "right",
        hideOnCard: true,
        render: (s) => (
          <span className="font-mono text-xs text-ink-faint">
            {rankById.get(s.id)}
          </span>
        ),
      },
      {
        key: "name",
        header: "Entidad",
        sortValue: (s) => s.name,
        render: (s) => (
          <span>
            <span className="block font-medium text-ink">{s.name}</span>
            {s.code && (
              <span className="font-mono text-[11px] text-ink-faint">
                {s.code}
              </span>
            )}
          </span>
        ),
      },
      {
        key: "index",
        header: "Índice (muestra)",
        align: "right",
        sortValue: (s) => s.index,
        render: (s) => (
          <span className="font-mono font-semibold text-ink">{pct(s.index)}</span>
        ),
      },
      {
        key: "bar",
        header: "Composición",
        hideOnCard: true,
        render: (s) => (
          <div className="h-2 w-full min-w-[80px] overflow-hidden rounded-pill bg-bg-sunken ring-1 ring-inset ring-white/5">
            <div
              className="h-full rounded-pill transition-all"
              style={{
                width: `${s.index * 100}%`,
                background: tierColor(s.index),
              }}
            />
          </div>
        ),
      },
    ],
    [rankById],
  );

  const donutData = useMemo<DonutDatum[]>(() => {
    if (!selected) return [];
    return DIMENSIONS.map((d) => ({
      name: d.label,
      value: Math.round(selected.dimensions[d.key] * 100),
      color: d.color,
    }));
  }, [selected]);

  // Stacked bars: top territories' sub-dimensions (sample, weighted contribution).
  const stackData = useMemo<Record<string, number | string>[]>(() => {
    return rankedDesc.slice(0, 8).map((s) => {
      const row: Record<string, number | string> = { name: shortName(s.name) };
      for (const d of DIMENSIONS) {
        row[d.key] = Math.round(s.dimensions[d.key] * d.weight * 100);
      }
      return row;
    });
  }, [rankedDesc]);

  const stackSeries: StackSeries[] = DIMENSIONS.map((d) => ({
    key: d.key,
    color: d.color,
  }));

  const isEmpty = !loading && !error && scored.length === 0;

  return (
    <AppLayout title="Índice Cívico-Territorial" crumb="Gobernanza">
      <PageHeader
        eyebrow="Síntesis"
        title="Índice"
        accent="Cívico-Territorial"
        subtitle="Síntesis que superpone señales cívicas y socioeconómicas por territorio: combina nuestra cartografía real con dimensiones ilustrativas para un solo puntaje comparable."
        actions={
          <div className="card-premium hud-corners flex items-center gap-4 px-5 py-4">
            <RadialGauge value={avg} label="Promedio nal." size={104} />
            <div>
              <div className="eyebrow mb-1">Índice promedio</div>
              <div className="font-display text-2xl font-bold tabular-nums text-ink">
                {pct(avg)}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-faint">
                {scored.length} entidades · muestra
              </div>
            </div>
          </div>
        }
      />

      <PreviewBanner note="Índice compuesto de muestra — combina capas reales (territorio) con dimensiones ilustrativas." />

      <DataState
        loading={loading}
        error={error}
        isEmpty={isEmpty}
        onRetry={reload}
        emptyMessage="Sin cartografía estatal todavía — ingesta pendiente."
        skeleton={
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SkeletonCard className="h-32" />
              <SkeletonCard className="h-32" />
              <SkeletonCard className="h-32" />
            </div>
            <SkeletonRows rows={8} />
          </div>
        }
      >
        <div className="reveal space-y-4">
          {/* Highlights */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label="Mayor índice (muestra)"
              value={top ? `${pct(top.index)}` : "—"}
              delta={top ? top.name : undefined}
              icon={<ArrowUpIcon />}
              tone="accent"
              delay={60}
            />
            <MetricCard
              label="Menor índice (muestra)"
              value={bottom ? `${pct(bottom.index)}` : "—"}
              delta={bottom ? bottom.name : undefined}
              icon={<AnalyticsIcon />}
              tone="warning"
              delay={120}
            />
            <MetricCard
              label="Promedio nacional (muestra)"
              value={pct(avg)}
              delta={`${scored.length} entidades`}
              icon={<AnalyticsIcon />}
              tone="teal"
              delay={180}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
            {/* LEFT — ranked, searchable, sortable table via DataTable */}
            <div className="space-y-3">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar entidad por nombre o clave…"
                  aria-label="Buscar entidad"
                  className="field-input !py-2 pl-9"
                />
              </div>
              <DataTable<ScoredArea>
                columns={columns}
                rows={rows}
                rowKey={(s) => s.id}
                pageSize={20}
                defaultSortKey="index"
                defaultSortDir="desc"
                emptyMessage={
                  search
                    ? `Ninguna entidad coincide con "${search}".`
                    : "Sin datos."
                }
                onRowClick={(s) => setSelectedId(s.id)}
              />
            </div>

            {/* RIGHT — selected territory breakdown */}
            <div className="space-y-4">
              <Card
                title="Composición por dimensión"
                accentDot
                action={
                  selected && (
                    <span className="pill border-line text-[10px] text-ink-muted">
                      {selected.name}
                    </span>
                  )
                }
              >
                {selected ? (
                  <>
                    <div className="relative">
                      <Donut data={donutData} height={188} />
                      <div className="pointer-events-none absolute inset-0 grid place-items-center">
                        <div className="text-center">
                          <div className="font-display text-xl font-bold tabular-nums text-ink">
                            {pct(selected.index)}
                          </div>
                          <div className="eyebrow text-ink-faint">índice</div>
                        </div>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {DIMENSIONS.map((d) => (
                        <li
                          key={d.key}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="flex items-center gap-2 text-ink-muted">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: d.color }}
                            />
                            {d.label}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs text-ink-faint">
                              ·{(d.weight * 100).toFixed(0)}%
                            </span>
                            <span className="font-mono font-semibold text-ink">
                              {pct(selected.dimensions[d.key])}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                      Entidad real · puntajes y pesos de muestra. Selecciona otra
                      fila para recomponer el desglose.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-ink-faint">Sin selección.</p>
                )}
              </Card>
            </div>
          </div>

          {/* Stacked contribution of sub-dimensions across the top territories */}
          <Card
            title="Contribución de dimensiones · top entidades (muestra)"
            accentDot
            action={
              <span className="text-[11px] text-ink-faint">
                aporte ponderado al índice
              </span>
            }
          >
            <div className={`w-full ${PANEL_HEIGHTS.chartMd}`}>
              <StackedBars
                data={stackData}
                series={stackSeries}
                xKey="name"
                height="100%"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {DIMENSIONS.map((d) => (
                <span
                  key={d.key}
                  className="flex items-center gap-2 text-xs text-ink-muted"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: d.color }}
                  />
                  {d.label}
                  <span className="font-mono text-ink-faint">
                    ({(d.weight * 100).toFixed(0)}%)
                  </span>
                </span>
              ))}
            </div>
          </Card>
        </div>
      </DataState>
    </AppLayout>
  );
}
