// frontend/src/components/ui/DataTable.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { pageCount, pageRangeLabel, paginate, sortRows, type SortDir } from "@/lib/table";

export interface Column<T> {
  key: string;
  /** Column header; usually a string, but accepts a ReactNode (e.g. to attach
   * a "muestra" badge next to a fabricated-data column). */
  header: ReactNode;
  /** Cell renderer; defaults to String(row[key]). */
  render?: (row: T) => ReactNode;
  /** Value used for sorting; enables the sortable header when present. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  /** Hide this column on the mobile card fallback. */
  hideOnCard?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize?: number;
  /** Empty-state message when rows.length === 0. */
  emptyMessage?: string;
  /** Optional click handler per row. */
  onRowClick?: (row: T) => void;
  /** Initial sort column key (must match a column with `sortValue`). */
  defaultSortKey?: string;
  /** Initial sort direction when `defaultSortKey` is set. Defaults to "asc". */
  defaultSortDir?: SortDir;
}

const SortGlyph = ({ dir }: { dir: SortDir | null }) => (
  <span className="ml-1 inline-block text-[9px] leading-none text-accent">
    {dir === "asc" ? "▲" : dir === "desc" ? "▼" : ""}
  </span>
);

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize = 20,
  emptyMessage = "Sin datos.",
  onRowClick,
  defaultSortKey,
  defaultSortDir = "asc",
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the row count changes (e.g. filter applied/cleared).
  // Depend on rows.length — NOT rows reference — so callers that pass freshly-
  // computed inline arrays each render (UsersPage, OrgsPage, PadronPage, etc.)
  // don't get reset on every render.
  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    return sortRows(rows, col.sortValue, sortDir);
  }, [rows, columns, sortKey, sortDir]);

  const total = sorted.length;
  const pages = pageCount(total, pageSize);
  const current = Math.min(page, pages);
  const visible = paginate(sorted, current, pageSize);

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const alignCls = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  if (total === 0) {
    return (
      <div className="card-premium grid place-items-center px-5 py-10 text-center text-sm text-ink-faint">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="card-premium overflow-hidden">
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-line bg-panel-raised text-ink-muted">
              {columns.map((c) => {
                const isSorted = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={isSorted ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                    className={`px-[18px] py-3 text-xs font-semibold uppercase tracking-wide ${alignCls(c.align)}`}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c)}
                        className="focus-ring inline-flex items-center rounded hover:text-ink"
                      >
                        {c.header}
                        <SortGlyph dir={isSorted ? sortDir : null} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); } } : undefined}
                className={`border-b border-line/60 transition-colors hover:bg-panel-hover ${onRowClick ? "cursor-pointer focus-ring" : ""}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-[18px] py-3 text-ink ${alignCls(c.align)}`}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card fallback */}
      <div className="divide-y divide-line/60 md:hidden">
        {visible.map((row) => {
          const inner = columns
            .filter((c) => !c.hideOnCard)
            .map((c) => (
              <div key={c.key} className="flex justify-between gap-3 py-0.5 text-sm">
                <span className="text-ink-faint">{c.header}</span>
                <span className="text-ink">
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                </span>
              </div>
            ));
          return onRowClick ? (
            <button
              key={rowKey(row)}
              type="button"
              onClick={() => onRowClick(row)}
              className="focus-ring block w-full px-4 py-3 text-left"
            >
              {inner}
            </button>
          ) : (
            <div key={rowKey(row)} className="px-4 py-3">
              {inner}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-ink-muted">
          <span className="font-mono">{pageRangeLabel(total, current, pageSize)}</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="btn-ghost px-2.5 py-1 text-xs"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              className="btn-ghost px-2.5 py-1 text-xs"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
