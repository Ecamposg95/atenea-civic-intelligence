import { useState, type ReactNode } from "react";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface AppLayoutProps {
  title: string;
  crumb?: string;
  children: ReactNode;
}

export function AppLayout({ title, crumb, children }: AppLayoutProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-bg text-ink">
      {/* Atmospheric layers */}
      <div className="pointer-events-none absolute inset-0 bg-mesh" />
      <div className="grain" />

      {/* Mobile drawer backdrop */}
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar title={title} crumb={crumb} onMenu={() => setNavOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
