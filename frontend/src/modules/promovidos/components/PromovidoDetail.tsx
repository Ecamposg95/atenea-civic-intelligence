import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { revelarClave } from "@/api/admin";
import { getRegistroDetalle, type Promovido } from "@/api/promovidos";
import { DataState } from "@/components/ui/DataState";
import { useAsync } from "@/hooks/useAsync";
import { useAuthStore } from "@/store/authStore";

import { BTN_GHOST, LegacyBadge, TipoBadge, cadenaDe, fmtFecha } from "./personaUi";

interface Props {
  promovido: Promovido;
  onClose: () => void;
}

const prioLabel = (p: string | null | undefined) =>
  p ? p.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "—";

function Field({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{value ?? "—"}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line/70 px-5 py-4 first:border-t-0">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
    </section>
  );
}

type Reveal = { clave: string; curp: string | null };

export function PromovidoDetail({ promovido: p, onClose }: Props) {
  const state = useAsync(() => getRegistroDetalle(p.id), [p.id]);
  const d = state.data;

  const role = useAuthStore((s) => s.user?.role);
  const canReveal = role === "superadmin" || role === "admin" || role === "coordinador";

  // Revealed PII lives only here and disappears with the drawer.
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  async function doReveal() {
    setRevealing(true);
    setRevealError(null);
    try {
      const r = await revelarClave(p.id);
      setReveal({ clave: r.clave_elector, curp: r.curp ?? null });
    } catch (e) {
      const status = (e as { status?: number }).status;
      setRevealError(status === 422 ? "Esta persona no tiene clave guardada." : "No se pudo revelar.");
    } finally {
      setRevealing(false);
    }
  }

  // Dialog focus: move in on open, Escape closes, focus returns to the trigger.
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  const tipo = d?.tipo ?? p.tipo;
  const legacy = d?.legacy ?? p.legacy;
  const tieneGente = tipo === "LIDER" || tipo === "ACTIVISTA";
  const nombre = d?.nombre_completo ?? p.nombre_completo;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="ficha-titulo">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="animate-fade-up panel-raised absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col overflow-y-auto rounded-t-2xl border-t border-line shadow-panel sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-panel-raised px-5 py-4">
          <div className="min-w-0">
            <h2 id="ficha-titulo" className="font-display text-lg font-bold text-ink">{nombre}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <TipoBadge tipo={tipo} />
              {legacy && <LegacyBadge />}
              <span>Sección {p.seccion ?? "—"}</span>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar ficha"
            className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-panel-hover hover:text-ink">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <DataState loading={state.loading} error={state.error} onRetry={state.reload}>
          {d && (
            <>
              <Group title="Persona">
                <Field label="Apellido paterno" value={d.apellido_paterno} />
                <Field label="Apellido materno" value={d.apellido_materno} />
                <Field label="Nombre(s)" value={d.nombres ?? (d.apellido_paterno ? null : d.nombre_completo)} />
                <Field label="Edad" value={d.edad != null ? `${d.edad} años` : "—"} />
              </Group>

              <Group title="Contacto y domicilio">
                <Field label="Teléfono" value={d.telefono} />
                <Field label="Barrio o colonia" value={d.colonia} />
                <Field label="Domicilio" value={d.direccion} wide />
              </Group>

              <Group title="Cadena">
                <Field label={tipo === "PROMOVIDO" ? "Activista" : tipo === "ACTIVISTA" ? "Líder" : "Depende de"}
                  value={cadenaDe({ padre_nombre: d.padre_nombre ?? p.padre_nombre, promotor: d.promotor })} />
                <Field label="Capturó" value={d.activista_nombre} />
                <Field label="Fecha de captura" value={fmtFecha(d.created_at)} />
                {tieneGente && !legacy && (
                  <div className="col-span-2">
                    <Link
                      to={`/promovidos?padre_id=${encodeURIComponent(p.id)}&padre_nombre=${encodeURIComponent(nombre)}`}
                      onClick={onClose}
                      className={BTN_GHOST}>
                      Ver su gente ({tipo === "LIDER" ? "activistas" : "promovidos"})
                    </Link>
                  </div>
                )}
              </Group>

              <Group title="Territorio">
                <Field label="Sección" value={d.seccion} />
                <Field label="Prioridad" value={prioLabel(p.prioridad)} />
                <Field label="Participación 2024" value={p.participacion != null ? `${p.participacion}%` : "—"} />
                <Field label="Margen 2024" value={p.margen != null ? (p.margen >= 0 ? `+${p.margen}` : `${p.margen}`) : "—"} />
              </Group>

              <Group title="Credencial">
                <Field label="Clave de elector" value={
                  <span className={`font-mono ${reveal ? "text-ink" : "text-ink-muted"}`}>{reveal?.clave ?? d.clave_masked ?? "—"}</span>
                } wide />
                <Field label="CURP" value={
                  <span className={`font-mono ${reveal?.curp ? "text-ink" : "text-ink-muted"}`}>{reveal?.curp ?? d.curp_masked ?? "—"}</span>
                } wide />
                <Field label="Consentimiento" value={d.consentimiento ? `Sí, ${fmtFecha(d.consentimiento_at)}` : "No"} wide />
                {canReveal && d.clave_masked && !reveal && (
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <button type="button" onClick={() => void doReveal()} disabled={revealing} className={BTN_GHOST}>
                      {revealing ? "Revelando…" : d.curp_masked ? "Revelar clave y CURP" : "Revelar clave"}
                    </button>
                    <p className="text-xs text-ink-muted">Cada consulta queda registrada en la bitácora de auditoría.</p>
                  </div>
                )}
                {reveal && (
                  <p className="col-span-2 text-xs text-ink-muted">Consulta registrada en la bitácora. Al cerrar la ficha se oculta.</p>
                )}
                {revealError && <p role="alert" className="col-span-2 text-sm text-state-critical">{revealError}</p>}
              </Group>

              {d.observacion && (
                <Group title="Observaciones">
                  <Field label="Nota" value={<span className="whitespace-pre-wrap">{d.observacion}</span>} wide />
                </Group>
              )}
            </>
          )}
        </DataState>
      </div>
    </div>
  );
}
