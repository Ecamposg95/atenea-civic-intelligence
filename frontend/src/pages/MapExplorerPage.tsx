import { useEffect, useMemo, useState } from "react";

import { getAreas, getLayers } from "@/api/maps";
import { getWmsLayers } from "@/api/sources";
import { AppLayout } from "@/components/layout/AppLayout";
import { AreaDetailPanel } from "@/components/maps/AreaDetailPanel";
import { LayerPanel } from "@/components/maps/LayerPanel";
import { Legend } from "@/components/maps/Legend";
import { MapCanvas, type Basemap, type WmsOverlay } from "@/components/maps/MapCanvas";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { MapIcon, SearchIcon } from "@/components/ui/icons";
import type { AreaProperties, AreasResponse, MapLayer } from "@/types/maps";

const LEVEL_LABEL: Record<string, string> = {
  "": "Todos los niveles",
  state: "Entidad",
  district: "Distrito",
  municipality: "Municipio",
};

export function MapExplorerPage() {
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const [areas, setAreas] = useState<AreasResponse | null>(null);
  // Tile templates for WMS layers, keyed by their synthetic "wms:<id>" id.
  const [wmsTiles, setWmsTiles] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Map robustness controls.
  const [level, setLevel] = useState<string>(""); // "" = all
  const [choropleth, setChoropleth] = useState(true);
  const [basemap, setBasemap] = useState<Basemap>("dark");
  const [selected, setSelected] = useState<(AreaProperties & { metric: number }) | null>(null);
  const [search, setSearch] = useState("");
  const [fitKey, setFitKey] = useState(0);

  useEffect(() => {
    Promise.allSettled([getLayers(), getWmsLayers()])
      .then(([layersRes, wmsRes]) => {
        const base: MapLayer[] =
          layersRes.status === "fulfilled" ? layersRes.value.layers : [];
        if (layersRes.status === "rejected") {
          setError(layersRes.reason?.message ?? "Failed to load layers");
        }

        // Merge INE SIGE WMS layers as toggleable territorial raster layers.
        const tiles: Record<string, string[]> = {};
        const wmsLayers: MapLayer[] =
          wmsRes.status === "fulfilled"
            ? wmsRes.value.layers.map((w) => {
                const id = `wms:${w.id}`;
                tiles[id] = w.tiles;
                return {
                  id,
                  name: `${w.name} (INE)`,
                  category: "territorial",
                  geometry_type: "raster",
                  srid: w.srid,
                  visible: false,
                  description: `WMS · ${w.level}`,
                } as MapLayer;
              })
            : [];
        setWmsTiles(tiles);
        setLayers([...base, ...wmsLayers]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Re-fetch areas whenever the selected level changes.
  useEffect(() => {
    getAreas(level || undefined)
      .then(setAreas)
      .catch(() => setAreas({ type: "FeatureCollection", features: [] }));
  }, [level]);

  const toggle = (id: string) =>
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    );

  // Areas overlay follows the electoral districts catalog layer (default on).
  const showAreas = useMemo(() => {
    const districts = layers.find((l) => l.id === "electoral_districts");
    return districts ? districts.visible : true;
  }, [layers]);

  const wmsOverlays: WmsOverlay[] = useMemo(
    () =>
      layers
        .filter((l) => l.id.startsWith("wms:") && wmsTiles[l.id])
        .map((l) => ({ id: l.id, tiles: wmsTiles[l.id], visible: l.visible })),
    [layers, wmsTiles],
  );

  // Real-data stats derived from the loaded areas (no fabricated values).
  const stats = useMemo(() => {
    const features = areas?.features ?? [];
    const levels = new Set(features.map((f) => f.properties.level));
    return {
      total: features.length,
      levels: levels.size,
    };
  }, [areas]);

  // Client-side name search filter over the loaded areas.
  const filteredAreas = useMemo(() => {
    if (!areas) return areas;
    if (!search.trim()) return areas;
    const q = search.toLowerCase();
    return {
      ...areas,
      features: areas.features.filter((f) =>
        f.properties.name.toLowerCase().includes(q),
      ),
    };
  }, [areas, search]);

  return (
    <AppLayout title="Map Explorer" crumb="Electoral & Territorial Layers">
      {/* Hero header */}
      <div className="relative mb-6 overflow-hidden">
        <div className="aura -left-16 -top-24 h-72 w-72" aria-hidden="true" />
        <div className="aura aura-teal right-0 -top-16 h-64 w-64" aria-hidden="true" />
        <div className="reveal relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="eyebrow">Geospatial intelligence</div>
            <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-5xl">
              <span className="text-gradient">Explorador Territorial</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
              Explora distritos, secciones y superficies analíticas. Activa capas
              gobernadas (incluyendo WMS del SIGE/INE) sobre el basemap
              institucional.
            </p>
          </div>

          {/* Stats strip — real data from the loaded areas */}
          <div className="reveal flex shrink-0 flex-wrap items-stretch gap-3" style={{ animationDelay: "80ms" }}>
            <div className="card-premium px-4 py-3">
              <div className="eyebrow mb-1.5">Áreas</div>
              <div className="flex items-center gap-2">
                <MapIcon className="h-5 w-5 text-accent" />
                <AnimatedNumber
                  value={stats.total}
                  className="font-display text-2xl font-bold tabular-nums text-ink"
                />
              </div>
            </div>
            <div className="card-premium px-4 py-3">
              <div className="eyebrow mb-1.5">Niveles</div>
              <AnimatedNumber
                value={stats.levels}
                className="font-display text-2xl font-bold tabular-nums text-ink"
              />
            </div>
            <div className="card-premium px-4 py-3">
              <div className="eyebrow mb-1.5">Vista actual</div>
              <div className="font-display text-base font-semibold text-teal">
                {LEVEL_LABEL[level] ?? "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="reveal mb-4 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
          {error}
        </div>
      )}

      <div className="grid h-[calc(100vh-15rem)] grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <LayerPanel layers={layers} onToggle={toggle} loading={loading} />
        <div className="reveal flex h-full flex-col" style={{ animationDelay: "120ms" }}>
          {/* Premium control bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/60 p-2 backdrop-blur">
            {/* Level select */}
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="rounded-lg border border-line bg-bg-sunken px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/40"
            >
              <option value="">Todos los niveles</option>
              <option value="state">Entidad</option>
              <option value="district">Distrito</option>
              <option value="municipality">Municipio</option>
            </select>

            {/* Basemap segmented control */}
            <div className="flex items-center gap-1 rounded-lg border border-line bg-bg-sunken p-0.5">
              {(["dark", "satellite"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBasemap(b)}
                  aria-pressed={basemap === b}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${
                    basemap === b
                      ? "bg-accent/15 text-accent shadow-glow-accent"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {b === "dark" ? "Oscuro" : "Satélite"}
                </button>
              ))}
            </div>

            {/* Choropleth toggle */}
            <button
              type="button"
              onClick={() => setChoropleth((c) => !c)}
              aria-pressed={choropleth}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                choropleth
                  ? "border-teal/40 bg-teal/10 text-teal shadow-glow-teal"
                  : "border-line bg-bg-sunken text-ink-muted hover:text-ink"
              }`}
            >
              Coropleta
            </button>

            {/* Search */}
            <div className="relative min-w-[10rem] flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar área…"
                className="field-input !py-2 pl-9"
              />
            </div>

            {/* Fit-bounds */}
            <button
              onClick={() => setFitKey((k) => k + 1)}
              className="btn-ghost !px-3 !py-2"
            >
              <MapIcon className="h-4 w-4" />
              Encadrar
            </button>
          </div>

          {/* Map frame with inner vignette + accent hairline (static — no hover lift) */}
          <div className="relative flex-1 overflow-hidden rounded-card border border-line-strong bg-panel p-0 shadow-panel">
            <div className="relative h-full w-full">
              <MapCanvas
                key={basemap}
                areas={filteredAreas}
                showAreas={showAreas}
                wmsLayers={wmsOverlays}
                choropleth={choropleth}
                basemap={basemap}
                fitKey={fitKey}
                onSelect={setSelected}
              />
              {/* inner vignette */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-[5] rounded-card"
                style={{
                  boxShadow:
                    "inset 0 0 120px 16px rgba(2, 8, 20, 0.55), inset 0 0 0 1px rgba(127, 240, 224, 0.06)",
                }}
              />
              {choropleth && <Legend label="Participación" />}
              <AreaDetailPanel area={selected} onClose={() => setSelected(null)} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
