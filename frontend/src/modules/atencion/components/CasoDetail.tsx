// frontend/src/modules/atencion/components/CasoDetail.tsx
import { useEffect, useState, type ReactNode } from "react";

import {
  addEvento,
  asignarCaso,
  getCaso,
  listEventos,
  setCasoEstado,
  uploadCasoEvidencia,
  type Caso,
  type CasoEvento,
} from "@/api/atencion";
import { listUsers } from "@/api/users";
import { useAsync } from "@/hooks/useAsync";

interface Props {
  id: string;
  onClose: () => void;
  /** Called after a mutating action (estado/reasignar/nota) so the caller can refresh its list. */
  onChanged: () => void;
}

// Duplicated from CasosPage.tsx on purpose (mirrors the MilitantesListPage /
// MilitanteDetail convention) — importing back from CasosPage would create a
// circular module dependency since CasosPage imports this component.
const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  ATENDIDO: "Atendido",
  CERRADO: "Cerrado",
};

const ESTADO_CLASS: Record<string, string> = {
  PENDIENTE: "border-line bg-panel-hover text-ink-faint",
  EN_PROCESO: "border-accent/30 bg-accent/10 text-accent",
  ATENDIDO: "border-teal/30 bg-teal/10 text-teal",
  CERRADO: "border-line bg-panel-hover text-ink-muted",
};

const ESTADO_OPTIONS = ["PENDIENTE", "EN_PROCESO", "ATENDIDO", "CERRADO"];

const TIPO_LABEL: Record<string, string> = {
  PETICION: "Petición",
  QUEJA: "Queja",
  APOYO: "Apoyo",
  OTRO: "Otro",
};

const PRIORIDAD_CLASS: Record<string, string> = {
  ALTA: "border-state-critical/30 bg-state-critical/10 text-state-critical",
  MEDIA: "border-state-warning/30 bg-state-warning/10 text-state-warning",
  BAJA: "border-line bg-panel-hover text-ink-faint",
};

const EVENTO_TIPO_LABEL: Record<string, string> = {
  NOTA: "Nota",
  EVIDENCIA: "Evidencia",
  CAMBIO_ESTADO: "Cambio de estado",
  REASIGNACION: "Reasignación",
};

const TERMINAL_ESTADOS = new Set(["ATENDIDO", "CERRADO"]);

/** SLA semáforo — same rule as CasosPage's SlaBadge (duplicated for the same
 * circular-import reason above): vencido (red) / vence pronto (ámbar) / neutral. */
function SlaBadge({ caso }: { caso: Pick<Caso, "fecha_compromiso" | "estado"> }) {
  if (!caso.fecha_compromiso || TERMINAL_ESTADOS.has(caso.estado)) {
    return (
      <span className="pill border-line bg-panel-hover text-ink-faint">
        {caso.fecha_compromiso ?? "Sin fecha"}
      </span>
    );
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${caso.fecha_compromiso}T00:00:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) {
    return <span className="pill border-state-critical/30 bg-state-critical/10 text-state-critical">Vencido</span>;
  }
  if (diffDays <= 2) {
    return (
      <span className="pill border-state-warning/30 bg-state-warning/10 text-state-warning">
        {diffDays === 0 ? "Vence hoy" : `Vence en ${diffDays}d`}
      </span>
    );
  }
  return <span className="pill border-line bg-panel-hover text-ink-faint">{caso.fecha_compromiso}</span>;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-ink-faint">{label}</span>
      <span className="truncate text-right font-medium text-ink">{value ?? "—"}</span>
    </div>
  );
}

function EventoThumb({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="focus-ring mt-2 block w-24 overflow-hidden rounded-lg border border-line bg-bg-sunken"
    >
      <img src={url} alt="Evidencia" className="h-20 w-24 object-cover" />
    </a>
  );
}

/**
 * Right-hand slide-over with the caso's detail: header (folio/tipo/estado/
 * prioridad/SLA), masked ciudadano contact, the full historical bitácora
 * (loaded via GET /casos/{id}/eventos), and the three review actions —
 * cambiar estado (+ nota), reasignar, and agregar nota/evidencia. Every
 * mutating action reloads the bitácora (estado/asignar write their own
 * CasoEvento server-side; nota/evidencia are added directly) so newly-created
 * events show up alongside the history. All actions also call `onChanged` so
 * the inbox refreshes.
 */
