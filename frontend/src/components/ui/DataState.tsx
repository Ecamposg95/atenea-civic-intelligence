import type { ReactNode } from "react";

import { AlertIcon } from "@/components/ui/icons";

interface DataStateProps {
  loading: boolean;
  error: string | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  /** Optional custom skeleton; defaults to a pulsing block. */
  skeleton?: ReactNode;
  /** Message for the empty state. */
  emptyMessage?: string;
  /** Rendered when not loading / error / empty. */
  children: ReactNode;
}

/**
 * Presentational wrapper that renders the right on-theme UI for an async
 * state: loading skeleton, premium error card with retry, empty state, or
 * the resolved children.
 *
 * Empty-state convention: for a REAL dataset whose table hasn't been ingested
 * yet, pass `emptyMessage="Ingesta pendiente"` (honest empty, never fake data).
 * For preview modules with sample fixtures, keep the PreviewBanner instead.
 */
export function DataState({
  loading,
  error,
  isEmpty = false,
  onRetry,
  skeleton,
  emptyMessage = "Sin datos.",
  children,
}: DataStateProps) {
  if (loading) {
    return (
      <>
        {skeleton ?? (
          <div className="h-24 animate-pulse rounded-lg bg-panel-hover" />
        )}
      </>
    );
  }

  if (error) {
    return (
      <div className="card-premium animate-fade-in flex flex-col items-center gap-3 px-5 py-8 text-center">
        <span className="metric-chip h-10 w-10 text-state-critical">
          <AlertIcon width={18} height={18} />
        </span>
        <p className="max-w-sm text-sm leading-relaxed text-ink-muted">{error}</p>
        {onRetry && (
          <button type="button" className="btn-ghost" onClick={onRetry}>
            Reintentar
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="grid place-items-center px-5 py-8 text-center text-sm text-ink-faint">
        {emptyMessage}
      </div>
    );
  }

  return <>{children}</>;
}
