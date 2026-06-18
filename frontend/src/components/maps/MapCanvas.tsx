import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
// maplibre-gl CSS is imported globally in src/index.css (avoids deferred chunk race).

import type { AreasResponse, AreaProperties } from "@/types/maps";
import { sampleMetric } from "@/types/maps";
import { useThemeStore } from "@/store/themeStore";

export interface WmsOverlay { id: string; tiles: string[]; visible: boolean; }
export type Basemap = "dark" | "satellite";

interface MapCanvasProps {
  areas: AreasResponse | null;
  showAreas: boolean;
  wmsLayers?: WmsOverlay[];
  choropleth: boolean;
  basemap: Basemap;
  fitKey?: number; // bump to trigger fit-to-bounds
  onSelect?: (props: (AreaProperties & { metric: number }) | null) => void;
}

const AREAS_SOURCE = "agora-areas";
const AREAS_FILL = "agora-areas-fill";
const AREAS_GLOW = "agora-areas-glow";
const AREAS_LINE = "agora-areas-line";

const RASTER: Record<Basemap, { tiles: string[]; attribution: string; paint: Record<string, number> }> = {
  // CARTO dark basemap: reliable CDN, CORS-enabled, already dark (no filter
  // needed) — far more robust than OSM and on-theme for the command center.
  dark: {
    tiles: [
      "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
      "https://d.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
    ],
    attribution: "© OpenStreetMap © CARTO",
    paint: {},
  },
  satellite: {
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "© Esri",
    paint: {},
  },
};

// CARTO positron (light) tile URLs — same subdomain pattern as dark_nolabels.
const LIGHT_TILES = [
  "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
  "https://d.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
];

const styleFor = (b: Basemap, tiles?: string[]): StyleSpecification => {
  const t = tiles ?? RASTER[b].tiles;
  return {
    version: 8,
    sources: { base: { type: "raster", tiles: t, tileSize: 256, attribution: RASTER[b].attribution } },
    layers: [{ id: "base", type: "raster", source: "base", paint: RASTER[b].paint as never }],
  };
};

const EMPTY_FC: AreasResponse = { type: "FeatureCollection", features: [] };

// Inject the sample metric into each feature property for data-driven styling.
function withMetric(fc: AreasResponse): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({
      ...f,
      properties: { ...f.properties, metric: sampleMetric(f.properties.id) },
    })),
  } as unknown as GeoJSON.FeatureCollection;
}

const FLAT_FILL: maplibregl.FillLayerSpecification["paint"] = { "fill-color": "#22d3ee", "fill-opacity": 0.16 };
// All-black big-screen ramp: deep cyan → bright cyan → amber at the peak.
const CHORO_FILL: maplibregl.FillLayerSpecification["paint"] = {
  "fill-opacity": 0.6,
  "fill-color": [
    "interpolate", ["linear"], ["get", "metric"],
    0.45, "#062a30",
    0.58, "#0e7490",
    0.70, "#22d3ee",
    0.82, "#67e8f9",
    0.90, "#f5b53d",
  ] as never,
};

// Recursively extend bounds with valid [lng, lat] positions from any GeoJSON
// coordinates nesting (Point/Line/Polygon/Multi*). Validates ranges so a
// malformed/misordered coordinate can never throw "Invalid LngLat".
function extendBounds(b: maplibregl.LngLatBounds, coords: unknown): boolean {
  if (!Array.isArray(coords)) return false;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    const lng = coords[0] as number;
    const lat = coords[1] as number;
    if (
      Number.isFinite(lng) &&
      Number.isFinite(lat) &&
      lng >= -180 &&
      lng <= 180 &&
      lat >= -90 &&
      lat <= 90
    ) {
      b.extend([lng, lat]);
      return true;
    }
    return false;
  }
  let any = false;
  for (const c of coords) {
    if (extendBounds(b, c)) any = true;
  }
  return any;
}

