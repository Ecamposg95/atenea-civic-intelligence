// frontend/src/modules/economia/client.ts
import {
  COMERCIO_SUBSECTORS,
  COMPLEXITY,
  ENTITIES,
  EXPORT_SHARES,
  SECTORS,
  SUMMARY,
  TRADE_BALANCE,
  type ComercioSubsector,
  type ComplexityPoint,
  type EntityEconomy,
  type ExportShare,
  type EconomySummary,
  type SectorComposition,
  type TradeBalancePoint,
} from "./fixtures";

export interface EconomyData {
  summary: EconomySummary;
  entities: EntityEconomy[];
  sectors: SectorComposition[];
  exports: ExportShare[];
  trade: TradeBalancePoint[];
  comercio: ComercioSubsector[];
  complexity: ComplexityPoint[];
}

/**
 * Returns sample territorial economic data (PREVIEW).
 *
 * The real external source DataMéxico (datamexico.org) is unreachable from the
 * production network, so this returns bundled fixtures for now.
 *
 * FUTURE: swap the body for a backend proxy call, e.g.
 *   const res = await fetch("/api/intel/datamexico/economy");
 *   return (await res.json()) as EconomyData;
 * keeping the EconomyData shape stable so the page does not change.
 */
export async function getEconomy(): Promise<EconomyData> {
  return {
    summary: SUMMARY,
    entities: ENTITIES,
    sectors: SECTORS,
    exports: EXPORT_SHARES,
    trade: TRADE_BALANCE,
    comercio: COMERCIO_SUBSECTORS,
    complexity: COMPLEXITY,
  };
}
