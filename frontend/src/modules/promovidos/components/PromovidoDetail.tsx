import { useEffect, useState, type ReactNode } from "react";

import { DataState } from "@/components/ui/DataState";
import { useAsync } from "@/hooks/useAsync";
import { getRegistroDetalle, type Promovido } from "@/api/promovidos";
import { revelarClave } from "@/api/admin";
import { useAuthStore } from "@/store/authStore";

interface Props {
  promovido: Promovido;
  onClose: () => void;
}

const fmtFecha = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
};

const PRIORIDAD_TONE: Record<string, string> = {
  DEFENDER_EXPANDIR: "text-state-ok bg-state-ok/12",
  COMPETITIVA: "text-warm bg-warm/14",
  RECUPERAR_OPOSICION: "text-amber bg-amber/15",
  ALTA_PERSUADIBLE: "text-accent bg-accent/12",
};
const prioLabel = (p: string | null | undefined) =>
  (p ?? "—").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value ?? "—"}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line/70 px-5 py-4 first:border-t-0">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
    </section>
  );
}

export function PromovidoDetail({ promovido: p, onClose }: Props) {
  const state = useAsync(() => getRegistroDetalle(p.id), [p.id]);
  const d = state.data;

  const role = useAuthStore((s) => s.user?.role);
  const canReveal = role === "superadmin" || role === "admin" || role === "coordinador";

  const [clave, setClave] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState(false);

  async function reveal() {
    setRevealing(true);
    setRevealError(false);
    try {
      setClave((await revelarClave(p.id)).clave_elector);
    } catch {
      setRevealError(true);
    } finally {
      setRevealing(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Detalle de promovido">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-fade-up panel-raised absolute right-0 top-0 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line shadow-panel">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-panel-raised px-5 py-4">
          <div className="min-w-0">
            <div className="eyebrow">Promovido</div>
            <h2 className="truncate font-display text-lg font-bold text-ink">{p.nombre_completo}</h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-ink-faint">
              <span>Sección {p.seccion ?? "—"}</span>
              {p.prioridad && (
                <span className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold ${PRIORIDAD_TONE[p.prioridad] ?? "text-ink-muted bg-line/60"}`}>
                  {prioLabel(p.prioridad)}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-ink-faint hover:bg-panel-hover hover:text-ink">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <DataState loading={state.loading} error={state.error} onRetry={state.reload}>
          {d && (
            <>
              <Group title="Persona">
                <Field label="Nombre" value={d.nombre_completo} />
                <Field label="Sexo" value={d.sexo} />
                <Field label="Edad" value={d.edad != null ? `${d.edad} años` : "—"} />
              </Group>
              <Group title="Contacto y domicilio">
                <Field label="Teléfono" value={d.telefono} />
                <Field label="Colonia" value={d.colonia} />
                <Field label="Dirección" value={<span className="col-span-2">{d.direccion ?? "—"}</span>} />
              </Group>
              <Group title="Territorio · contexto electoral 2024">
                <Field label="Sección" value={d.seccion} />
                <Field label="Prioridad" value={prioLabel(p.prioridad)} />
                <Field label="Participación" value={p.participacion != null ? `${p.participacion}%` : "—"} />
                <Field label="Margen (coal.−Morena)" value={p.margen != null ? (p.margen >= 0 ? `+${p.margen}` : `${p.margen}`) : "—"} />
              </Group>
              <Group title="Captura">
                <Field label="Promotor" value={d.promotor} />
                <Field label="Capturó" value={d.activista_nombre} />
                <Field label="Estructura" value={d.estructura} />
                <Field label="Área" value={d.area} />
                <Field label="Fecha de captura" value={fmtFecha(d.created_at)} />
              </Group>
              <Group title="Consentimiento y credencial">
                <Field label="Consentimiento" value={d.consentimiento ? "Sí" : "No"} />
                <Field label="Fecha consentimiento" value={fmtFecha(d.consentimiento_at)} />
                <Field label="Clave de elector" value={
                  clave ? (
                    <span className="font-mono text-warm">
                      {clave}
                      <span className="ml-1.5 text-[10px] font-sans text-ink-faint">· revelado (queda en el audit log)</span>
                    </span>
                  ) : (
                    <span className="font-mono">
                      {d.clave_masked ?? "—"}
                      {d.clave_masked && canReveal && (
                        <button type="button" onClick={reveal} disabled={revealing}
                          className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-sans font-semibold text-accent hover:bg-accent/10 disabled:opacity-50">
                          {revealing ? "Revelando…" : "Revelar"}
                        </button>
                      )}
                      {revealError && <span className="ml-2 text-[10px] font-sans text-state-critical">No permitido</span>}
                    </span>
                  )
                } />
              </Group>
              {d.observacion && (
                <Group title="Observaciones">
                  <Field label="Nota" value={<span className="col-span-2 whitespace-pre-wrap">{d.observacion}</span>} />
                </Group>
              )}
            </>
          )}
        </DataState>
      </div>
    </div>
  );
}
