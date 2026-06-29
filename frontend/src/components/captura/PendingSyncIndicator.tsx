import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePendingSyncStore } from "@/store/pendingSyncStore";

/**
 * Displays only the count of records waiting to sync and, separately, the
 * count of records permanently rejected by the server — no PII in either case.
 * Hidden when there are no pending or failed records and no sync in progress.
 * Shows a spinner while syncing and disables the sync button when offline or
 * a sync is already in progress.
 */
export function PendingSyncIndicator() {
  const { pending, failed, syncing, triggerSync } = usePendingSyncStore();
  const isOnline = useOnlineStatus();

  if (pending === 0 && !syncing && failed === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {(pending > 0 || syncing) && (
        <div className="pill border-state-warning/30 bg-state-warning/10 text-state-warning flex items-center gap-2">
          {syncing ? (
            <span
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
          ) : null}

          <span>
            {pending === 1
              ? "1 pendiente por sincronizar"
              : `${pending} pendientes por sincronizar`}
          </span>

          {!isOnline && (
            <span className="text-[10px] opacity-70">(sin conexión)</span>
          )}

          <button
            className="btn-ghost text-[11px] disabled:opacity-40"
            onClick={() => void triggerSync()}
            disabled={!isOnline || syncing}
            aria-label="Sincronizar registros pendientes"
          >
            Sincronizar ahora
          </button>
        </div>
      )}

      {failed > 0 && (
        <div
          className="pill border-state-critical/30 bg-state-critical/10 text-state-critical flex items-center gap-1.5"
          title="Registros rechazados permanentemente por el servidor — requieren revisión"
        >
          <span>
            {failed === 1 ? "1 rechazado" : `${failed} rechazados`}
          </span>
        </div>
      )}
    </div>
  );
}
