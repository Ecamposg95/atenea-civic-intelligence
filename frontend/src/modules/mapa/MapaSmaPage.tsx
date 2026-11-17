import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { SegmentedControl, type SegmentOption } from "@/components/ui/SegmentedControl";
import { SMA_CODE } from "@/api/mapa";
import { useThemeStore } from "@/store/themeStore";

import { KpiStrip } from "./KpiStrip";
import { MapLegend } from "./MapLegend";
import { SeccionDetalle } from "./SeccionDetalle";
import { SeccionesRegionTable } from "./SeccionesRegionTable";
import { SmaMap } from "./SmaMap";
import {
  changedSecciones,
  computeTotales,
  formatHace,
  groupByRegion,
  legendFor,
  normalizeCollection,
  type ColorMode,
  type SeccionMapa,
} from "./mapaHelpers";
import { useMapaSma, useMediaQuery, useNow } from "./useMapaSma";

const MODES: SegmentOption<ColorMode>[] = [
  { id: "region", label: "Región" },
  { id: "prioridad", label: "Prioridad" },
  { id: "avance", label: "Avance vs meta" },
  { id: "resultado", label: "Resultado 2024" },
];

const MODE_KEY = "agora.mapa.modo";

function readMode(): ColorMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v && MODES.some((m) => m.id === v)) return v as ColorMode;
  } catch {
    /* ignore */
  }
  return "avance";
}

