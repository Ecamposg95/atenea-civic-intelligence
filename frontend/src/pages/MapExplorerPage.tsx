import { useEffect, useMemo, useState } from "react";

import { getAreas, getLayers } from "@/api/maps";
import { getWmsLayers } from "@/api/sources";
import { AppLayout } from "@/components/layout/AppLayout";
import { AreaDetailPanel } from "@/components/maps/AreaDetailPanel";
import { LayerPanel } from "@/components/maps/LayerPanel";
import { Legend } from "@/components/maps/Legend";
import { MapCanvas, type Basemap, type WmsOverlay } from "@/components/maps/MapCanvas";
import type { AreaProperties, AreasResponse, MapLayer } from "@/types/maps";

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
    Promise.allSettled([getLayers(), getAreas(), getWmsLayers()])
      .then(([layersRes, areasRes, wmsRes]) => {
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

        setAreas(
          areasRes.status === "fulfilled"
            ? areasRes.value
            : { type: "FeatureCollection", features: [] },
        );
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
      <div className="mb-6">
        <div className="eyebrow">Geospatial intelligence</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
          Map Explorer
        </h1>
        <p className="mt-1 max-w-xl text-sm text-ink-muted">
          Explora distritos, secciones y superficies analíticas. Activa capas
          gobernadas (incluyendo WMS del SIGE/INE) sobre el basemap institucional.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
          {error}
        </div>
      )}

      <div className="grid h-[calc(100vh-15rem)] grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <LayerPanel layers={layers} onToggle={toggle} loading={loading} />
        <div className="flex h-full flex-col">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="rounded-lg border border-line bg-bg-sunken px-2 py-1.5 text-sm text-ink"
            >
              <option value="">Todos los niveles</option>
              <option value="state">Entidad</option>
              <option value="district">Distrito</option>
              <option value="municipality">Municipio</option>
            </select>
            <select
              value={basemap}
              onChange={(e) => setBasemap(e.target.value as Basemap)}
              className="rounded-lg border border-line bg-bg-sunken px-2 py-1.5 text-sm text-ink"
            >
              <option value="dark">Mapa oscuro</option>
              <option value="satellite">Satélite</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={choropleth}
                onChange={(e) => setChoropleth(e.target.checked)}
              />{" "}
              Coropleta
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar área…"
              className="rounded-lg border border-line bg-bg-sunken px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint"
            />
            <button
              onClick={() => setFitKey((k) => k + 1)}
              className="pill border-line text-ink-muted"
            >
              Encadrar
            </button>
          </div>
          <div className="relative flex-1">
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
            {choropleth && <Legend label="Participación" />}
            <AreaDetailPanel area={selected} onClose={() => setSelected(null)} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
