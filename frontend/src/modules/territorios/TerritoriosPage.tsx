import { useEffect, useMemo, useRef, useState } from "react";

import { getAreas } from "@/api/maps";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { MapCanvas } from "@/components/maps/MapCanvas";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { DataState } from "@/components/ui/DataState";
import { LayersIcon, MapIcon, SearchIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import type { AreaProperties } from "@/types/maps";
import { sampleMetric } from "@/types/maps";

type SelectedArea = AreaProperties & { metric: number };

interface LevelOption {
  value: string;
  label: string;
}

const LEVELS: LevelOption[] = [
  { value: "state", label: "Entidad" },
  { value: "district", label: "Distrito" },
  { value: "municipality", label: "Municipio" },
];

const LEVEL_LABEL: Record<string, string> = {
  state: "Entidad",
  district: "Distrito",
  municipality: "Municipio",
};

export function TerritoriosPage() {
  const [level, setLevel] = useState<string>("state");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedArea | null>(null);
  const [fitKey, setFitKey] = useState(0);

  const { data, loading, error, reload } = useAsync(
    () => getAreas(level),
    [level],
  );

  const features = useMemo(() => data?.features ?? [], [data]);

  // Bump the map fit-to-bounds whenever a fresh, non-empty dataset arrives.
  const dataFitKey = `${level}:${features.length}`;
  const lastFitKey = useRef(dataFitKey);
  useEffect(() => {
    if (features.length > 0 && lastFitKey.current !== dataFitKey) {
      lastFitKey.current = dataFitKey;
      setFitKey((k) => k + 1);
    }
  }, [dataFitKey, features.length]);

  const onLevelChange = (next: string) => {
    if (next === level) return;
    setLevel(next);
    setSelected(null);
    setSearch("");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return features;
    return features.filter(
      (f) =>
        f.properties.name.toLowerCase().includes(q) ||
        (f.properties.code ?? "").toLowerCase().includes(q),
    );
  }, [features, search]);

  const selectFromList = (props: AreaProperties) => {
    setSelected({ ...props, metric: sampleMetric(props.id) });
    setFitKey((k) => k + 1);
  };

  const isEmpty = !loading && !error && features.length === 0;

  return (
    <AppLayout title="Territorios & Secciones" crumb="Inteligencia Electoral">
      <PageHeader
        eyebrow="Inteligencia Electoral"
        title="Territorios"
        accent="& Secciones"
        subtitle="Drill-down geográfico sobre nuestra propia cartografía electoral: entidad, distrito y municipio en una sola vista de mando."
        actions={
          <>
            <div className="card-premium px-4 py-3">
              <div className="eyebrow mb-1.5">Áreas en el nivel</div>
              <div className="flex items-center gap-2">
                <LayersIcon className="h-5 w-5 text-accent" />
                <AnimatedNumber
                  value={features.length}
                  className="font-display text-2xl font-bold tabular-nums text-ink"
                />
              </div>
            </div>
            <div className="card-premium px-4 py-3">
              <div className="eyebrow mb-1.5">Nivel actual</div>
              <div className="font-display text-base font-semibold text-teal">
                {LEVEL_LABEL[level] ?? "—"}
              </div>
            </div>
          </>
        }
      >
        {/* Level segmented control */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-panel/60 p-1 backdrop-blur">
          {LEVELS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onLevelChange(opt.value)}
              aria-pressed={level === opt.value}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                level === opt.value
                  ? "bg-accent/15 text-accent shadow-glow-accent"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* LEFT — live map */}
        <div
          className="reveal hud-corners relative h-[440px] overflow-hidden rounded-card border border-line-strong bg-panel shadow-panel"
          style={{ animationDelay: "120ms" }}
        >
          <DataState
            loading={loading}
            error={error}
            isEmpty={isEmpty}
            onRetry={reload}
            emptyMessage="Sin cartografía de este nivel todavía — ingesta pendiente."
            skeleton={
              <div className="h-full w-full animate-pulse bg-panel-hover" />
            }
          >
            <div className="relative h-full w-full">
              <MapCanvas
                areas={data}
                showAreas
                choropleth
                basemap="dark"
                fitKey={fitKey}
                onSelect={setSelected}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-[5] rounded-card"
                style={{
                  boxShadow:
                    "inset 0 0 120px 16px rgba(2, 8, 20, 0.55), inset 0 0 0 1px rgba(127, 240, 224, 0.06)",
                }}
              />
            </div>
          </DataState>
        </div>

        {/* RIGHT — searchable list */}
        <div
          className="reveal card-premium flex h-[440px] flex-col p-0"
          style={{ animationDelay: "180ms" }}
        >
          <div className="border-b border-line p-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o clave…"
                className="field-input !py-2 pl-9"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <DataState
              loading={loading}
              error={error}
              isEmpty={isEmpty}
              onRetry={reload}
              emptyMessage="Sin cartografía de este nivel todavía — ingesta pendiente."
              skeleton={
                <div className="space-y-2 p-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 animate-pulse rounded-lg bg-panel-hover"
                    />
                  ))}
                </div>
              }
            >
              {filtered.length === 0 ? (
                <div className="grid h-full place-items-center px-4 text-center text-sm text-ink-faint">
                  Ningún área coincide con “{search}”.
                </div>
              ) : (
                <ul className="space-y-1">
                  {filtered.map((f) => {
                    const p = f.properties;
                    const active = selected?.id === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => selectFromList(p)}
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
                            {p.code && (
                              <span className="mt-0.5 block font-mono text-[11px] text-ink-faint">
                                {p.code}
                              </span>
                            )}
                          </span>
                          <span className="pill shrink-0 border-line text-[10px] text-ink-muted">
                            {LEVEL_LABEL[p.level] ?? p.level}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </DataState>
          </div>
        </div>
      </div>

      {/* Selected-area detail strip */}
      {selected && (
        <div className="reveal card-premium hud-corners mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="metric-chip h-11 w-11 text-accent shadow-glow-accent">
              <MapIcon width={20} height={20} />
            </span>
            <div className="min-w-0">
              <div className="eyebrow text-accent">
                {LEVEL_LABEL[selected.level] ?? selected.level}
              </div>
              <div className="truncate font-display text-lg font-semibold leading-tight text-ink">
                {selected.name}
              </div>
              {selected.code && (
                <span className="mt-1 inline-flex rounded-md border border-line bg-bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
                  {selected.code}
                </span>
              )}
            </div>
          </div>

          <div className="w-full max-w-xs">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs text-ink-muted">Métrica (muestra)</span>
              <span className="font-mono text-sm font-semibold text-ink">
                {(Math.max(0, Math.min(1, selected.metric)) * 100).toFixed(1)}%
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
