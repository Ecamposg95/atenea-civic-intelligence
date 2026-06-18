import { useMemo, useState } from "react";

import { getIeemDataset, getIeemDatasets } from "@/api/intel";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import type { Column } from "@/components/ui/DataTable";
import { DataTable } from "@/components/ui/DataTable";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { DatabaseIcon, SearchIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";

/** Max number of datasets before falling back to a <select> picker. */
const MAX_SEGMENTS = 6;

/** Row shape augmented with a stable string row index for use as DataTable rowKey. */
type IndexedRow = Record<string, string> & { __idx: string };

export function IeemPage() {
  const [key, setKey] = useState("municipios");
  const [q, setQ] = useState("");

  // Dataset list — fetched once on mount; drives the dataset picker.
  const { data: datasetList, loading: datasetsLoading } = useAsync(
    () => getIeemDatasets(),
    [],
  );
  const datasets = datasetList ?? [];

  // Dataset rows — re-fetched whenever `key` changes, or when reload() is called.
  // reload() bumps an internal nonce (see useAsync), so clicking "Reintentar"
  // genuinely re-runs getIeemDataset(key) for the CURRENTLY-selected dataset.
  const { data, loading, error, reload } = useAsync(
    () => getIeemDataset(key),
    [key],
  );

  // Add a stable __idx string to each row so DataTable can key them without
  // relying on column values (which may not be unique across the 7 053-row dataset).
  const indexedRows = useMemo<IndexedRow[]>(() => {
    if (!data) return [];
    return data.rows.map((r, i) => ({ __idx: String(i), ...r }));
  }, [data]);

  // Client-side text filter applied on top of the loaded rows.
  const filteredRows = useMemo<IndexedRow[]>(() => {
    if (!q.trim()) return indexedRows;
    const needle = q.toLowerCase();
    return indexedRows.filter((r) =>
      Object.entries(r).some(
        ([k, v]) => k !== "__idx" && String(v).toLowerCase().includes(needle),
      ),
    );
  }, [indexedRows, q]);

  // Columns are derived from the dataset's column list. Memoised on data.columns
  // so they're stable between renders unless the dataset changes.
  const columns = useMemo<Column<IndexedRow>[]>(() => {
    if (!data?.columns?.length) return [];
    return data.columns.map((col) => ({
      key: col,
      header: col,
      sortValue: (row) => row[col] ?? "",
      render: (row) => (
        <span className="font-mono tabular-nums text-ink-muted">
          {row[col] ?? "—"}
        </span>
      ),
    }));
  }, [data?.columns]);

  const handleDatasetChange = (nextKey: string) => {
    setKey(nextKey);
    setQ("");
  };

  const useSelectPicker = !datasetsLoading && datasets.length > MAX_SEGMENTS;

  return (
    <AppLayout
      title="Estado de México — Electoral"
      crumb="IEEM · Inteligencia Electoral"
    >
      <PageHeader
        eyebrow="Inteligencia Electoral"
        title="Estado de México"
        accent="(IEEM)"
        subtitle="Estadística electoral oficial del Instituto Electoral del Estado de México (Registro Federal de Electores). Datos reales."
        actions={
          data && !loading ? (
            <MetricCard
              label={data.label}
              value={String(data.count)}
              tone="accent"
              icon={<DatabaseIcon width={18} height={18} />}
            />
          ) : undefined
        }
      />

      {/* ── Dataset picker + search bar ── */}
      <div className="reveal mb-4 flex flex-wrap items-center gap-3">
        {/* Placeholder shimmer while the dataset list loads */}
        {datasetsLoading && (
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-8 w-28 animate-pulse rounded-lg bg-panel-hover"
              />
            ))}
          </div>
        )}

        {/* SegmentedControl when ≤6 datasets */}
        {!datasetsLoading && !useSelectPicker && datasets.length > 0 && (
          <SegmentedControl
            options={datasets.map((d) => ({ id: d.key, label: d.label }))}
            value={key}
            onChange={handleDatasetChange}
            ariaLabel="Seleccionar dataset del IEEM"
          />
        )}

        {/* Labelled <select> fallback when >6 datasets */}
        {!datasetsLoading && useSelectPicker && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="ieem-dataset-select"
              className="text-xs font-medium uppercase tracking-wider text-ink-faint"
            >
              Dataset
            </label>
            <select
              id="ieem-dataset-select"
              value={key}
              onChange={(e) => handleDatasetChange(e.target.value)}
              className="focus-ring rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-medium text-ink"
            >
              {datasets.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Inline loading pill while a dataset row-set is being fetched */}
        {loading && !datasetsLoading && (
          <span className="pill border-accent/30 bg-accent/10 text-accent text-xs animate-pulse">
            Cargando…
          </span>
        )}

        {/* Search box — right-aligned */}
        <div className="relative ml-auto max-w-xs flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en el dataset…"
            className="field-input !py-2 pl-9 focus-ring"
            aria-label="Buscar en el dataset"
          />
        </div>
      </div>

      {/* ── Dataset table card ── */}
      <div className="reveal" style={{ animationDelay: "80ms" }}>
        <Card
          title={data?.label ?? "Dataset"}
          accentDot
          className="card-premium hud-corners !p-0 overflow-hidden"
          action={
            data && !loading && !error ? (
              <span className="pill border-line text-ink-muted">
                {filteredRows.length} de {data.count} filas
              </span>
            ) : undefined
          }
        >
          <DataState
            loading={loading}
            error={error}
            onRetry={reload}
            isEmpty={!loading && !error && !!data && data.rows.length === 0}
            emptyMessage="El dataset no devolvió filas."
            skeleton={
              <div className="p-4">
                <SkeletonRows rows={8} />
              </div>
            }
          >
            {data && columns.length > 0 && (
              <>
                <DataTable<IndexedRow>
                  columns={columns}
                  rows={filteredRows}
                  rowKey={(r) => r.__idx}
                  pageSize={25}
                  emptyMessage={
                    q.trim()
                      ? `Ninguna fila coincide con "${q}".`
                      : "El dataset no devolvió filas."
                  }
                  defaultSortKey={data.columns[0]}
                  defaultSortDir="asc"
                />
                <p className="border-t border-line px-4 py-3 text-[11px] text-ink-faint">
                  Fuente: {data.source}
                </p>
              </>
            )}
          </DataState>
        </Card>
      </div>
    </AppLayout>
  );
}