export function MapCanvas({ areas, showAreas, wmsLayers = [], choropleth, basemap, fitKey, onSelect }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const wmsAddedRef = useRef<Set<string>>(new Set());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // Follow the app theme for the standard (non-satellite) basemap.
  // Satellite is unchanged. The parent remounts MapCanvas via key when theme
  // changes so this snapshot value captured at init time is always correct.
  const theme = useThemeStore((s) => s.theme);
  const standardTiles = theme === "light" ? LIGHT_TILES : undefined; // undefined → use RASTER default (dark_nolabels)

  // Init once. Basemap change re-inits via key on the wrapper (see Task 20).
  // Theme change also re-inits via key (parent includes theme in the key).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(basemap, basemap === "dark" ? standardTiles : undefined),
      center: [-102.55, 23.63],
      zoom: 4.2,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("error", (e) => console.warn("[MapCanvas] map error:", e?.error?.message ?? e));
    mapRef.current = map;
    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    // Keep the canvas sized to its container. Without this the map can init at
    // 0px (flex/late layout) and render blank until something forces a resize.
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(containerRef.current);

    map.on("load", () => {
      readyRef.current = true;
      map.resize();
      map.addSource(AREAS_SOURCE, { type: "geojson", data: EMPTY_FC as never });
      map.addLayer({ id: AREAS_FILL, type: "fill", source: AREAS_SOURCE, paint: FLAT_FILL });
      // Soft teal glow underlay for the boundaries (blurred, low opacity).
      map.addLayer({ id: AREAS_GLOW, type: "line", source: AREAS_SOURCE, paint: { "line-color": "#22d3ee", "line-width": 3.5, "line-blur": 3, "line-opacity": 0.5 } });
      map.addLayer({ id: AREAS_LINE, type: "line", source: AREAS_SOURCE, paint: { "line-color": "#67e8f9", "line-width": 1.1, "line-opacity": 0.9 } });

      map.on("mousemove", AREAS_FILL, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (f && popupRef.current) {
          const p = f.properties as Record<string, unknown>;
          popupRef.current.setLngLat(e.lngLat).setHTML(`<div style="font:12px sans-serif;color:#06090c"><b>${p.name}</b></div>`).addTo(map);
        }
      });
      map.on("mouseleave", AREAS_FILL, () => { map.getCanvas().style.cursor = ""; popupRef.current?.remove(); });
      map.on("click", AREAS_FILL, (e) => {
        const f = e.features?.[0];
        if (f) {
          const p = f.properties as unknown as AreaProperties & { metric: number };
          onSelectRef.current?.({ ...p, metric: Number((p as { metric: number }).metric) });
        }
      });
    });

    return () => { ro.disconnect(); map.remove(); mapRef.current = null; readyRef.current = false; wmsAddedRef.current = new Set(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data + visibility + choropleth styling.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource(AREAS_SOURCE) as GeoJSONSource | undefined;
      if (src) src.setData(withMetric(areas ?? EMPTY_FC));
      const vis = showAreas ? "visible" : "none";
      if (map.getLayer(AREAS_FILL)) {
        map.setLayoutProperty(AREAS_FILL, "visibility", vis);
        const fill = (choropleth ? CHORO_FILL : FLAT_FILL) as NonNullable<
          maplibregl.FillLayerSpecification["paint"]
        >;
        map.setPaintProperty(AREAS_FILL, "fill-color", fill["fill-color"] as never);
        map.setPaintProperty(AREAS_FILL, "fill-opacity", fill["fill-opacity"] as never);
      }
      if (map.getLayer(AREAS_GLOW)) map.setLayoutProperty(AREAS_GLOW, "visibility", vis);
      if (map.getLayer(AREAS_LINE)) map.setLayoutProperty(AREAS_LINE, "visibility", vis);
    };
    if (readyRef.current) apply(); else map.once("load", apply);
  }, [areas, showAreas, choropleth]);

  // WMS overlays (unchanged behavior).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      for (const layer of wmsLayers) {
        const id = layer.id;
        if (!wmsAddedRef.current.has(id)) {
          if (!map.getSource(id)) map.addSource(id, { type: "raster", tiles: layer.tiles, tileSize: 256 });
          const beforeId = map.getLayer(AREAS_FILL) ? AREAS_FILL : undefined;
          map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0.85 } }, beforeId);
          wmsAddedRef.current.add(id);
        }
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", layer.visible ? "visible" : "none");
      }
    };
    if (readyRef.current) apply(); else map.once("load", apply);
  }, [wmsLayers]);

  // Fit to bounds of current areas when fitKey changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !areas || areas.features.length === 0) return;
    const b = new maplibregl.LngLatBounds();
    let any = false;
    for (const f of areas.features) {
      const g = f.geometry as GeoJSON.Geometry | null;
      if (!g || !("coordinates" in g)) continue;
      if (extendBounds(b, (g as { coordinates: unknown }).coordinates)) any = true;
    }
    if (any) {
      try {
        map.fitBounds(b, { padding: 40, maxZoom: 6, duration: 600 });
      } catch {
        /* bounds unusable — leave the current view */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-card border border-line-strong/60">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
