// frontend/src/modules/scrum/WorkItemDetail.tsx
import { useEffect, useState } from "react";

import { useAsync } from "@/hooks/useAsync";
import { SCRUM_GOV } from "@/modules/registry";
import { useAuthStore } from "@/store/authStore";
import { listUsers } from "@/api/users";
import {
  addTask,
  getWorkitem,
  listSprints,
  updateTask,
  updateWorkitem,
  type Task,
  type WorkItem,
  type WorkItemPatch,
} from "@/api/scrum";

interface Props {
  id: string;
  onClose: () => void;
  /** Called after a mutating action so the caller (Tablero/Backlog) can refresh its list. */
  onChanged: () => void;
}

const TIPO_LABEL: Record<string, string> = { HISTORIA: "Historia", TAREA: "Tarea", BUG: "Incidencia" };
const ESTADO_LABEL: Record<string, string> = { POR_HACER: "Por hacer", EN_CURSO: "En curso", HECHO: "Hecho" };
const PRIORIDAD_LABEL: Record<string, string> = { ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" };
const PRIORIDAD_CLASS: Record<string, string> = {
  ALTA: "border-state-critical/30 bg-state-critical/10 text-state-critical",
  MEDIA: "border-amber/30 bg-amber/10 text-amber",
  BAJA: "border-line bg-panel-hover text-ink-faint",
};
const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];

/**
 * WorkItem detail drawer — historia fields (editable estimate/responsable/
 * sprint for coordinador/admin — mirrors the backend's scrum._GOV tier), a
 * checklist of tareas anyone in the read tier can toggle (ownership enforced
 * server-side; a 403 surfaces inline instead of failing silently), and a
 * "convertido desde acuerdo" badge when `origin_acuerdo_id` is set. Opened
 * from Tablero/Backlog as a right-side drawer — mirrors
 * atencion/components/CasoDetail.tsx's overlay + panel structure.
 */
