import { useEffect, useMemo, useRef, useState } from "react";

import { getAreas } from "@/api/maps";
import { StackedBars } from "@/components/charts/StackedBars";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { MapCanvas } from "@/components/maps/MapCanvas";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card } from "@/components/ui/Card";
import type { Column } from "@/components/ui/DataTable";
import { DataTable } from "@/components/ui/DataTable";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { LayersIcon, MapIcon, SearchIcon } from "@/components/ui/icons";
import { CHART_PALETTE, PANEL_HEIGHTS } from "@/constants/ui";
import { useAsync } from "@/hooks/useAsync";
import type { AreaFeature, AreaProperties, AreasResponse } from "@/types/maps";
import { sampleMetric } from "@/types/maps";

import { groupMunicipiosByState } from "./territoriosData";
import type { StateGroup } from "./territoriosData";

type SelectedArea = AreaProperties & { metric: number };

/** Sort options shown in the SegmentedControl for each drill level. */
type NacionalSort = "name" | "count" | "metric";
type EstadoSort = "name" | "metric";

const EMPTY_FC: AreasResponse = { type: "FeatureCollection", features: [] };

const pct = (m: number) => `${(Math.max(0, Math.min(1, m)) * 100).toFixed(1)}%`;

// ---- Column definitions (memoised outside component to be stable) ----

const STATE_COLUMNS: Column<StateGroup>[] = [
  {
    key: "name",
    header: "Estado",
    sortValue: (r) => r.name,
    render: (r) => (
      <span className="font-medium text-ink">{r.name}</span>
    ),
  },
  {
    key: "count",
    header: "Municipios",
    align: "right",
    sortValue: (r) => r.count,
    render: (r) => (
      <span className="font-mono tabular-nums text-teal">{r.count}</span>
    ),
  },
  {
    key: "metric",
    header: "Métrica",
    align: "right",
    hideOnCard: true,
    sortValue: (r) => r.metric,
    render: (r) => (
      <span className="font-mono tabular-nums text-ink-muted">{pct(r.metric)}</span>
    ),
  },
];

function makeMuniColumns(): Column<AreaFeature>[] {
  return [
    {
      key: "name",
      header: "Municipio",
      sortValue: (f) => f.properties.name,
      render: (f) => (
        <span className="font-medium text-ink">{f.properties.name}</span>
      ),
    },
    {
      key: "code",
      header: "Clave",
      align: "center",
      hideOnCard: true,
      render: (f) => (
        <span className="font-mono text-[11px] text-ink-faint">{f.properties.code ?? "—"}</span>
      ),
    },
    {
      key: "metric",
      header: "Métrica",
      align: "right",
      sortValue: (f) => sampleMetric(f.properties.id),
      render: (f) => (
        <span className="font-mono tabular-nums text-teal">{pct(sampleMetric(f.properties.id))}</span>
      ),
    },
  ];
}

const NACIONAL_SORT_OPTIONS: { id: NacionalSort; label: string }[] = [
  { id: "name", label: "Nombre" },
  { id: "count", label: "Municipios" },
  { id: "metric", label: "Métrica" },
];

const ESTADO_SORT_OPTIONS: { id: EstadoSort; label: string }[] = [
  { id: "name", label: "Nombre" },
  { id: "metric", label: "Métrica" },
];

// ---- Main component ----

