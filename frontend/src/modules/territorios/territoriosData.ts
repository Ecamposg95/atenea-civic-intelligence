import type { AreaFeature } from "@/types/maps";
import { sampleMetric } from "@/types/maps";

export interface StateGroup {
  /** State name = the GADM NAME_1 carried in each municipio's `code`. */
  name: string;
  /** Number of municipios whose `code` equals this state name (real). */
  count: number;
  /** Mean sample metric across the state's municipios — labelled "muestra". */
  metric: number;
}

/**
 * Roll municipio features up into the distinct states they belong to.
 *
 * GADM-derived municipios carry `properties.code === NAME_1` (the state) and
 * `properties.name === NAME_2` (the municipio). Grouping by `code` is
 * self-consistent, so we deliberately do NOT join to the separate 32-state
 * layer (whose names differ, e.g. "Distrito Federal" vs "Ciudad de México").
 */
export function groupMunicipiosByState(
  features: AreaFeature[],
): StateGroup[] {
  const acc = new Map<string, { count: number; metricSum: number }>();

  for (const f of features) {
    const name = f.properties.code;
    if (!name) continue;
    const entry = acc.get(name) ?? { count: 0, metricSum: 0 };
    entry.count += 1;
    entry.metricSum += sampleMetric(f.properties.id);
    acc.set(name, entry);
  }

  return Array.from(acc.entries())
    .map(([name, { count, metricSum }]) => ({
      name,
      count,
      metric: count > 0 ? metricSum / count : 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
