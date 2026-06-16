import type { AreasResponse } from "@/types/maps";

/** A single entry in the real per-state municipio-count ranking. */
export interface StateCount {
  /** State name (municipio `properties.code` carries its STATE name). */
  state: string;
  /** Real count of municipios grouped under this state. */
  count: number;
}

/**
 * REAL metric (not a sample): groups the loaded municipio features by their
 * `code` (= state name) and returns counts per state, sorted descending.
 *
 * Only municipio-level features contribute, so this is safe to call with any
 * AreasResponse — at other levels it simply yields an empty ranking.
 */
export function municipiosByState(areas: AreasResponse | null): StateCount[] {
  if (!areas) return [];
  const counts = new Map<string, number>();
  for (const f of areas.features) {
    if (f.properties.level !== "municipality") continue;
    const state = f.properties.code;
    if (!state) continue;
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
}
