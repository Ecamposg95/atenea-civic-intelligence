import { NavLink } from "react-router-dom";

import { ModuleBadge } from "@/components/ui/ModuleBadge";
import { LogoMark } from "@/components/ui/icons";
import {
  MODULES,
  SECTION_LABELS,
  SECTION_ORDER,
  type ModuleDef,
} from "@/modules/registry";
import { useAuthStore } from "@/store/authStore";
import type { UserRole } from "@/types/auth";

const navItem =
  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-all focus-ring";
const sectionLabel =
  "mt-5 mb-1.5 flex items-center justify-between px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint";

function visibleFor(role: string | undefined, m: ModuleDef): boolean {
  if (!m.roles) return true;
  if (!role) return false;
  return m.roles.includes(role as UserRole);
}

export function Sidebar({
  open = false,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const role = useAuthStore((s) => s.user?.role);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `${navItem} ${
      isActive
        ? "bg-accent/10 text-accent ring-1 ring-inset ring-accent/25 shadow-glow-accent"
        : "text-ink-muted hover:bg-panel-hover hover:text-ink"
    }`;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-[280px] shrink-0 flex-col border-r border-line bg-panel px-3 py-5 transition-transform duration-300 lg:static lg:z-10 lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-3 px-2">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent/15 text-accent shadow-glow-accent">
          <LogoMark width={24} height={24} />
        </div>
        <div className="min-w-0">
          <div className="font-display text-base font-semibold tracking-tight text-ink">
            Atenea
          </div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">
            Civic Intelligence
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar menú"
          className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-muted hover:text-ink lg:hidden"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto pr-1">
        {(() => {
          const dashboardModule = MODULES.find(
            (m) => m.key === "dashboard" && visibleFor(role, m),
          );
          if (!dashboardModule) return null;
          const Icon = dashboardModule.icon;
          return (
            <nav className="flex flex-col gap-0.5">
              <NavLink
                key={dashboardModule.key}
                to={dashboardModule.path}
                end={dashboardModule.end}
                className={linkClass}
                title={dashboardModule.label}
                onClick={onClose}
              >
                <Icon width={20} height={20} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {dashboardModule.label}
                </span>
                <ModuleBadge state={dashboardModule.state} />
              </NavLink>
            </nav>
          );
        })()}
        {SECTION_ORDER.map((section) => {
          const items = MODULES.filter(
            (m) =>
              m.section === section &&
              m.key !== "dashboard" &&
              visibleFor(role, m),
          );
          if (items.length === 0) return null;
          return (
            <div key={section}>
              <div className={sectionLabel}>
                <span>{SECTION_LABELS[section]}</span>
              </div>
              <nav className="flex flex-col gap-0.5">
                {items.map((m) => {
                  const Icon = m.icon;
                  return (
                    <NavLink
                      key={m.key}
                      to={m.path}
                      end={m.end}
                      className={linkClass}
                      title={m.label}
                      onClick={onClose}
                    >
                      <Icon width={20} height={20} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{m.label}</span>
                      <ModuleBadge state={m.state} />
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          );
        })}
      </div>

      <div className="mt-2 border-t border-line px-3 pt-4 text-[11px] leading-relaxed text-ink-faint">
        Atlas Tech · GovTech
        <br />
        <span className="opacity-70">v0.2.0 · Platform demo</span>
      </div>
    </aside>
  );
}