export function CasoDetail({ id, onClose, onChanged }: Props) {
  const state = useAsync<Caso>(() => getCaso(id), [id]);
  const caso = state.data;

  const usersState = useAsync(() => listUsers({ limit: 200, is_active: true }), []);
  const assignableUsers = [...(usersState.data?.items ?? [])].sort((a, b) =>
    a.full_name.localeCompare(b.full_name),
  );

  const eventosState = useAsync<CasoEvento[]>(() => listEventos(id), [id]);
  // Newest first for display; the API returns oldest→newest.
  const eventos = [...(eventosState.data ?? [])].reverse();

  const [estadoSel, setEstadoSel] = useState("");
  const [notaEstado, setNotaEstado] = useState("");
  const [estadoSaving, setEstadoSaving] = useState(false);
  const [estadoError, setEstadoError] = useState<string | null>(null);

  const [asignadoSel, setAsignadoSel] = useState("");
  const [reasignando, setReasignando] = useState(false);
  const [reasignarError, setReasignarError] = useState<string | null>(null);

  const [notaTexto, setNotaTexto] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notaSaving, setNotaSaving] = useState(false);
  const [notaError, setNotaError] = useState<string | null>(null);

  // Reset ephemeral form state whenever the target caso changes (the bitácora
  // itself is refetched by eventosState's own [id] dependency).
  useEffect(() => {
    setEstadoSel("");
    setNotaEstado("");
    setEstadoError(null);
    setAsignadoSel("");
    setReasignarError(null);
    setNotaTexto("");
    setFile(null);
    setNotaError(null);
  }, [id]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleEstadoSubmit = async () => {
    const estado = estadoSel || caso?.estado;
    if (!caso || !estado) return;
    setEstadoSaving(true);
    setEstadoError(null);
    try {
      await setCasoEstado(id, estado);
      const nota = notaEstado.trim();
      if (nota) {
        await addEvento(id, { tipo: "NOTA", texto: nota });
      }
      setEstadoSel("");
      setNotaEstado("");
      state.reload();
      eventosState.reload();
      onChanged();
    } catch (e: unknown) {
      setEstadoError(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
    } finally {
      setEstadoSaving(false);
    }
  };

  const handleReasignar = async () => {
    if (!asignadoSel) return;
    setReasignando(true);
    setReasignarError(null);
    try {
      await asignarCaso(id, asignadoSel);
      setAsignadoSel("");
      state.reload();
      eventosState.reload();
      onChanged();
    } catch (e: unknown) {
      setReasignarError(e instanceof Error ? e.message : "No se pudo reasignar el caso.");
    } finally {
      setReasignando(false);
    }
  };

  const handleAddNota = async () => {
    const texto = notaTexto.trim();
    if (!texto && !file) {
      setNotaError("Agrega una nota o adjunta una evidencia.");
      return;
    }
    setNotaSaving(true);
    setNotaError(null);
    try {
      let evidenciaKey: string | undefined;
      if (file) {
        const uploaded = await uploadCasoEvidencia(id, file);
        evidenciaKey = uploaded.evidencia_key;
      }
      await addEvento(id, {
        tipo: file ? "EVIDENCIA" : "NOTA",
        texto: texto || undefined,
        evidencia_key: evidenciaKey,
      });
      setNotaTexto("");
      setFile(null);
      state.reload();
      eventosState.reload();
      onChanged();
    } catch (e: unknown) {
      setNotaError(e instanceof Error ? e.message : "No se pudo agregar la nota/evidencia.");
    } finally {
      setNotaSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Detalle de caso">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="animate-fade-up panel-raised absolute right-0 top-0 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line shadow-panel">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="eyebrow text-accent">Caso</div>
            <div className="mt-0.5 truncate font-display text-lg font-semibold leading-tight text-ink">
              {caso?.titulo ?? (state.loading ? "Cargando…" : "—")}
            </div>
            {caso && (
              <span className="mt-1.5 inline-flex rounded-md border border-line bg-bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                {caso.folio}
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

          {state.error && (
            <div className="card-premium flex flex-col items-center gap-3 px-4 py-6 text-center">
              <p className="text-sm text-ink-muted">{state.error}</p>
              <button type="button" className="btn-ghost" onClick={state.reload}>
                Reintentar
              </button>
            </div>
          )}

          {caso && (
            <>
              {/* Header pills: estado / tipo / prioridad / SLA */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-3">
                <span className={`pill ${ESTADO_CLASS[caso.estado] ?? ""}`}>
                  {ESTADO_LABEL[caso.estado] ?? caso.estado}
                </span>
                <span className="pill border-line bg-panel-hover text-ink-muted">
                  {TIPO_LABEL[caso.tipo] ?? caso.tipo}
                </span>
                <span className={`pill ${PRIORIDAD_CLASS[caso.prioridad] ?? "border-line bg-panel-hover text-ink-faint"}`}>
                  {caso.prioridad}
                </span>
                <SlaBadge caso={caso} />
              </div>

              <dl className="mt-3 divide-y divide-line/60">
                <Field label="Ciudadano" value={caso.ciudadano_nombre} />
                <Field label="Contacto" value={<span className="font-mono">{caso.contacto_masked ?? "—"}</span>} />
                <Field label="Sección" value={caso.seccion} />
                <Field label="Colonia" value={caso.colonia} />
                <Field label="Canal" value={caso.channel} />
                <Field label="Compromiso" value={caso.fecha_compromiso} />
                <Field label="Asignado a" value={caso.asignado_nombre ?? "Sin asignar"} />
              </dl>

              {/* Bitácora timeline (full history, newest first) */}
              <div className="mt-4 border-t border-line pt-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Bitácora</p>
                {eventosState.loading && (
                  <div className="mt-2 animate-pulse space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-10 rounded bg-panel-hover" />
                    ))}
                  </div>
                )}
                {eventosState.error && !eventosState.loading && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-state-critical">{eventosState.error}</p>
                    <button type="button" className="btn-ghost text-xs" onClick={eventosState.reload}>
                      Reintentar
                    </button>
                  </div>
                )}
                {!eventosState.loading && !eventosState.error && eventos.length === 0 && (
                  <p className="mt-2 text-sm text-ink-faint">Sin eventos registrados todavía.</p>
                )}
                {!eventosState.loading && !eventosState.error && eventos.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {eventos.map((evento) => (
                      <li key={evento.id} className="card-premium p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-ink">
                            {EVENTO_TIPO_LABEL[evento.tipo] ?? evento.tipo}
                          </span>
                          <span className="font-mono text-[10px] text-ink-faint">
                            {new Date(evento.created_at).toLocaleString([], {
                              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {evento.texto && <p className="mt-1 text-sm text-ink-muted">{evento.texto}</p>}
                        {evento.evidencia_url && <EventoThumb url={evento.evidencia_url} />}
                        {evento.actor_nombre && (
                          <p className="mt-1 text-[11px] text-ink-faint">{evento.actor_nombre}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Cambiar estado */}
              <div className="mt-4 border-t border-line pt-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Cambiar estado</p>
                {estadoError && <p className="mt-2 text-xs text-state-critical">{estadoError}</p>}
                <div className="mt-2 flex flex-col gap-2">
                  <select
                    value={estadoSel || caso.estado}
                    onChange={(e) => setEstadoSel(e.target.value)}
                    className="field-input focus-ring w-full"
                  >
                    {ESTADO_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {ESTADO_LABEL[o]}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={notaEstado}
                    onChange={(e) => setNotaEstado(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder="Nota (opcional)…"
                    className="field-input focus-ring w-full resize-none"
                  />
                  <button
                    type="button"
                    className="btn-primary focus-ring self-end disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={handleEstadoSubmit}
                    disabled={estadoSaving || (!estadoSel && !notaEstado.trim())}
                  >
                    {estadoSaving ? "Guardando…" : "Guardar estado"}
                  </button>
                </div>
              </div>

              {/* Reasignar */}
              <div className="mt-4 border-t border-line pt-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Reasignar</p>
                {reasignarError && <p className="mt-2 text-xs text-state-critical">{reasignarError}</p>}
                <div className="mt-2 flex flex-col gap-2">
                  <select
                    value={asignadoSel}
                    onChange={(e) => setAsignadoSel(e.target.value)}
                    className="field-input focus-ring w-full"
                  >
                    <option value="">Selecciona una persona…</option>
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-ghost focus-ring self-end disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={handleReasignar}
                    disabled={reasignando || !asignadoSel}
                  >
                    {reasignando ? "Reasignando…" : "Reasignar"}
                  </button>
                </div>
              </div>

              {/* Agregar nota / evidencia */}
              <div className="mt-4 border-t border-line pt-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Agregar nota / evidencia</p>
                {notaError && <p className="mt-2 text-xs text-state-critical">{notaError}</p>}
                <div className="mt-2 flex flex-col gap-2">
                  <textarea
                    value={notaTexto}
                    onChange={(e) => setNotaTexto(e.target.value)}
                    rows={2}
                    maxLength={2000}
                    placeholder="Nota…"
                    className="field-input focus-ring w-full resize-none"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="text-xs text-ink-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-panel-hover file:px-3 file:py-1.5 file:text-xs file:text-ink-muted"
                  />
                  <button
                    type="button"
                    className="btn-primary focus-ring self-end disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={handleAddNota}
                    disabled={notaSaving || (!notaTexto.trim() && !file)}
                  >
                    {notaSaving ? "Guardando…" : "Agregar"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CasoDetail;
