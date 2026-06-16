import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getIeemDatasets } from "@/api/intel";
import { getAreas } from "@/api/maps";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import {
  DatabaseIcon,
  LayersIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import { MODULES } from "@/modules/registry";
import type { IeemDatasetRef } from "@/types/intel";
import type { AreasResponse } from "@/types/maps";

interface SearchResult {
  id: string;
  label: string;
  sublabel: string;
  to: string;
}

interface ResultGroup {
  key: string;
  title: string;
  icon: React.ReactNode;
  results: SearchResult[];
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const LEVEL_LABELS: Record<string, string> = {
  state: "Estado",
  municipality: "Municipio",
};

function levelLabel(level: string): string {
  return LEVEL_LABELS[level] ?? level;
}

export function BusquedaPage() {
  const [query, setQuery] = useState("");
  const q = norm(query.trim());

  // States are always loaded; municipios are fetched lazily only once the
  // user has typed something, to avoid a heavy upfront request.
  const states = useAsync<AreasResponse>(() => getAreas("state"), []);
  const muni = useAsync<AreasResponse>(
    () => (q ? getAreas("municipality") : Promise.resolve(null as never)),
    [q.length === 0],
  );
  const ieem = useAsync<IeemDatasetRef[]>(() => getIeemDatasets(), []);

  const loading = states.loading || ieem.loading;
  const error = states.error ?? ieem.error;

  const moduleResults = useMemo<SearchResult[]>(() => {
    if (!q) return [];
    return MODULES.filter((m) => norm(m.label).includes(q)).map((m) => ({
      id: m.key,
      label: m.label,
      sublabel: m.state === "soon" ? "Próximamente" : m.path,
      to: m.path,
    }));
  }, [q]);

  const territoryResults = useMemo<SearchResult[]>(() => {
    if (!q) return [];
    const features = [
      ...(states.data?.features ?? []),
      ...(muni.data?.features ?? []),
    ];
    return features
      .filter((f) => norm(f.properties.name).includes(q))
      .slice(0, 30)
      .map((f) => ({
        id: f.properties.id,
        label: f.properties.name,
        sublabel: levelLabel(f.properties.level),
        to: "/territorios",
      }));
  }, [q, states.data, muni.data]);

  const ieemResults = useMemo<SearchResult[]>(() => {
    if (!q) return [];
    return (ieem.data ?? [])
      .filter((d) => norm(d.label).includes(q) || norm(d.key).includes(q))
      .map((d) => ({
        id: d.key,
        label: d.label,
        sublabel: `IEEM · ${d.key}`,
        to: "/ieem",
      }));
  }, [q, ieem.data]);

  const groups: ResultGroup[] = [
    {
      key: "modulos",
      title: "Módulos",
      icon: <LayersIcon width={16} height={16} />,
      results: moduleResults,
    },
    {
      key: "territorios",
      title: "Territorios",
      icon: <SearchIcon width={16} height={16} />,
      results: territoryResults,
    },
    {
      key: "ieem",
      title: "Fuentes IEEM",
      icon: <DatabaseIcon width={16} height={16} />,
      results: ieemResults,
    },
  ];

  const totalResults = groups.reduce((acc, g) => acc + g.results.length, 0);

  return (
    <AppLayout title="Búsqueda global" crumb="Plataforma">
      <PageHeader
        eyebrow="Plataforma"
        title="Búsqueda"
        accent="global"
        subtitle="Encuentra módulos, territorios y fuentes oficiales del Estado de México (IEEM) desde un solo lugar. Datos reales."
      />

      <div className="reveal mb-5">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar módulos, territorios o fuentes IEEM…"
            autoFocus
            className="field-input w-full pl-11 text-base"
          />
        </div>
        {q && (
          <p className="mt-2 font-mono text-xs text-ink-faint">
            {totalResults} resultado{totalResults === 1 ? "" : "s"} para “
            {query.trim()}”
          </p>
        )}
      </div>

      <DataState
        loading={loading}
        error={error}
        onRetry={() => {
          states.reload();
          ieem.reload();
        }}
        skeleton={
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-lg bg-panel-hover"
              />
            ))}
          </div>
        }
      >
        {!q ? (
          <Card>
            <div className="grid place-items-center px-5 py-10 text-center text-sm text-ink-faint">
              Escribe para buscar a través de módulos, territorios y fuentes
              IEEM.
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {groups.map((group) => (
              <Card
                key={group.key}
                title={group.title}
                accentDot
                action={
                  <span className="pill border-accent/30 bg-accent/10 font-mono text-accent">
                    {group.results.length}
                  </span>
                }
              >
                {group.results.length === 0 ? (
                  <div className="px-1 py-6 text-center text-sm text-ink-faint">
                    Sin coincidencias.
                  </div>
                ) : (
                  <ul className="-mx-2 space-y-0.5">
                    {group.results.map((r) => (
                      <li key={`${group.key}-${r.id}`}>
                        <Link
                          to={r.to}
                          className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-panel-hover/60"
                        >
                          <span className="metric-chip h-8 w-8 shrink-0 text-accent">
                            {group.icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink group-hover:text-accent">
                              {r.label}
                            </span>
                            <span className="block truncate font-mono text-xs text-ink-faint">
                              {r.sublabel}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        )}
      </DataState>
    </AppLayout>
  );
}
