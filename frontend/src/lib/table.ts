// frontend/src/lib/table.ts
export type SortDir = "asc" | "desc";

/** Stable sort by a key extractor; strings use locale compare, numbers numeric. */
export function sortRows<T>(
  rows: T[],
  getValue: (row: T) => string | number | null | undefined,
  dir: SortDir,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows]
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const va = getValue(a.row);
      const vb = getValue(b.row);
      if (va == null && vb == null) return a.i - b.i;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return va === vb ? a.i - b.i : (va - vb) * sign;
      }
      const cmp = String(va).localeCompare(String(vb), "es");
      return cmp === 0 ? a.i - b.i : cmp * sign;
    })
    .map((x) => x.row);
}

/** Slice rows for a 1-based page. */
export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

/** Human range label, e.g. "1–20 de 7053". */
export function pageRangeLabel(total: number, page: number, pageSize: number): string {
  if (total === 0) return "0 de 0";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `${start}–${end} de ${total}`;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
