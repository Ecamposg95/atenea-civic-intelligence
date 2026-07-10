// frontend/src/modules/scrum/TableroPage.tsx
import { useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { useAsync } from "@/hooks/useAsync";
import { getTablero, moverEstado, type Board, type WorkItem } from "@/api/scrum";

import { WorkItemDetail } from "./WorkItemDetail";

type ColKey = "POR_HACER" | "EN_CURSO" | "HECHO";

const COLS: { key: ColKey; label: string }[] = [
  { key: "POR_HACER", label: "Por hacer" },
  { key: "EN_CURSO", label: "En curso" },
  { key: "HECHO", label: "Hecho" },
];

const TIPO_LABEL: Record<string, string> = { HISTORIA: "Historia", TAREA: "Tarea", BUG: "Incidencia" };
const PRIORIDAD_CLASS: Record<string, string> = {
  ALTA: "border-state-critical/30 bg-state-critical/10 text-state-critical",
  MEDIA: "border-amber/30 bg-amber/10 text-amber",
  BAJA: "border-line bg-panel-hover text-ink-faint",
};

function WorkItemCard({
  wi,
  onMove,
  onOpen,
}: {
  wi: WorkItem;
  onMove: (estado: ColKey) => void;
  onOpen: () => void;
}) {
  return (
    <div className="mb-2.5 rounded-card border border-line bg-panel-hover p-3 transition-colors hover:border-accent/40">
      <button type="button" onClick={onOpen} className="focus-ring block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-ink">{wi.titulo}</p>
          <span
            className={`pill shrink-0 ${PRIORIDAD_CLASS[wi.prioridad] ?? "border-line bg-panel-hover text-ink-faint"}`}
          >
            {wi.prioridad}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-faint">
          <span className="pill border-line bg-panel-raised text-ink-muted">
            {TIPO_LABEL[wi.tipo] ?? wi.tipo}
          </span>
          <span>{wi.story_points ?? "–"} esf.</span>
          <span>{wi.responsable_nombre ?? "Sin asignar"}</span>
          <span className="font-mono">
            {wi.tareas_hechas}/{wi.tareas_total} tareas
          </span>
        </div>
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {COLS.filter((c) => c.key !== wi.estado).map((c) => (
          <button
            key={c.key}
            type="button"
            className="btn-ghost focus-ring px-2 py-1 text-[11px]"
            onClick={() => onMove(c.key)}
          >
            → {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Kanban tablero of the campaign's ACTIVO sprint (3 columns: por hacer / en
 * curso / hecho). Move buttons call `moverEstado` and reload; the backend
 * enforces that only the item's responsable or a coordinador may move it
 * (403 surfaces as a banner instead of failing silently). A card click opens
 * the WorkItemDetail drawer. No active sprint → empty state.
 */
export function TableroPage() {
  const state = useAsync<Board>(() => getTablero(), []);
  const board = state.data;

  const [moveError, setMoveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function mover(id: string, estado: ColKey) {
    setMoveError(null);
    try {
      await moverEstado(id, estado);
      state.reload();
    } catch (e: unknown) {
      const status = (e as Error & { status?: number }).status;
      setMoveError(
        status === 403
          ? "Solo el responsable o un coordinador puede mover esta tarjeta."
          : e instanceof Error
            ? e.message
            : "No se pudo mover la tarjeta.",
      );
    }
  }

  return (
    <AppLayout title="Tablero" crumb="Ciudadanía">
      <PageHeader
        eyebrow="Ciudadanía"
        title="Tablero"
        accent="Scrum"
        subtitle={
          board?.sprint
            ? `Ciclo activo: ${board.sprint.nombre}`
            : "Sigue el avance del ciclo activo, columna por columna."
        }
      />

      {moveError && (
        <div className="card-premium mb-4 px-3.5 py-2.5 text-sm text-state-critical">{moveError}</div>
      )}

      <DataState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
        isEmpty={!state.loading && !state.error && !board?.sprint}
        emptyMessage="No hay ciclo activo."
        skeleton={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card-premium p-3">
                <SkeletonRows rows={4} />
              </div>
            ))}
          </div>
        }
      >
        {board?.sprint && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {COLS.map((c) => (
              <div key={c.key} className="card-premium p-3.5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{c.label}</h3>
                  <span className="pill border-line bg-panel-hover text-ink-faint">{board[c.key].length}</span>
                </div>
                {board[c.key].length === 0 ? (
                  <p className="text-sm text-ink-faint">Sin tarjetas.</p>
                ) : (
                  board[c.key].map((wi) => (
                    <WorkItemCard
                      key={wi.id}
                      wi={wi}
                      onMove={(estado) => mover(wi.id, estado)}
                      onOpen={() => setSelectedId(wi.id)}
                    />
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </DataState>

      {selectedId && (
        <WorkItemDetail id={selectedId} onClose={() => setSelectedId(null)} onChanged={state.reload} />
      )}
    </AppLayout>
  );
}

export default TableroPage;
