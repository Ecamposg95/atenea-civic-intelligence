import type { ReactNode } from "react";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface AppLayoutProps {
  title: string;
  crumb?: string;
  children: ReactNode;
}

export function AppLayout({ title, crumb, children }: AppLayoutProps) {
  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-bg text-ink">
      {/* Atmospheric layers */}
      <div className="pointer-events-none absolute inset-0 bg-mesh" />
      <div className="grain" />

      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar title={title} crumb={crumb} />
        <main className="flex-1 overflow-y-auto px-8 py-7">{children}</main>
      </div>
    </div>
  );
}
