/** Small shared bits for the Personas screens (Lista, ficha, Estructura). */
import type { Promovido, TipoPersona } from "@/api/promovidos";

/** 44px targets + visible focus (focus-ring), AA in both themes. */
export const BTN =
  "focus-ring inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent-strong px-4 text-sm font-semibold text-white dark:text-bg transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60";
export const BTN_GHOST =
  "focus-ring inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-line-strong bg-panel px-4 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-50";
export const FIELD = "field-input focus-ring min-h-[44px] text-ink";

export const TIPO_LABEL: Record<TipoPersona, string> = {
  LIDER: "Líder",
  ACTIVISTA: "Activista",
  PROMOVIDO: "Promovido",
};

const TIPO_TONE: Record<TipoPersona, string> = {
  LIDER: "bg-accent/12 text-accent-strong ring-accent/25",
  ACTIVISTA: "bg-warm/14 text-ink ring-warm/30",
  PROMOVIDO: "bg-panel-hover text-ink-muted ring-line",
};

export function TipoBadge({ tipo }: { tipo?: TipoPersona | null }) {
  if (!tipo) return <span className="text-ink-faint">—</span>;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${TIPO_TONE[tipo]}`}>
      {TIPO_LABEL[tipo]}
    </span>
  );
}

/** Spec §8: grey "Valor viejo" badge for rows captured before the paper hub. */
export function LegacyBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium text-ink-muted ${className}`}>
      Valor viejo
    </span>
  );
}

/** Who this person hangs from: the paper parent, else the legacy free-text promotor. */
export const cadenaDe = (p: Pick<Promovido, "padre_nombre" | "promotor">): string =>
  p.padre_nombre || p.promotor || "—";

export const fmtFecha = (v: string | null | undefined): string => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
};
