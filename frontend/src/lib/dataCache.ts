/**
 * Tiny in-memory stale-while-revalidate cache for page data.
 *
 * Switching modules remounts pages; without a cache every visit starts from a
 * blank skeleton. Pages opt in with a key: the last result is shown instantly
 * and refreshed in the background. Memory only (never storage): it may hold
 * PII-bearing lists, so it dies with the tab and is cleared on logout.
 */

interface Entry {
  value: unknown;
  at: number;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 80;

function activeCampaign(): string {
  try {
    return window.localStorage.getItem("agora-campaign") ?? "-";
  } catch {
    return "-";
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return String(v);
  }
}

/** Full key: namespace + active campaign + serialized deps. */
export function cacheKey(ns: string, deps: unknown[]): string {
  return `${ns}|${activeCampaign()}|${safeStringify(deps)}`;
}

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  return e ? (e.value as T) : undefined;
}

export function cacheSet(key: string, value: unknown): void {
  store.delete(key);
  store.set(key, { value, at: Date.now() });
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
}

export function clearDataCache(): void {
  store.clear();
}
