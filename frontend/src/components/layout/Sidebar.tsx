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
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors";
const sectionLabel =
  "mt-7 mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint";

function visibleFor(role: string | undefined, m: ModuleDef): boolean {
  if (!m.roles) return true;
  if (!role) return false;
  return m.roles.includes(role as UserRole);
}

export function Sidebar() {
  const role = useAuthStore((s) => s.user?.role);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `${navItem} ${
      isActive ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-panel-hover hover:text-ink"
    }`;

  return (
    <aside className="relative z-10 flex w-64 shrink-0 flex-col border-r border-line bg-panel px-4 py-5">
      <div className="flex items-center gap-3 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent">
          <LogoMark width={20} height={20} />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight text-ink">Ágora</div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">
            Civic Intelligence
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {SECTION_ORDER.map((section) => {
          const items = MODULES.filter(
            (m) => m.section === section && visibleFor(role, m),
          );
          if (items.length === 0) return null;
          return (
            <div key={section}>
              <div className={sectionLabel}>{SECTION_LABELS[section]}</div>
              <nav className="flex flex-col gap-1">
                {items.map((m) => {
                  const Icon = m.icon;
                  return (
                    <NavLink key={m.key} to={m.path} end={m.end} className={linkClass}>
                      <Icon width={18} height={18} />
                      <span className="flex-1">{m.label}</span>
                      <ModuleBadge state={m.state} />
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          );
        })}
      </div>

      <div className="px-3 pt-6 text-[11px] leading-relaxed text-ink-faint">
        Atlas Tech · GovTech
        <br />
        <span className="opacity-70">v0.2.0 · Platform demo</span>
      </div>
    </aside>
  );
}
