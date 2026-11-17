import { useCallback, useEffect, useRef, useState } from "react";

import { getMapaMunicipio, type MapaCollection } from "@/api/mapa";
import { useCampaignStore } from "@/store/campaignStore";

const POLL_MS = 60_000;
/** Don't refetch on focus if the last fetch is fresher than this. */
const FOCUS_MIN_GAP_MS = 10_000;

export interface MapaSmaState {
  data: MapaCollection | null;
  /** First load only — background refreshes keep showing the last data. */
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Last successful fetch (epoch ms). */
  updatedAt: number | null;
  refresh: () => void;
}

/**
 * Live map data: loads once, then refreshes every 60 s while the tab is
 * visible and whenever the window regains focus. A failed background refresh
 * keeps the previous data on screen and only flags `error`.
 */
export function useMapaSma(code: string): MapaSmaState {
  const campaignId = useCampaignStore((s) => s.activeId);
  const [data, setData] = useState<MapaCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const lastFetch = useRef(0);
  const seq = useRef(0);
  const hasData = useRef(false);

  const load = useCallback(
    async (background: boolean) => {
      const my = ++seq.current;
      lastFetch.current = Date.now();
      if (background) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await getMapaMunicipio(code);
        if (my !== seq.current) return;
        setData(res);
        hasData.current = true;
        setError(null);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (my !== seq.current) return;
        setError(e instanceof Error ? e.message : "No se pudo cargar el mapa.");
      } finally {
        if (my === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [code],
  );

  // Initial load, and a fresh (foreground) load when the campaign changes.
  useEffect(() => {
    setData(null);
    hasData.current = false;
    void load(false);
  }, [load, campaignId]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, POLL_MS);
    const onFocus = () => {
      if (Date.now() - lastFetch.current > FOCUS_MIN_GAP_MS) void load(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const refresh = useCallback(() => void load(hasData.current), [load]);

  return { data, loading, refreshing, error, updatedAt, refresh };
}

/** Re-renders every `ms` so relative timestamps stay current. */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== "undefined" && window.matchMedia(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}
