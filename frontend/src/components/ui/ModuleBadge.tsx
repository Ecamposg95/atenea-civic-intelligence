import type { ModuleState } from "@/modules/registry";

const STYLES: Record<ModuleState, { label: string; cls: string } | null> = {
  active: null,
  preview: { label: "Preview", cls: "border-state-warning/30 bg-state-warning/10 text-state-warning" },
  soon: { label: "Pronto", cls: "border-teal/30 bg-teal/10 text-teal" },
};

export function ModuleBadge({ state }: { state: ModuleState }) {
  const s = STYLES[state];
  if (!s) return null;
  return <span className={`pill ${s.cls}`}>{s.label}</span>;
}
