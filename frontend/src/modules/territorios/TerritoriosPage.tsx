import { useEffect, useMemo, useRef, useState } from "react";

import { getAreas } from "@/api/maps";
import { StackedBars } from "@/components/charts/StackedBars";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { MapCanvas } from "@/components/maps/MapCanvas";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { LayersIcon, MapIcon, SearchIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import type { AreaFeature, AreaProperties, AreasResponse } from "@/types/maps";
import { sampleMetric } from "@/types/maps";

import { groupMunicipiosByState } from "./territoriosData";

type SelectedArea = AreaProperties & { metric: number };
type SortKey = "name" | "metric" | "count";

const EMPTY_FC: AreasResponse = { type: "FeatureCollection", features: [] };

const pct = (m: number) => `${(Math.max(0, Math.min(1, m)) * 100).toFixed(1)}%`;

export function TerritoriosPage() {
  // Drill state: null = Nacional (states), otherwise a state name (GADM NAME_1,
  // i.e. the `code` carried by every municipio feature).
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [selected, setSelected] = useState<SelectedArea | null>(null);
  const [fitKey, setFitKey] = useState(0);

  // Fetch BOTH layers. States = national choropleth; municipios = drill source.
  const states = useAsync(() => getAreas("state"), []);
  const municipios = useAsync(() => getAreas("municipality"), []);

  const loading = states.loading || municipios.loading;
  const error = states.error ?? municipios.error;
  const reload = () => {
    states.reload();
    municipios.reload();
  };

  const stateFC = states.data ?? EMPTY_FC;
  const muniFeatures = useMemo(
    () => municipios.data?.features ?? [],
    [municipios.data],
  );

  // National roll-up: distinct state names (municipio `code`) + municipio counts.
  // This is self-consistent (we never join to the 32-state name layer).
  const stateGroups = useMemo(
    () => groupMunicipiosByState(muniFeatures),
    [muniFeatures],
  );

  // Municipios belonging to the selected state.
  const stateMunicipios = useMemo<AreaFeature[]>(() => {
    if (!selectedState) return [];
    return muniFeatures.filter((f) => f.properties.code === selectedState);
  }, [muniFeatures, selectedState]);

  // FeatureCollection driving the map for the current scope.
  const scopeFC = useMemo<AreasResponse>(() => {
    if (selectedState) {
      return { type: "FeatureCollection", features: stateMunicipios };
    }
    return stateFC;
  }, [selectedState, stateMunicipios, stateFC]);

  // Reframe + clear the active selection whenever the scope changes.
  useEffect(() => {
    setSelected(null);
    setSearch("");
    setFitKey((k) => k + 1);
  }, [selectedState]);

  // Also reframe once the scope's first data actually lands.
  const scopeReady = `${selectedState ?? "nacional"}:${scopeFC.features.length}`;
  const lastReady = useRef(scopeReady);
  useEffect(() => {
    if (scopeFC.features.length > 0 && lastReady.current !== scopeReady) {
      lastReady.current = scopeReady;
      setFitKey((k) => k + 1);
    }
  }, [scopeReady, scopeFC.features.length]);

  const q = search.trim().toLowerCase();

  // ---- National list: states (distinct codes) ----
  const filteredStates = useMemo(() => {
    const rows = q
      ? stateGroups.filter((g) => g.name.toLowerCase().includes(q))
      : stateGroups.slice();
    rows.sort((a, b) => {
      if (sortKey === "count") return b.count - a.count;
      if (sortKey === "metric") return b.metric - a.metric;
      return a.name.localeCompare(b.name, "es");
    });
    return rows;
  }, [stateGroups, q, sortKey]);

  // ---- State list: that state's municipios ----
  const filteredMunicipios = useMemo(() => {
    const rows = q
      ? stateMunicipios.filter((f) =>
          f.properties.name.toLowerCase().includes(q),
        )
      : stateMunicipios.slice();
    rows.sort((a, b) => {
      if (sortKey === "metric") {
        return sampleMetric(b.properties.id) - sampleMetric(a.properties.id);
      }
      return a.properties.name.localeCompare(b.properties.name, "es");
    });
    return rows;
  }, [stateMunicipios, q, sortKey]);

  const selectMunicipio = (props: AreaProperties) => {
    setSelected({ ...props, metric: sampleMetric(props.id) });
    setFitKey((k) => k + 1);
  };

  const isEmpty =
    !loading &&
    !error &&
    (selectedState
      ? stateMunicipios.length === 0
      : stateGroups.length === 0);

  // Top-5 states by municipio count — real distribution for the bar chart.
  const topStates = useMemo(
    () =>
      stateGroups
        .slice()
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((g) => ({ name: g.name, count: g.count })),
    [stateGroups],
  );

  return (
    <AppLayout title="Territorios & Secciones" crumb="Inteligencia Electoral">
      <PageHeader
        eyebrow="Inteligencia Electoral"
        title="Territorios"
        accent="& Secciones"
        subtitle="Drill-down geográfico sobre nuestra propia cartografía: del nacional a cada estado y sus municipios, en una sola vista de mando."
        actions={
          <>
            <div className="card-premium px-4 py-3">
              <div className="eyebrow mb-1.5">Áreas en vista</div>
              <div className="flex items-center gap-2">
                <LayersIcon className="h-5 w-5 text-accent" />
                <AnimatedNumber
                  value={scopeFC.features.length}
                  className="font-display text-2xl font-bold tabular-nums text-ink"
                />
              </div>
            </div>
            <div className="card-premium px-4 py-3">
              <div className="eyebrow mb-1.5">Ámbito actual</div>
              <div className="font-display text-base font-semibold text-teal">
                {selectedState ?? "Nacional"}
              </div>
            </div>
          </>
        }
      >
        {/* Breadcrumb hierarchy */}
        <nav
          aria-label="Jerarquía territorial"
          className="inline-flex items-center gap-1 rounded-xl border border-line bg-panel/60 p-1 font-mono text-sm backdrop-blur"
        >
          <button
            type="button"
            onClick={() => setSelectedState(null)}
            aria-current={selectedState ? undefined : "page"}
            className={`rounded-lg px-3 py-1.5 transition-all ${
              selectedState
                ? "text-ink-muted hover:text-ink hover:bg-panel-hover/60"
                : "bg-accent/15 text-accent shadow-glow-accent"
            }`}
          >
            Nacional
          </button>
          {selectedState && (
            <>
              <span aria-hidden="true" className="px-0.5 text-ink-faint">
                /
              </span>
              <span
                aria-current="page"
                className="rounded-lg bg-state-warning/15 px-3 py-1.5 text-state-warning"
              >
                {selectedState}
              </span>
            </>
          )}
        </nav>
      </PageHeader>

      {/* Real-count stats */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Estados"
          value="—"
          countTo={stateGroups.length}
          icon={<MapIcon width={18} height={18} />}
          tone="accent"
          delay={80}
        />
        <MetricCard
          label="Municipios (nacional)"
          value="—"
          countTo={muniFeatures.length}
          icon={<LayersIcon className="h-[18px] w-[18px]" />}
          tone="teal"
          delay={140}
        />
        <MetricCard
          label={
            selectedState
              ? `Municipios · ${selectedState}`
              : "Municipios del estado"
          }
          value={selectedState ? "—" : "0"}
          countTo={selectedState ? stateMunicipios.length : 0}
          icon={<MapIcon width={18} height={18} />}
          tone="warning"
          delay={200}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* LEFT — scoped map */}
        <div
          className="reveal hud-corners relative h-[460px] overflow-hidden rounded-card border border-line-strong bg-panel shadow-panel"
          style={{ animationDelay: "120ms" }}
        >
          <DataState
            loading={loading}
            error={error}
            isEmpty={isEmpty}
            onRetry={reload}
            emptyMessage="Sin cartografía para este ámbito."
            skeleton={
              <div className="h-full w-full animate-pulse bg-panel-hover" />
            }
          >
            <div className="relative h-full w-full">
              <MapCanvas
                areas={scopeFC}
                showAreas
                choropleth
                basemap="dark"
                fitKey={fitKey}
                onSelect={(p) => {
                  // Map clicks at national level drill into the state; at the
                  // state level they pick a municipio detail.
                  if (!p) return setSelected(null);
                  if (!selectedState) setSelectedState(p.code ?? null);
                  else setSelected(p);
                }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-[5] rounded-card"
                style={{
                  boxShadow:
                    "inset 0 0 120px 16px rgba(2, 8, 20, 0.55), inset 0 0 0 1px rgba(127, 240, 224, 0.06)",
                }}
              />
              <div className="pointer-events-none absolute bottom-3 left-3 z-10">
                <span className="pill border-line bg-bg-sunken/80 text-[10px] text-ink-muted backdrop-blur">
                  Choropleth: métrica (muestra)
                </span>
              </div>
            </div>
          </DataState>
        </div>

        {/* RIGHT — drill list */}
        <div
          className="reveal card-premium flex h-[460px] flex-col p-0"
          style={{ animationDelay: "180ms" }}
        >
          <div className="space-y-2 border-b border-line p-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  selectedState ? "Buscar municipio…" : "Buscar estado…"
                }
                className="field-input !py-2 pl-9"
              />
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-ink-faint">Ordenar:</span>
              <SortPill
                active={sortKey === "name"}
                onClick={() => setSortKey("name")}
              >
                Nombre
              </SortPill>
              {!selectedState && (
                <SortPill
                  active={sortKey === "count"}
                  onClick={() => setSortKey("count")}
                >
                  Municipios
                </SortPill>
              )}
              <SortPill
                active={sortKey === "metric"}
                onClick={() => setSortKey("metric")}
              >
                Métrica
              </SortPill>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <DataState
              loading={loading}
              error={error}
              isEmpty={isEmpty}
              onRetry={reload}
              emptyMessage="Sin cartografía para este ámbito."
              skeleton={
                <div className="space-y-2 p-1">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 animate-pulse rounded-lg bg-panel-hover"
                    />
                  ))}
                </div>
              }
            >
              {selectedState ? (
                // ---- Level 2: municipios of the selected state ----
                filteredMunicipios.length === 0 ? (
                  <Empty query={search} />
                ) : (
                  <ul className="space-y-1">
                    {filteredMunicipios.map((f) => {
                      const p = f.properties;
                      const m = sampleMetric(p.id);
                      const active = selected?.id === p.id;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => selectMunicipio(p)}
                            aria-pressed={active}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-all ${
                              active
                                ? "border-accent/40 bg-accent/10 shadow-glow-accent"
                                : "border-transparent hover:border-line hover:bg-panel-hover/60"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-ink">
                                {p.name}
                              </span>
                              <span className="mt-0.5 block font-mono text-[11px] text-ink-faint">
                                {p.code}
                              </span>
                            </span>
                            <span className="shrink-0 font-mono text-xs text-teal">
                              {pct(m)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : // ---- Level 1: states present ----
              filteredStates.length === 0 ? (
                <Empty query={search} />
              ) : (
                <ul className="space-y-1">
                  {filteredStates.map((g) => (
                    <li key={g.name}>
                      <button
                        type="button"
                        onClick={() => setSelectedState(g.name)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-all hover:border-line hover:bg-panel-hover/60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">
                            {g.name}
                          </span>
                          <span className="mt-0.5 block font-mono text-[11px] text-ink-faint">
                            {g.count} municipios
                          </span>
                        </span>
                        <span className="pill shrink-0 border-accent/30 text-[10px] text-accent">
                          Abrir →
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </DataState>
          </div>
        </div>
      </div>

      {/* Distribution: top states by municipio count (real) */}
      {!selectedState && topStates.length > 0 && (
        <Card
          title="Estados con más municipios"
          accentDot
          className="reveal mt-4"
        >
          <p className="mb-3 -mt-2 text-xs text-ink-muted">
            Conteo real de municipios por estado (top 8) — derivado de{" "}
            <span className="font-mono text-ink">
              <AnimatedNumber
                value={muniFeatures.length}
                className="tabular-nums"
              />
            </span>{" "}
            municipios reales.
          </p>
          <StackedBars
            data={topStates}
            xKey="name"
            height={180}
            series={[{ key: "count", color: "#22d3ee" }]}
          />
        </Card>
      )}

      {/* Selected municipio detail */}
      {selected && (
        <div className="reveal card-premium hud-corners mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="metric-chip h-11 w-11 text-accent shadow-glow-accent">
              <MapIcon width={20} height={20} />
            </span>
            <div className="min-w-0">
              <div className="eyebrow text-accent">Municipio</div>
              <div className="truncate font-display text-lg font-semibold leading-tight text-ink">
                {selected.name}
              </div>
              <span className="mt-1 inline-flex rounded-md border border-line bg-bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
                {selected.code ?? "—"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <div>
              <div className="eyebrow mb-0.5">Estado</div>
              <div className="font-medium text-ink">{selected.code ?? "—"}</div>
            </div>
            <div>
              <div className="eyebrow mb-0.5">Nivel</div>
              <div className="font-medium text-ink">Municipio</div>
            </div>
          </div>

          <div className="w-full max-w-xs">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs text-ink-muted">Métrica (muestra)</span>
              <span className="font-mono text-sm font-semibold text-ink">
                {pct(selected.metric)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-pill bg-bg-sunken ring-1 ring-inset ring-white/5">
              <div
                className="animate-fade-in h-full rounded-pill bg-accent-gradient shadow-glow-accent"
                style={{
                  width: `${Math.max(0, Math.min(1, selected.metric)) * 100}%`,
                }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelected(null)}
            className="btn-ghost shrink-0"
          >
            Limpiar selección
          </button>
        </div>
      )}
    </AppLayout>
  );
}

function SortPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-2 py-0.5 transition-colors ${
        active
          ? "bg-accent/15 text-accent"
          : "text-ink-muted hover:text-ink hover:bg-panel-hover/60"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ query }: { query: string }) {
  return (
    <div className="grid h-full place-items-center px-4 text-center text-sm text-ink-faint">
      Nada coincide con “{query}”.
    </div>
  );
}
