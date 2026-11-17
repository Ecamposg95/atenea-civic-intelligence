import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";

import {
  boundsOf,
  chipValue,
  colorFor,
  labelPoint,
  titleCase,
  type ColorMode,
  type SeccionMapa,
  type ThemeName,
} from "./mapaHelpers";

const SRC = "secciones";
const FILL = "sec-fill";
const LINE = "sec-line";
const FOCUS_LINE = "sec-focus";

const carto = (style: string) =>
  ["a", "b", "c", "d"].map((s) => `https://${s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png`);

const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a> · Secciones: INE';

const OUTLINE: Record<ThemeName, string> = { light: "#ffffff", dark: "#080e20" };
const FOCUS: Record<ThemeName, string> = { light: "#0c1630", dark: "#ecf1fc" };

function baseStyle(theme: ThemeName): StyleSpecification {
  const vis = (t: ThemeName) => (t === theme ? "visible" : "none") as "visible" | "none";
  return {
    version: 8,
    sources: {
      "base-light": { type: "raster", tiles: carto("light_nolabels"), tileSize: 256, attribution: ATTRIBUTION, maxzoom: 19 },
      "base-dark": { type: "raster", tiles: carto("dark_nolabels"), tileSize: 256, attribution: ATTRIBUTION, maxzoom: 19 },
      "labels-light": { type: "raster", tiles: carto("light_only_labels"), tileSize: 256, maxzoom: 19 },
      "labels-dark": { type: "raster", tiles: carto("dark_only_labels"), tileSize: 256, maxzoom: 19 },
    },
    layers: [
      { id: "base-light", type: "raster", source: "base-light", layout: { visibility: vis("light") } },
      { id: "base-dark", type: "raster", source: "base-dark", layout: { visibility: vis("dark") } },
    ],
  };
}

const LOCALE = {
  "AttributionControl.ToggleAttribution": "Mostrar u ocultar créditos del mapa",
  "AttributionControl.MapFeedback": "Comentarios del mapa",
  "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl + rueda para acercar el mapa",
  "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ + rueda para acercar el mapa",
  "CooperativeGesturesHandler.MobileHelpText": "Usa dos dedos para mover el mapa",
};

interface Entry {
  marker: maplibregl.Marker;
  el: HTMLButtonElement;
  chip: HTMLSpanElement;
  val: HTMLSpanElement;
  ping: HTMLSpanElement;
  id: number;
}

const CHIP_BASE =
  "sma-chip pointer-events-none flex flex-col items-center rounded-md border px-1.5 py-[3px] leading-none shadow-md transition-[background-color,color,transform] duration-150";
const CHIP_IDLE = "border-line-strong/70 bg-panel/95 text-ink";
const CHIP_SELECTED = "scale-110 border-transparent bg-ink text-bg";

export interface SmaMapProps {
  secciones: SeccionMapa[];
  mode: ColorMode;
  theme: ThemeName;
  selected: string | null;
  onSelect: (seccion: string | null) => void;
  /** Secciones that just received new captures (pulse once). */
  flashing: Set<string>;
  className?: string;
}

