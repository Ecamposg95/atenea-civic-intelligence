import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { AreasResponse, AreaProperties } from "@/types/maps";
import { sampleMetric } from "@/types/maps";

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
const AREAS_LINE = "agora-areas-line";

const RASTER: Record<Basemap, { tiles: string[]; attribution: string; paint: Record<string, number> }> = {
  dark: { tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], attribution: "© OpenStreetMap", paint: { "raster-saturation": -0.85, "raster-brightness-max": 0.85 } },
  satellite: { tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], attribution: "© Esri", paint: { "raster-saturation": 0 } },
};

const styleFor = (b: Basemap): StyleSpecification => ({
  version: 8,
  sources: { base: { type: "raster", tiles: RASTER[b].tiles, tileSize: 256, attribution: RASTER[b].attribution } },
  layers: [{ id: "base", type: "raster", source: "base", paint: RASTER[b].paint as never }],
});

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

const FLAT_FILL: maplibregl.FillLayerSpecification["paint"] = { "fill-color": "#4f9cff", "fill-opacity": 0.18 };
const CHORO_FILL: maplibregl.FillLayerSpecification["paint"] = {
  "fill-opacity": 0.6,
  "fill-color": [
    "interpolate", ["linear"], ["get", "metric"],
    0.45, "#0d3b66", 0.68, "#4f9cff", 0.9, "#dcedff",
  ] as never,
};

export function MapCanvas({ areas, showAreas, wmsLayers = [], choropleth, basemap, fitKey, onSelect }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const wmsAddedRef = useRef<Set<string>>(new Set());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // Init once. Basemap change re-inits via key on the wrapper (see Task 20).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(basemap),
      center: [-102.55, 23.63],
      zoom: 4.2,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    map.on("load", () => {
      readyRef.current = true;
      map.addSource(AREAS_SOURCE, { type: "geojson", data: EMPTY_FC as never });
      map.addLayer({ id: AREAS_FILL, type: "fill", source: AREAS_SOURCE, paint: FLAT_FILL });
      map.addLayer({ id: AREAS_LINE, type: "line", source: AREAS_SOURCE, paint: { "line-color": "#2dd4bf", "line-width": 1.2 } });

      map.on("mousemove", AREAS_FILL, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (f && popupRef.current) {
          const p = f.properties as Record<string, unknown>;
          popupRef.current.setLngLat(e.lngLat).setHTML(`<div style="font:12px sans-serif;color:#0d1422"><b>${p.name}</b></div>`).addTo(map);
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

    return () => { map.remove(); mapRef.current = null; readyRef.current = false; wmsAddedRef.current = new Set(); };
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
      if (!g) continue;
      const coords = (g as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates as number[][][] | number[][][][];
      const flat = JSON.stringify(coords).match(/-?\d+\.\d+/g)?.map(Number) ?? [];
      for (let i = 0; i + 1 < flat.length; i += 2) { b.extend([flat[i], flat[i + 1]]); any = true; }
    }
    if (any) map.fitBounds(b, { padding: 40, maxZoom: 6, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-card border border-line">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
