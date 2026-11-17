import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

function subscribe(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function snapshot() {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

/** ≥1024px → spreadsheet grid; below → one card per row. Only one of the
 * two is mounted, so ids and focus targets are never duplicated. */
export function useEsEscritorio(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
