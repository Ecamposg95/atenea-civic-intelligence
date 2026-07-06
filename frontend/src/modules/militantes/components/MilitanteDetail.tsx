// frontend/src/modules/militantes/components/MilitanteDetail.tsx
import { useEffect, useState, type ReactNode } from "react";

import {
  getMilitante,
  revealMilitante,
  setEstado,
  type Militante,
  type MilitanteEstado,
  type QualityFlags,
  type Reveal,
} from "@/api/militantes";
import { useAsync } from "@/hooks/useAsync";
import { useAuthStore } from "@/store/authStore";

interface Props {
  id: string;
  onClose: () => void;
  /** Called after a mutating action (validar/observar) so the caller can refresh its list. */
  onChanged: () => void;
}

const ESTADO_CLASS: Record<MilitanteEstado, string> = {
  REGISTRADO: "border-line bg-panel-hover text-ink-muted",
  VALIDADO: "border-state-ok/30 bg-state-ok/10 text-state-ok",
  OBSERVADO: "border-state-warning/30 bg-state-warning/10 text-state-warning",
};

const ESTADO_LABEL: Record<MilitanteEstado, string> = {
  REGISTRADO: "Registrado",
  VALIDADO: "Validado",
  OBSERVADO: "Observado",
};

type FlagKey = keyof QualityFlags;

const FLAG_LABEL: Record<FlagKey, string> = {
  falta_curp: "Falta CURP",
  falta_foto_frente: "Falta foto (frente)",
  falta_foto_reverso: "Falta foto (reverso)",
  falta_firma: "Falta firma",
  clave_incompleta: "Clave incompleta",
  posible_duplicado: "Posible duplicado",
};

const FLAG_CRITICAL: Partial<Record<FlagKey, true>> = {
  posible_duplicado: true,
};

/** Roles at/above COORDINADOR in the hierarchy — the only ones allowed to
 * reveal PII and validate/observe. The backend re-enforces this (403); the
 * UI only hides the affordance. */
const MANAGER_ROLES = new Set(["coordinador", "admin", "superadmin"]);

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-ink-faint">{label}</span>
      <span className="truncate text-right font-medium text-ink">{value ?? "—"}</span>
    </div>
  );
}

function DocTile({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="focus-ring block overflow-hidden rounded-lg border border-line bg-bg-sunken"
        >
          <img src={url} alt={label} className="h-24 w-full object-cover" />
        </a>
      ) : (
        <div className="grid h-24 place-items-center rounded-lg border border-dashed border-line text-[11px] text-ink-faint">
          No disponible
        </div>
      )}
    </div>
  );
}

/**
 * Right-hand slide-over with the militante's detail: masked fields by
 * default, an audited "Ver documentos / datos" reveal, and validar/observar
 * actions for COORDINADOR+ roles. Revealed PII lives only in this
 * component's local state — never lifted, never cached.
 */
