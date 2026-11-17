import { useCallback, useEffect, useRef, useState } from "react";

import { cacheGet, cacheKey, cacheSet } from "@/lib/dataCache";

export interface AsyncState<T> {
  data: T | null;
  /** True only while there is nothing to show yet (first load, no cache). */
  loading: boolean;
  /** True while re-fetching with data already on screen. */
  refreshing: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Runs an async function on mount and whenever `deps` change, tracking
 * loading/error/data and exposing `reload()` to re-run it.
 *
 * Includes a race guard: stale resolutions (from a superseded run) are
 * ignored via an incrementing token captured per effect run.
 *
 * Pass `cacheNs` to opt into stale-while-revalidate: the last result for the
 * same namespace + deps + campaign is shown instantly (no skeleton) while a
 * fresh copy loads in the background. A failed background refresh keeps the
 * cached data on screen.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  cacheNs?: string,
): AsyncState<T> {
  const key = cacheNs ? cacheKey(cacheNs, deps) : null;
  const cached = key ? cacheGet<T>(key) : undefined;

  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped to force a re-run from reload(), independent of `deps`.
  const [nonce, setNonce] = useState(0);
  const first = useRef(true);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const hit = key ? cacheGet<T>(key) : undefined;
    if (hit !== undefined) {
      // Show the cached copy now (deps may have changed to another cached key).
      if (!first.current) setData(hit);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }
    first.current = false;
    setError(null);

    fn()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        if (key) cacheSet(key, result);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (hit === undefined) setData(null);
        setError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, key]);

  return { data, loading, refreshing, error, reload };
}