export function TerritoriosPage() {
  // Drill state: null = Nacional (states), otherwise a state name (GADM NAME_1,
  // i.e. the `code` carried by every municipio feature).
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [nacSort, setNacSort] = useState<NacionalSort>("name");
  const [estSort, setEstSort] = useState<EstadoSort>("name");
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
      if (nacSort === "count") return b.count - a.count;
      if (nacSort === "metric") return b.metric - a.metric;
      return a.name.localeCompare(b.name, "es");
    });
    return rows;
  }, [stateGroups, q, nacSort]);

  // ---- State list: that state's municipios ----
  const filteredMunicipios = useMemo(() => {
    const rows = q
      ? stateMunicipios.filter((f) =>
          f.properties.name.toLowerCase().includes(q),
        )
      : stateMunicipios.slice();
    rows.sort((a, b) => {
      if (estSort === "metric") {
        return sampleMetric(b.properties.id) - sampleMetric(a.properties.id);
      }
      return a.properties.name.localeCompare(b.properties.name, "es");
    });
    return rows;
  }, [stateMunicipios, q, estSort]);

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

  // Top-8 states by municipio count — real distribution for the bar chart.
  const topStates = useMemo(
    () =>
      stateGroups
        .slice()
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((g) => ({ name: g.name, count: g.count })),
    [stateGroups],
  );

  // Stable muni columns — recreated only when selectMunicipio identity changes
  // (it doesn't — it's stable). onRowClick is passed separately to DataTable.
  const muniColumns = useMemo(() => makeMuniColumns(), []);

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
        {/* Breadcrumb hierarchy — accessible with focus-ring */}
        <nav
          aria-label="Jerarquía territorial"
          className="inline-flex items-center gap-1 rounded-xl border border-line bg-panel/60 p-1 font-mono text-sm backdrop-blur"
        >
          <button
            type="button"
            onClick={() => setSelectedState(null)}
            aria-current={selectedState ? undefined : "page"}
            className={`focus-ring rounded-lg px-3 py-1.5 transition-all ${
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

      {/* Real-count stats — error display deferred to the drill-list DataState */}
      <DataState
        loading={loading}
        error={null}
        skeleton={
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-card bg-panel-hover" />
            ))}
          </div>
        }
      >
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
      </DataState>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
        {/* LEFT — scoped map */}
        <div
          className={`reveal hud-corners relative overflow-hidden rounded-card border border-line-strong bg-panel shadow-panel ${PANEL_HEIGHTS.mapTall}`}
          style={{ animationDelay: "120ms" }}
        >
          <DataState
            loading={loading}
            error={null}
            isEmpty={isEmpty}
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
                  else selectMunicipio(p);
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
          className={`reveal card-premium flex flex-col p-0 ${PANEL_HEIGHTS.mapTall}`}
          style={{ animationDelay: "180ms" }}
        >
          {/* Search + sort controls */}
          <div className="space-y-2 border-b border-line p-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  selectedState ? "Buscar municipio…" : "Buscar estado…"
                }
                aria-label={selectedState ? "Buscar municipio" : "Buscar estado"}
                className="field-input !py-2 pl-9"
              />
            </div>
            {/* SegmentedControl replaces ad-hoc SortPill row */}
            {selectedState ? (
              <SegmentedControl
                options={ESTADO_SORT_OPTIONS}
                value={estSort}
                onChange={setEstSort}
                ariaLabel="Ordenar municipios"
                size="sm"
              />
            ) : (
              <SegmentedControl
                options={NACIONAL_SORT_OPTIONS}
                value={nacSort}
                onChange={setNacSort}
                ariaLabel="Ordenar estados"
                size="sm"
              />
            )}
          </div>

          {/* Scrollable drill list — DataTable handles pagination + sort glyphs */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DataState
              loading={loading}
              error={error}
              isEmpty={isEmpty}
              onRetry={reload}
              emptyMessage="Sin cartografía para este ámbito."
              skeleton={<div className="p-3"><SkeletonRows rows={8} /></div>}
            >
              {selectedState ? (
                // ---- Level 2: municipios of the selected state ----
                <DataTable<AreaFeature>
                  columns={muniColumns}
                  rows={filteredMunicipios}
                  rowKey={(f) => f.properties.id}
                  pageSize={15}
                  defaultSortKey="name"
                  defaultSortDir="asc"
                  emptyMessage={
                    q ? `Nada coincide con "${q}".` : "Sin municipios para este estado."
                  }
                  onRowClick={(f) => selectMunicipio(f.properties)}
                />
              ) : (
                // ---- Level 1: states present ----
                <DataTable<StateGroup>
                  columns={STATE_COLUMNS}
                  rows={filteredStates}
                  rowKey={(g) => g.name}
                  pageSize={20}
                  defaultSortKey="name"
                  defaultSortDir="asc"
                  emptyMessage={
                    q ? `Nada coincide con "${q}".` : "Sin estados disponibles."
                  }
                  onRowClick={(g) => setSelectedState(g.name)}
                />
              )}
            </DataState>
          </div>

          {/* Distrito / Sección levels — honest "Ingesta pendiente" empty state */}
          {selectedState && (
            <div className="border-t border-line px-4 py-2.5">
              <p className="text-[11px] text-ink-faint">
                <span className="font-semibold text-ink-muted">Distritos · Secciones:</span>{" "}
                Ingesta pendiente — cartografía a nivel distrito/sección no disponible aún.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Distribution: top states by municipio count (real) */}
      {!selectedState && (
        <DataState
          loading={loading}
          error={null}
          isEmpty={topStates.length === 0}
          emptyMessage="Sin datos de distribución disponibles."
          skeleton={
            <div className="mt-4 h-48 animate-pulse rounded-card bg-panel-hover" />
          }
        >
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
              series={[{ key: "count", color: CHART_PALETTE[0] }]}
            />
          </Card>
        </DataState>
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
            aria-label="Limpiar selección de municipio"
            className="btn-ghost shrink-0 focus-ring"
          >
            Limpiar selección
          </button>
        </div>
      )}
    </AppLayout>
  );
}
