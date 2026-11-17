import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/** A React.lazy component whose chunk can be fetched ahead of navigation. */
export type PreloadableComponent<T extends ComponentType> = LazyExoticComponent<T> & {
  preload: () => Promise<unknown>;
};

/**
 * `React.lazy` + `preload()`. The factory runs at most once, so calling
 * `preload()` (on hover / idle) and then rendering shares the same promise —
 * the route renders immediately instead of suspending.
 */
export function lazyPreload<T extends ComponentType>(
  factory: () => Promise<{ default: T }>,
): PreloadableComponent<T> {
  let promise: Promise<{ default: T }> | null = null;
  const load = () => {
    if (!promise) {
      promise = factory().catch((e) => {
        promise = null; // allow a retry after a transient network error
        throw e;
      });
    }
    return promise;
  };
  const C = lazy(load) as PreloadableComponent<T>;
  C.preload = load;
  return C;
}