function LiveStatus({
  updatedAt,
  refreshing,
  error,
  onRefresh,
}: {
  updatedAt: number | null;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const now = useNow(15_000);
  const stale = Boolean(error);
  return (
    <div className="flex items-center gap-2">
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
          {!stale && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-state-ok opacity-60 motion-safe:animate-ping" />
          )}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${stale ? "bg-state-warning" : "bg-state-ok"}`} />
        </span>
        {stale ? (
          <span>
            Sin conexión. Último dato {updatedAt ? formatHace(now - updatedAt) : "pendiente"}
          </span>
        ) : (
          <span>
            En vivo, actualizado {updatedAt ? formatHace(now - updatedAt) : "ahora"}
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="btn-ghost min-h-[44px] min-w-[44px]"
        aria-label="Actualizar datos del mapa"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={refreshing ? "motion-safe:animate-spin" : ""}
          aria-hidden="true"
        >
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
        </svg>
        <span className="hidden sm:inline">{refreshing ? "Actualizando" : "Actualizar"}</span>
      </button>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando mapa">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-card bg-panel-hover" />
        ))}
      </div>
      <div className="h-[58vh] min-h-[340px] animate-pulse rounded-card bg-panel-hover" />
    </div>
  );
}

export function MapaSmaPage() {
  const { data, loading, refreshing, error, updatedAt, refresh } = useMapaSma(SMA_CODE);
  const theme = useThemeStore((s) => s.theme);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [mode, setModeState] = useState<ColorMode>(readMode);
  const [selected, setSelected] = useState<string | null>(null);
  const [flashing, setFlashing] = useState<Set<string>>(() => new Set());
  const [announce, setAnnounce] = useState("");
  const mapWrap = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const prev = useRef<SeccionMapa[] | null>(null);
  const titleId = useId();

  const setMode = (m: ColorMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const secciones = useMemo(() => normalizeCollection(data), [data]);
  const totales = useMemo(() => computeTotales(secciones, data?.totales), [secciones, data]);
  const groups = useMemo(() => groupByRegion(secciones), [secciones]);
  const legend = useMemo(() => legendFor(mode, theme, secciones), [mode, theme, secciones]);
  const current = useMemo(
    () => (selected ? secciones.find((x) => x.seccion === selected) ?? null : null),
    [selected, secciones],
  );

  // Live: pulse secciones that received captures since the last refresh.
  useEffect(() => {
    if (!secciones.length) return;
    const before = prev.current;
    prev.current = secciones;
    if (!before) return;
    const changed = changedSecciones(before, secciones);
    if (!changed.size) return;
    setFlashing(changed);
    setAnnounce(`Nuevas capturas en ${changed.size === 1 ? "la sección" : "las secciones"} ${[...changed].join(", ")}.`);
    const t = window.setTimeout(() => setFlashing(new Set()), 3200);
    return () => {
      window.clearTimeout(t);
      setFlashing(new Set());
    };
  }, [secciones]);

  const select = useCallback((s: string | null) => setSelected(s), []);

  const selectFromList = (s: string) => {
    setSelected(s);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapWrap.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  };

  // Mobile sheet: Escape closes, focus moves into it when it opens.
  useEffect(() => {
    if (!current || isDesktop) return;
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, isDesktop]);

  const close = () => setSelected(null);

  return (
    <AppLayout title="Mapa" crumb="Territorio">
      <PageHeader
        title="Mapa de San Mateo Atenco"
        subtitle="Metas 2027 y avance de la captura en cada sección. Los números se actualizan solos cada minuto."
        actions={
          data ? (
            <LiveStatus updatedAt={updatedAt} refreshing={refreshing} error={error} onRefresh={refresh} />
          ) : undefined
        }
      />

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <DataState
        loading={loading && !data}
        error={data ? null : error}
        onRetry={refresh}
        isEmpty={!!data && secciones.length === 0}
        emptyMessage="Este municipio todavía no tiene cartografía de secciones."
        skeleton={<Skeleton />}
      >
        <div className={`flex flex-col gap-5 ${current && !isDesktop ? "pb-[50vh]" : ""}`}>
          <KpiStrip totales={totales} />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [&_button]:min-h-[44px] [&_button]:whitespace-nowrap">
              <SegmentedControl options={MODES} value={mode} onChange={setMode} ariaLabel="Colorear el mapa por" />
            </div>
            <p className="text-sm text-ink-muted">
              Toca una sección para ver sus números.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div ref={mapWrap} className="flex scroll-mt-4 flex-col gap-3">
              <div className="relative">
                <SmaMap
                  secciones={secciones}
                  mode={mode}
                  theme={theme}
                  selected={selected}
                  onSelect={select}
                  flashing={flashing}
                  className="h-[58vh] min-h-[340px] rounded-card border border-line bg-bg-sunken shadow-panel lg:h-[640px]"
                />
                <MapLegend legend={legend} className="absolute bottom-9 left-3 z-10 hidden max-w-[19rem] lg:block" />
              </div>
              <MapLegend legend={legend} className="lg:hidden" />
            </div>

            <aside
              className="panel hidden p-5 lg:block lg:max-h-[640px] lg:overflow-y-auto"
              aria-label="Detalle de la sección"
            >
              {current ? (
                <SeccionDetalle seccion={current} theme={theme} onClose={close} titleId={`${titleId}-d`} />
              ) : (
                <div className="flex h-full flex-col justify-center gap-3 text-center">
                  <p className="font-display text-lg font-semibold text-ink">Elige una sección</p>
                  <p className="mx-auto max-w-[17rem] text-sm leading-relaxed text-ink-muted">
                    Haz clic en el mapa o en la tabla para ver metas, avance y resultado 2024. Con el teclado, usa
                    Tab sobre los números del mapa.
                  </p>
                </div>
              )}
            </aside>
          </div>

          <section aria-labelledby={`${titleId}-tabla`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`${titleId}-tabla`} className="font-display text-xl font-bold tracking-tight text-ink">
                Secciones por región
              </h2>
              <p className="text-sm text-ink-muted">Solo cuentan los registros nuevos.</p>
            </div>
            <SeccionesRegionTable
              groups={groups}
              totales={totales}
              theme={theme}
              selected={selected}
              onSelect={selectFromList}
            />
          </section>
        </div>
      </DataState>

      {/* Mobile bottom sheet (non-modal: the map stays usable behind it). */}
      {current && !isDesktop && (
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${titleId}-s`}
          tabIndex={-1}
          className="fixed inset-x-0 bottom-0 z-40 max-h-[72vh] animate-fade-up overflow-y-auto rounded-t-2xl border-t border-line-strong bg-panel px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_50px_-20px_rgba(0,0,0,0.55)] outline-none"
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong" aria-hidden="true" />
          <SeccionDetalle seccion={current} theme={theme} onClose={close} titleId={`${titleId}-s`} />
        </div>
      )}
    </AppLayout>
  );
}

export default MapaSmaPage;
