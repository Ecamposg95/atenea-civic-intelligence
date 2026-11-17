import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getIeemDatasets } from "@/api/intel";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import {
  DatabaseIcon,
  LayersIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { useAsync } from "@/hooks/useAsync";
import { MODULES } from "@/modules/registry";
import type { IeemDatasetRef } from "@/types/intel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  id: string;
  label: string;
  sublabel: string;
  to: string;
}

interface ResultGroup {
  key: GroupKey;
  title: string;
  icon: React.ReactNode;
  results: SearchResult[];
}

type GroupKey = "todos" | "modulos" | "ieem";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single result row — keyboard-navigable with visible focus ring. */
function ResultRow({ result, icon }: { result: SearchResult; icon: React.ReactNode }) {
  return (
    <li>
      <Link
        to={result.to}
        className="group focus-ring flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-panel-hover/60"
      >
        <span className="metric-chip h-8 w-8 shrink-0 text-accent" aria-hidden="true">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink group-hover:text-accent">
            {result.label}
          </span>
          <span className="block truncate font-mono text-xs text-ink-faint">
            {result.sublabel}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** A group section with header (title + count badge) and its result rows. */
function GroupSection({ group }: { group: ResultGroup }) {
  return (
    <section
      className="reveal card-premium p-5"
      aria-labelledby={`group-heading-${group.key}`}
    >
      {/* Group header */}
      <div className="mb-4 flex items-center justify-between">
        <span
          id={`group-heading-${group.key}`}
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent-gradient shadow-glow" aria-hidden="true" />
          <span aria-hidden="true">{group.icon}</span>
          {group.title}
        </span>
        <span
          className="pill border-accent/30 bg-accent/10 font-mono text-accent"
          aria-label={`${group.results.length} resultado${group.results.length === 1 ? "" : "s"}`}
        >
          {group.results.length}
        </span>
      </div>

      {group.results.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-ink-faint">
          Sin coincidencias.
        </p>
      ) : (
        <ul className="-mx-2 space-y-0.5" role="list">
          {group.results.map((r) => (
            <ResultRow key={`${group.key}-${r.id}`} result={r} icon={group.icon} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const SEGMENT_OPTIONS: { id: GroupKey; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "modulos", label: "Módulos" },
  { id: "ieem", label: "IEEM" },
];

export function BusquedaPage() {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<GroupKey>("todos");
  const q = norm(query.trim());

  const ieem = useAsync<IeemDatasetRef[]>(() => getIeemDatasets(), []);

  const loading = ieem.loading;
  const error = ieem.error;

  // -------------------------------------------------------------------------
  // Computed results
  // -------------------------------------------------------------------------

  const moduleResults = useMemo<SearchResult[]>(() => {
    if (!q) return [];
    return MODULES.filter((m) => norm(m.label).includes(q)).map((m) => ({
      id: m.key,
      label: m.label,
      sublabel: m.path,
      to: m.path,
    }));
  }, [q]);

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

  const allGroups: ResultGroup[] = [
    {
      key: "modulos",
      title: "Módulos",
      icon: <LayersIcon width={16} height={16} />,
      results: moduleResults,
    },
    {
      key: "ieem",
      title: "Fuentes IEEM",
      icon: <DatabaseIcon width={16} height={16} />,
      results: ieemResults,
    },
  ];

  // Filter groups by active segment (omit groups with zero results in "todos" view)
  const visibleGroups =
    activeGroup === "todos"
      ? allGroups
      : allGroups.filter((g) => g.key === activeGroup);

  const totalResults = allGroups.reduce((acc, g) => acc + g.results.length, 0);

  // "No results" only applies after a query has been made
  const hasSearched = q.length > 0;
  const isZeroResults = hasSearched && totalResults === 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <AppLayout title="Búsqueda global" crumb="Plataforma">
      <PageHeader
        eyebrow="Plataforma"
        title="Búsqueda"
        accent="global"
        subtitle="Encuentra módulos y fuentes oficiales del Estado de México (IEEM) desde un solo lugar. Datos reales."
      />

      {/* ── Search input ── */}
      <div className="reveal mb-5">
        <label htmlFor="busqueda-input" className="sr-only">
          Buscar módulos o fuentes IEEM
        </label>
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <input
            id="busqueda-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar módulos o fuentes IEEM…"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-label="Buscar módulos o fuentes IEEM"
            aria-controls="busqueda-results"
            aria-autocomplete="list"
            className="field-input w-full pl-11 text-base"
          />
        </div>

        {/* Result count — only when a query returned matches. The zero-results
            card below is the single aria-live announcement for the empty case. */}
        {hasSearched && !loading && !error && totalResults > 0 && (
          <p
            className="mt-2 font-mono text-xs text-ink-faint"
            aria-live="polite"
            aria-atomic="true"
          >
            {`${totalResults} resultado${totalResults === 1 ? "" : "s"} para "${query.trim()}"`}
          </p>
        )}
      </div>

      {/* ── Segment filter (only when a query is active and data is loaded) ── */}
      {hasSearched && !loading && !error && !isZeroResults && (
        <div className="reveal mb-5 flex items-center justify-between gap-4" style={{ animationDelay: "60ms" }}>
          <SegmentedControl
            options={SEGMENT_OPTIONS}
            value={activeGroup}
            onChange={setActiveGroup}
            ariaLabel="Filtrar resultados por categoría"
            size="sm"
          />
        </div>
      )}

      {/* ── Async state wrapper ── */}
      <DataState
        loading={loading}
        error={error}
        onRetry={() => {
          ieem.reload();
        }}
        skeleton={
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} lines={4} />
            ))}
          </div>
        }
      >
        {/* ── Pre-search prompt ── */}
        {!hasSearched ? (
          <div
            id="busqueda-results"
            className="reveal card-premium flex flex-col items-center gap-3 px-5 py-12 text-center"
            style={{ animationDelay: "80ms" }}
          >
            <span className="metric-chip h-12 w-12 text-accent" aria-hidden="true">
              <SearchIcon width={22} height={22} />
            </span>
            <p className="text-sm leading-relaxed text-ink-muted">
              Escribe para buscar a través de módulos y fuentes IEEM.
            </p>
            <p className="font-mono text-xs text-ink-faint">
              Usa el campo de búsqueda de arriba para comenzar.
            </p>
          </div>
        ) : isZeroResults ? (
          /* ── Zero-results state (after search returned nothing) ── */
          <div
            id="busqueda-results"
            className="reveal card-premium flex flex-col items-center gap-3 px-5 py-12 text-center"
            role="status"
            aria-live="polite"
          >
            <span className="metric-chip h-12 w-12 text-ink-faint" aria-hidden="true">
              <SearchIcon width={22} height={22} />
            </span>
            <p className="text-sm font-medium text-ink">
              Sin resultados para &ldquo;{query.trim()}&rdquo;
            </p>
            <p className="max-w-xs text-xs leading-relaxed text-ink-faint">
              Intenta con otro término, verifica la ortografía o busca en una categoría diferente.
            </p>
          </div>
        ) : (
          /* ── Results grid ── */
          <div
            id="busqueda-results"
            className="grid grid-cols-1 gap-4 lg:grid-cols-3"
            role="region"
            aria-label="Resultados de búsqueda"
          >
            {visibleGroups.map((group, idx) => (
              <div
                key={group.key}
                className="reveal"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <GroupSection group={group} />
              </div>
            ))}
          </div>
        )}
      </DataState>
    </AppLayout>
  );
}
