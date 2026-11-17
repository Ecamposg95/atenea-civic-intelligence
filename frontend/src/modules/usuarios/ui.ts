/** Shared class recipes for the users screen (44px targets, visible focus). */
export const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel";

export const BTN_BASE = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;

export const BTN = {
  primary: `${BTN_BASE} bg-accent-strong text-bg hover:brightness-110`,
  secondary: `${BTN_BASE} border border-line-strong bg-panel text-ink hover:bg-panel-hover`,
  quiet: `${BTN_BASE} text-ink-muted hover:bg-panel-hover hover:text-ink`,
  danger: `${BTN_BASE} border border-state-critical/50 bg-state-critical/10 text-ink hover:bg-state-critical/20`,
  dangerSolid: `${BTN_BASE} bg-state-critical text-bg hover:brightness-110`,
} as const;

export const INPUT = `w-full min-h-[44px] rounded-lg border border-line-strong bg-bg-sunken px-3 text-[15px] text-ink placeholder:text-ink-muted/80 transition-colors focus:border-accent ${FOCUS}`;

export const LABEL = "mb-1.5 block text-sm font-medium text-ink";