export function SmaMap({ secciones, mode, theme, selected, onSelect, flashing, className }: SmaMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const entries = useRef(new Map<string, Entry>());
  const hoverId = useRef<number | null>(null);
  const selectedId = useRef<number | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const bounds = useMemo(() => boundsOf(secciones), [secciones]);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const byName = useMemo(() => new Map(secciones.map((x) => [x.seccion, x])), [secciones]);
  // Geometry identity: markers are rebuilt only when the polygons change,
  // not on every 60 s refresh.
  const geomKey = useMemo(() => secciones.map((x) => x.seccion).join("|"), [secciones]);

  const padding = () => {
    const w = container.current?.clientWidth ?? 800;
    return w < 640 ? 18 : 48;
  };

  const fitAll = (animate = true) => {
    const map = mapRef.current;
    const b = boundsRef.current;
    if (!map || !b) return;
    map.fitBounds(b as LngLatBoundsLike, { padding: padding(), duration: animate ? 600 : 0, maxZoom: 16 });
  };

  // ── init ──
  useEffect(() => {
    if (!container.current) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: baseStyle(theme),
        center: [-99.54, 19.28],
        zoom: 12.5,
        attributionControl: { compact: true },
        cooperativeGestures: coarse,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        locale: LOCALE,
      });
    } catch {
      setFailed(true);
      return;
    }
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(SRC, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: FILL,
        type: "fill",
        source: SRC,
        paint: {
          "fill-color": ["get", "_color"],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 0.92,
            ["boolean", ["feature-state", "hover"], false], 0.86,
            0.72,
          ],
        },
      });
      map.addLayer({
        id: LINE,
        type: "line",
        source: SRC,
        paint: { "line-color": OUTLINE[theme], "line-width": 1.6 },
      });
      for (const t of ["light", "dark"] as const) {
        map.addLayer({
          id: `labels-${t}`,
          type: "raster",
          source: `labels-${t}`,
          layout: { visibility: t === theme ? "visible" : "none" },
          paint: { "raster-opacity": 0.8 },
        });
      }
      map.addLayer({
        id: FOCUS_LINE,
        type: "line",
        source: SRC,
        paint: {
          "line-color": FOCUS[theme],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 3.5,
            ["boolean", ["feature-state", "hover"], false], 2.25,
            0,
          ],
        },
      });

      map.on("mousemove", FILL, (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.id;
        if (typeof id !== "number") return;
        setHover(id);
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", FILL, () => {
        setHover(null);
        map.getCanvas().style.cursor = "";
      });
      map.on("click", (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: [FILL] })[0];
        const name = f?.properties?.seccion;
        onSelectRef.current(typeof name === "string" ? name : null);
      });
      setReady(true);
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);

    return () => {
      ro.disconnect();
      entries.current.forEach((e) => e.marker.remove());
      entries.current.clear();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Theme is applied by its own effect; the map is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setHover(id: number | null) {
    const map = mapRef.current;
    if (!map || hoverId.current === id) return;
    if (hoverId.current !== null) map.setFeatureState({ source: SRC, id: hoverId.current }, { hover: false });
    hoverId.current = id;
    if (id !== null) map.setFeatureState({ source: SRC, id }, { hover: true });
  }

  // ── theme ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const t of ["light", "dark"] as const) {
      const v = t === theme ? "visible" : "none";
      map.setLayoutProperty(`base-${t}`, "visibility", v);
      map.setLayoutProperty(`labels-${t}`, "visibility", v);
    }
    map.setPaintProperty(LINE, "line-color", OUTLINE[theme]);
    map.setPaintProperty(FOCUS_LINE, "line-color", FOCUS[theme]);
  }, [theme, ready]);

  // ── data + colors ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: secciones
        .filter((x) => x.geometry)
        .map((x) => ({
          type: "Feature",
          id: x.id,
          geometry: x.geometry!,
          properties: { seccion: x.seccion, _color: colorFor(mode, x, theme) },
        })),
    };
    (map.getSource(SRC) as GeoJSONSource | undefined)?.setData(fc);
    // setData drops feature-state on some versions; re-apply selection.
    if (selectedId.current !== null) map.setFeatureState({ source: SRC, id: selectedId.current }, { selected: true });
  }, [secciones, mode, theme, ready]);

  // Fit to the municipio when the geometry first arrives.
  useEffect(() => {
    if (ready && bounds) fitAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, geomKey]);

  // ── label markers (keyboard-reachable buttons) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    entries.current.forEach((e) => e.marker.remove());
    entries.current.clear();
    const ordered = [...secciones].sort(
      (a, b) => (Number.parseInt(a.seccion, 10) || 0) - (Number.parseInt(b.seccion, 10) || 0),
    );
    for (const x of ordered) {
      const at = labelPoint(x.geometry);
      if (!at) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className =
        "group grid cursor-pointer place-items-center rounded-lg outline-none before:absolute before:-inset-2 before:content-[''] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
      const ping = document.createElement("span");
      ping.setAttribute("aria-hidden", "true");
      ping.className = "pointer-events-none absolute inset-0 hidden rounded-md bg-accent/50 motion-safe:animate-ping";
      const chip = document.createElement("span");
      chip.className = `${CHIP_BASE} ${CHIP_IDLE}`;
      const num = document.createElement("span");
      num.className = "font-display text-[12px] font-bold tabular-nums tracking-tight";
      num.textContent = x.seccion.includes("/") ? x.seccion.replace(/\/(\d{2})(\d{2})$/, "/$2") : x.seccion;
      const val = document.createElement("span");
      val.className = "mt-[2px] hidden text-[10px] font-semibold tabular-nums opacity-80 sm:block";
      chip.append(num, val);
      el.append(ping, chip);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onSelectRef.current(x.seccion);
      });
      el.addEventListener("mouseenter", () => setHover(x.id));
      el.addEventListener("mouseleave", () => setHover(null));
      const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(at).addTo(map);
      entries.current.set(x.seccion, { marker, el, chip, val, ping, id: x.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geomKey, ready]);

  // Marker content: mode value, selected state, accessible name.
  useEffect(() => {
    entries.current.forEach((e, name) => {
      const x = byName.get(name);
      if (!x) return;
      const isSel = name === selected;
      e.val.textContent = chipValue(mode, x);
      e.chip.className = `${CHIP_BASE} ${isSel ? CHIP_SELECTED : CHIP_IDLE}`;
      e.el.setAttribute("aria-pressed", String(isSel));
      e.el.style.zIndex = isSel ? "2" : "";
      e.el.setAttribute(
        "aria-label",
        `Sección ${x.seccion}, ${titleCase(x.barrio)}, región ${x.region ?? "sin dato"}, prioridad ${x.prioridad ?? "sin dato"}. ` +
          `${x.avance.promovidos} de ${x.meta.promovidos} promovidos.`,
      );
    });
  }, [byName, mode, selected, geomKey]);

  // Pulse secciones with fresh captures.
  useEffect(() => {
    entries.current.forEach((e, name) => {
      e.ping.classList.toggle("hidden", !flashing.has(name));
    });
  }, [flashing, geomKey]);

  // Selected feature-state + bring into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (selectedId.current !== null) map.setFeatureState({ source: SRC, id: selectedId.current }, { selected: false });
    const x = selected ? byName.get(selected) : undefined;
    selectedId.current = x ? x.id : null;
    if (!x) return;
    map.setFeatureState({ source: SRC, id: x.id }, { selected: true });
    const at = labelPoint(x.geometry);
    if (at && !map.getBounds().contains(at)) map.easeTo({ center: at, duration: 500 });
  }, [selected, byName, ready]);

  const zoomBtn =
    "focus-ring grid h-11 w-11 place-items-center text-ink transition-colors hover:bg-panel-hover";

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      <div
        ref={container}
        className="absolute inset-0"
        role="region"
        aria-label="Mapa de secciones de San Mateo Atenco. Usa los botones de sección para seleccionarlas con el teclado."
      />
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-panel p-6 text-center text-sm text-ink-muted">
          Tu navegador no puede mostrar el mapa (WebGL desactivado). La tabla de abajo tiene todos los datos.
        </div>
      )}
      <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-xl border border-line bg-panel/95 shadow-panel backdrop-blur">
        <button type="button" className={zoomBtn} aria-label="Acercar" onClick={() => mapRef.current?.zoomIn()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" className={`${zoomBtn} border-t border-line`} aria-label="Alejar" onClick={() => mapRef.current?.zoomOut()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <button type="button" className={`${zoomBtn} border-t border-line`} aria-label="Ver todo el municipio" title="Ver todo el municipio" onClick={() => fitAll(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </button>
      </div>
    </div>
  );
}
