import { Link, useNavigate } from "react-router-dom";

import { CampaignSwitcher } from "@/components/layout/CampaignSwitcher";
import { LogoutIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useAuthStore } from "@/store/authStore";

interface TopbarProps {
  title: string;
  crumb?: string;
  onMenu?: () => void;
}

export function Topbar({ title, crumb, onMenu }: TopbarProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "AT";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel/60 px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Abrir menú"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-ink-muted hover:text-ink focus-ring lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-ink sm:text-base">
            {title}
          </div>
          {crumb && <div className="truncate text-xs text-ink-faint">{crumb}</div>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <CampaignSwitcher />
        <ThemeToggle />
        <span className="pill hidden border-teal/30 bg-teal/10 text-teal md:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" />
          Systems operational
        </span>
        <button className="btn-ghost !px-2.5 sm:!px-4" onClick={handleLogout} title="Sign out">
          <LogoutIcon width={16} height={16} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
        <Link
          to="/profile"
          title="Mi perfil"
          className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-panel-raised text-xs font-semibold text-ink-muted transition-colors hover:border-accent hover:text-ink"
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}
