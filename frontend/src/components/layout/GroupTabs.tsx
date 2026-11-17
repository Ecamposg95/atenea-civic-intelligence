import { NavLink, useLocation } from "react-router-dom";

import { preloadHandlers } from "@/lib/preloadHandlers";

import { GROUPS, groupModules, moduleForPath } from "@/modules/registry";
import { useAuthStore } from "@/store/authStore";

/** Tabs for the nav group owning the current route (e.g. Mapa SMA → Mapa ·
 * Panorama · Plan · War Room · Alertas). Renders nothing for standalone modules
 * or when the role can see a single tab. */
export function GroupTabs() {
  const { pathname } = useLocation();
  const role = useAuthStore((s) => s.user?.role);
  const current = moduleForPath(pathname);
  if (!current?.group) return null;
  const tabs = groupModules(current.group, role);
  if (tabs.length < 2) return null;
  const group = GROUPS.find((g) => g.key === current.group);

  return (
    <nav
      aria-label={group ? `Secciones de ${group.label}` : "Secciones"}
      className="-mx-4 mb-5 overflow-x-auto border-b border-line px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => (
          <li key={t.key}>
            <NavLink
              to={t.path}
              end={tabs.some((o) => o !== t && o.path.startsWith(t.path + "/"))}
              {...preloadHandlers(t.path)}
              className={({ isActive }) =>
                [
                  "focus-ring inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
                  isActive
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-muted hover:border-line hover:text-ink",
                ].join(" ")
              }
            >
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