export function WorkItemDetail({ id, onClose, onChanged }: Props) {
  const role = useAuthStore((s) => s.user?.role);
  const canGovern = role ? SCRUM_GOV.includes(role) : false;

  const state = useAsync<WorkItem>(() => getWorkitem(id), [id]);
  const wi = state.data;

  const usersState = useAsync(() => listUsers({ limit: 200, is_active: true }), []);
  const assignableUsers = [...(usersState.data?.items ?? [])].sort((a, b) =>
    a.full_name.localeCompare(b.full_name),
  );
  const sprintsState = useAsync(() => listSprints({ limit: 200, offset: 0 }), []);
  const sprints = sprintsState.data?.items ?? [];

  const [fieldError, setFieldError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [savingField, setSavingField] = useState(false);

  // Reset ephemeral form/error state whenever the target workitem changes.
  useEffect(() => {
    setFieldError(null);
    setTaskError(null);
    setNewTask("");
  }, [id]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function patchField(patch: WorkItemPatch) {
    setSavingField(true);
    setFieldError(null);
    try {
      await updateWorkitem(id, patch);
      state.reload();
      onChanged();
    } catch (e: unknown) {
      setFieldError(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
    } finally {
      setSavingField(false);
    }
  }

  async function toggleTask(task: Task) {
    setTaskError(null);
    try {
      await updateTask(id, task.id, { done: !task.done });
      state.reload();
      onChanged();
    } catch (e: unknown) {
      const status = (e as Error & { status?: number }).status;
      setTaskError(
        status === 403
          ? "Solo el responsable o un coordinador puede editar esta tarea."
          : e instanceof Error
            ? e.message
            : "No se pudo actualizar la tarea.",
      );
    }
  }

  async function submitNewTask() {
    const texto = newTask.trim();
    if (!texto) return;
    setAddingTask(true);
    setTaskError(null);
    try {
      await addTask(id, { texto });
      setNewTask("");
      state.reload();
      onChanged();
    } catch (e: unknown) {
      setTaskError(e instanceof Error ? e.message : "No se pudo agregar la tarea.");
    } finally {
      setAddingTask(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Detalle de historia">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="animate-fade-up panel-raised absolute right-0 top-0 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line shadow-panel">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="eyebrow text-accent">{wi ? TIPO_LABEL[wi.tipo] ?? wi.tipo : "Historia"}</div>
            <div className="mt-0.5 truncate font-display text-lg font-semibold leading-tight text-ink">
              {wi?.titulo ?? (state.loading ? "Cargando…" : "—")}
            </div>
            {wi?.origin_acuerdo_id && (
              <span className="mt-1.5 inline-flex rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent">
                Convertido desde acuerdo
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="focus-ring shrink-0 rounded-md px-1 text-ink-faint transition-colors hover:bg-panel-hover hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 px-5 py-4">
          {state.loading && (
            <div className="animate-pulse space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-4 rounded bg-panel-hover" />
              ))}
            </div>
          )}

          {state.error && <p className="text-sm text-state-critical">{state.error}</p>}

          {wi && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap gap-1.5">
                <span className="pill border-line bg-panel-hover text-ink-faint">
                  {ESTADO_LABEL[wi.estado] ?? wi.estado}
                </span>
                <span className={`pill ${PRIORIDAD_CLASS[wi.prioridad] ?? "border-line bg-panel-hover text-ink-faint"}`}>
                  {PRIORIDAD_LABEL[wi.prioridad] ?? wi.prioridad}
                </span>
              </div>

              {wi.descripcion && <p className="text-sm text-ink-muted">{wi.descripcion}</p>}

              {fieldError && <p className="text-sm text-state-critical">{fieldError}</p>}

              <dl className="divide-y divide-line/60">
                <div className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-ink-faint">
                    Esfuerzo{" "}
                    {canGovern && (
                      <span className="text-[11px] font-normal normal-case text-ink-faint/70">(dificultad 1-21)</span>
                    )}
                  </span>
                  {canGovern ? (
                    <select
                      className="field-input focus-ring h-9 w-28 text-sm"
                      value={wi.story_points ?? ""}
                      disabled={savingField}
                      title="Esfuerzo (dificultad 1-21)"
                      onChange={(e) =>
                        patchField({ story_points: e.target.value === "" ? null : Number(e.target.value) })
                      }
                    >
                      <option value="">Sin estimar</option>
                      {FIBONACCI.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-mono text-ink">{wi.story_points ?? "–"}</span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-ink-faint">Responsable</span>
                  {canGovern ? (
                    <select
                      className="field-input focus-ring h-9 w-44 text-sm"
                      value={wi.responsable_id ?? ""}
                      disabled={savingField}
                      onChange={(e) => patchField({ responsable_id: e.target.value || null })}
                    >
                      <option value="">Sin asignar</option>
                      {assignableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-ink">{wi.responsable_nombre ?? "Sin asignar"}</span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-ink-faint">Ciclo</span>
                  {canGovern ? (
                    <select
                      className="field-input focus-ring h-9 w-44 text-sm"
                      value={wi.sprint_id ?? ""}
                      disabled={savingField}
                      onChange={(e) => patchField({ sprint_id: e.target.value || null })}
                    >
                      <option value="">Pendientes</option>
                      {sprints.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-ink">
                      {sprints.find((s) => s.id === wi.sprint_id)?.nombre ?? (wi.sprint_id ? "—" : "Pendientes")}
                    </span>
                  )}
                </div>
              </dl>

              <div className="border-t border-line pt-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                  Tareas ({wi.tareas_hechas}/{wi.tareas_total})
                </p>

                {taskError && <p className="mt-2 text-sm text-state-critical">{taskError}</p>}

                {wi.tareas.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-faint">Sin tareas todavía.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {wi.tareas.map((t) => (
                      <li key={t.id} className="flex items-start gap-2 rounded-card bg-panel-hover px-2.5 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={t.done}
                          onChange={() => toggleTask(t)}
                          className="mt-0.5 accent-[rgb(var(--c-warm))]"
                        />
                        <span className={t.done ? "text-ink-faint line-through" : "text-ink"}>{t.texto}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {canGovern && (
                  <div className="mt-3 flex gap-2">
                    <input
                      className="field-input focus-ring h-9 flex-1 text-sm"
                      value={newTask}
                      onChange={(e) => setNewTask(e.target.value)}
                      placeholder="Nueva tarea…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitNewTask();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={addingTask || !newTask.trim()}
                      onClick={submitNewTask}
                    >
                      {addingTask ? "…" : "Agregar"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WorkItemDetail;
