import { preloadPath } from "@/modules/registry";

/** Props for a nav link: fetch the route's chunk on hover, focus or touch so
 * the module is ready by the time the click lands. */
export function preloadHandlers(path: string) {
  const go = () => preloadPath(path);
  return { onMouseEnter: go, onFocus: go, onTouchStart: go };
}
