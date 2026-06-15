import { FormEvent, useEffect, useState } from "react";

import { getSources, searchDatasets } from "@/api/sources";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { DatabaseIcon, SearchIcon } from "@/components/ui/icons";
import type { DatasetSummary, SourceInfo } from "@/types/sources";

const KIND_BADGE: Record<string, string> = {
  api: "border-accent/30 bg-accent/10 text-accent",
  wms: "border-teal/30 bg-teal/10 text-teal",
  download: "border-state-warning/30 bg-state-warning/10 text-state-warning",
  portal: "border-line text-ink-muted",
};

export function SourcesPage() {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [datasets, setDatasets] = useState<DatasetSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Query that produced the current results/error, so "Reintentar" re-runs it.
  const [lastQuery, setLastQuery] = useState<string | null>(null);

  useEffect(() => {
    getSources()
      .then(setSources)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const runSearch = async (q: string) => {
    setSearching(true);
    setSearchError(null);
    setLastQuery(q);
    try {
      setDatasets(await searchDatasets(q));
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "No se pudo consultar el catálogo",
      );
      setDatasets(null);
    } finally {
      setSearching(false);
    }
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    void runSearch(query);
  };

  return (
    <AppLayout title="Fuentes de datos" crumb="Integraciones · INE México">
      <PageHeader
        eyebrow="Integraciones"
        title="Fuentes de datos"
        accent="INE"
        subtitle="Catálogo de fuentes consumibles del Instituto Nacional Electoral y datos abiertos relacionados. Consulta el catálogo de datos.gob.mx en vivo."
        actions={
          sources.length > 0 && (
            <div className="card-premium hud-corners px-4 py-3">
              <div className="eyebrow mb-1.5">Fuentes</div>
              <div className="flex items-center gap-2">
                <DatabaseIcon className="h-5 w-5 text-accent" />
                <AnimatedNumber
                  value={sources.length}
                  className="font-display text-2xl font-bold tabular-nums text-ink"
                />
              </div>
            </div>
          )
        }
      />

      {/* Source registry */}
      <DataState
        loading={loading}
        error={error}
        isEmpty={sources.length === 0}
        emptyMessage="No hay fuentes registradas."
        skeleton={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-card bg-panel-hover" />
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sources.map((s, i) => (
            <div
              key={s.id}
              className="card-premium reveal group flex flex-col p-5"
              style={{ animationDelay: `${120 + i * 60}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="metric-chip h-8 w-8 shrink-0 text-accent transition-colors group-hover:text-teal">
                    <DatabaseIcon width={15} height={15} />
                  </span>
                  <h3 className="truncate text-sm font-semibold text-ink">{s.name}</h3>
                </div>
                <span className={`pill shrink-0 ${KIND_BADGE[s.kind] ?? "border-line"}`}>
                  {s.kind}
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">{s.notes}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.formats.map((f) => (
                  <span key={f} className="pill border-line font-mono text-ink-faint">
                    {f}
                  </span>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-ink-faint">
                <span className="truncate font-mono">{s.base_url}</span>
                {s.auth_required && (
                  <span className="pill shrink-0 border-state-warning/30 bg-state-warning/10 text-state-warning">
                    requiere acceso
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </DataState>

      {/* CKAN dataset search */}
      <div className="reveal mt-6" style={{ animationDelay: "240ms" }}>
        <Card title="Catálogo datos.gob.mx (CKAN)" accentDot>
          <form onSubmit={onSearch} className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              className="field-input pl-9"
              placeholder="Buscar datasets del INE (p. ej. lista nominal)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>

          <div className="mt-4 space-y-2">
            {lastQuery === null ? (
              <p className="text-sm text-ink-faint">
                Escribe una consulta para buscar en el catálogo en vivo.
              </p>
            ) : (
              <DataState
                loading={searching}
                error={searchError}
                isEmpty={!!datasets && datasets.length === 0}
                emptyMessage="Sin resultados."
                onRetry={() => void runSearch(lastQuery)}
                skeleton={
                  <div className="h-16 animate-pulse rounded-lg bg-panel-hover" />
                }
              >
                <div className="space-y-2">
                  {datasets?.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:bg-panel-hover"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-ink">{d.title}</div>
                        {d.organization && (
                          <div className="text-xs text-ink-faint">{d.organization}</div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {d.formats.slice(0, 4).map((f) => (
                          <span
                            key={f}
                            className="pill border-line font-mono text-ink-faint"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </DataState>
            )}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