export function MilitanteDetail({ id, onClose, onChanged }: Props) {
  const role = useAuthStore((s) => s.user?.role);
  const canManage = Boolean(role && MANAGER_ROLES.has(role));

  const state = useAsync<Militante>(() => getMilitante(id), [id]);
  const militante = state.data;

  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [observando, setObservando] = useState(false);
  const [observacion, setObservacion] = useState("");

  // Reset ephemeral reveal/observe state whenever the target militante changes.
  useEffect(() => {
    setReveal(null);
    setRevealError(null);
    setObservando(false);
    setObservacion("");
    setActionError(null);
  }, [id]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleReveal = async () => {
    if (!canManage || !militante) return;
    const confirmed = window.confirm(
      `¿Confirma revelar CURP, clave de elector y documentos de ${militante.nombre_completo}?\nEsta acción queda registrada en la bitácora de auditoría.`,
    );
    if (!confirmed) return;

    setRevealing(true);
    setRevealError(null);
    try {
      const res = await revealMilitante(id);
      setReveal(res);
    } catch (e: unknown) {
      setRevealError(
        e instanceof Error ? e.message : "No se pudieron revelar los datos.",
      );
    } finally {
      setRevealing(false);
    }
  };

  const handleValidar = async () => {
    if (!canManage) return;
    setActing(true);
    setActionError(null);
    try {
      await setEstado(id, "VALIDADO");
      state.reload();
      onChanged();
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : "No se pudo validar el militante.",
      );
    } finally {
      setActing(false);
    }
  };

  const handleObservarConfirm = async () => {
    if (!canManage) return;
    setActing(true);
    setActionError(null);
    try {
      await setEstado(id, "OBSERVADO", observacion.trim() || undefined);
      setObservando(false);
      setObservacion("");
      state.reload();
      onChanged();
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : "No se pudo observar el militante.",
      );
    } finally {
      setActing(false);
    }
  };

  const activeFlags = militante?.quality_flags
    ? (Object.keys(militante.quality_flags) as FlagKey[]).filter(
        (k) => militante.quality_flags?.[k],
      )
    : [];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Detalle de militante">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="animate-fade-up panel-raised absolute right-0 top-0 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line shadow-panel">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="eyebrow text-accent">Militante</div>
            <div className="mt-0.5 truncate font-display text-lg font-semibold leading-tight text-ink">
              {militante?.nombre_completo ?? (state.loading ? "Cargando…" : "—")}
            </div>
            {militante && (
              <span className="mt-1.5 inline-flex rounded-md border border-line bg-bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                {militante.folio}
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

          {militante && (
            <>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className={`pill ${ESTADO_CLASS[militante.estado] ?? ""}`}>
                  {ESTADO_LABEL[militante.estado] ?? militante.estado}
                </span>
                {activeFlags.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    {activeFlags.map((k) => (
                      <span
                        key={k}
                        title={FLAG_LABEL[k]}
                        className={`pill items-center gap-1.5 border-transparent px-2 py-0.5 text-[10px] ${
                          FLAG_CRITICAL[k]
                            ? "bg-state-critical/10 text-state-critical"
                            : "bg-state-warning/10 text-state-warning"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            FLAG_CRITICAL[k] ? "bg-state-critical" : "bg-state-warning"
                          }`}
                        />
                        {FLAG_LABEL[k]}
                      </span>
                    ))}
                  </span>
                )}
              </div>

              <dl className="mt-3 divide-y divide-line/60">
                <Field label="Sección" value={militante.seccion} />
                <Field label="Teléfono" value={militante.telefono} />
                <Field label="Colonia" value={militante.colonia} />
                <Field label="Municipio" value={militante.municipio} />
                <Field label="Estructura" value={militante.estructura} />
                <Field
                  label="Activista"
                  value={militante.activista_nombre ?? (militante.es_activista ? "Es activista" : "—")}
                />
                <Field label="Fecha de afiliación" value={militante.fecha_afiliacion} />
                <Field label="CURP" value={<span className="font-mono">{militante.curp_masked ?? "—"}</span>} />
                <Field label="Clave de elector" value={<span className="font-mono">{militante.clave_masked ?? "—"}</span>} />
              </dl>

              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <span className={`pill ${militante.tiene_frente ? "border-state-ok/30 bg-state-ok/10 text-state-ok" : "text-ink-faint"}`}>
                  Frente {militante.tiene_frente ? "✓" : "✗"}
                </span>
                <span className={`pill ${militante.tiene_reverso ? "border-state-ok/30 bg-state-ok/10 text-state-ok" : "text-ink-faint"}`}>
                  Reverso {militante.tiene_reverso ? "✓" : "✗"}
                </span>
                <span className={`pill ${militante.tiene_firma ? "border-state-ok/30 bg-state-ok/10 text-state-ok" : "text-ink-faint"}`}>
                  Firma {militante.tiene_firma ? "✓" : "✗"}
                </span>
              </div>

              {/* Reveal (audited) */}
              {canManage && (
                <div className="mt-4 border-t border-line pt-4">
                  {!reveal ? (
                    <button
                      type="button"
                      onClick={handleReveal}
                      disabled={revealing}
                      className="btn-ghost focus-ring w-full disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {revealing ? "Revelando…" : "Ver documentos / datos"}
                    </button>
                  ) : (
                    <div className="card-premium p-3 ring-1 ring-inset ring-state-critical/20">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-state-critical">
                          Datos sensibles — acceso auditado
                        </p>
                        <button
                          type="button"
                          onClick={() => setReveal(null)}
                          className="focus-ring rounded px-1 text-[11px] text-ink-faint hover:text-ink"
                        >
                          Ocultar
                        </button>
                      </div>
                      <dl className="mt-2 space-y-1">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <dt className="text-ink-faint">CURP</dt>
                          <dd className="select-all break-all font-mono text-ink">
                            {reveal.curp ?? "—"}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <dt className="text-ink-faint">Clave de elector</dt>
                          <dd className="select-all break-all font-mono text-ink">
                            {reveal.clave_elector ?? "—"}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <DocTile label="Frente" url={reveal.frente_url} />
                        <DocTile label="Reverso" url={reveal.reverso_url} />
                        <DocTile label="Firma" url={reveal.firma_url} />
                      </div>
                    </div>
                  )}
                  {revealError && (
                    <p className="mt-2 text-xs text-state-critical">{revealError}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        {canManage && militante && (
          <div className="border-t border-line px-5 py-4">
            {actionError && (
              <p className="mb-2 text-xs text-state-critical">{actionError}</p>
            )}
            {observando ? (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                    Observación (opcional)
                  </span>
                  <textarea
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Motivo de la observación…"
                    className="field-input focus-ring w-full resize-none"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn-ghost focus-ring"
                    onClick={() => {
                      setObservando(false);
                      setObservacion("");
                    }}
                    disabled={acting}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-primary focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={handleObservarConfirm}
                    disabled={acting}
                  >
                    {acting ? "Guardando…" : "Confirmar observación"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setObservando(true)}
                  disabled={acting || militante.estado === "OBSERVADO"}
                >
                  Observar
                </button>
                <button
                  type="button"
                  className="btn-primary focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={handleValidar}
                  disabled={acting || militante.estado === "VALIDADO"}
                >
                  {acting ? "Guardando…" : "Validar"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MilitanteDetail;
