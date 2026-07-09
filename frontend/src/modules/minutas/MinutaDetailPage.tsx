// frontend/src/modules/minutas/MinutaDetailPage.tsx
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useAsync } from "@/hooks/useAsync";
import { MINUTAS_WRITE } from "@/modules/registry";
import { useAuthStore } from "@/store/authStore";
import { getMinuta, updateAcuerdo, updateMinuta, type Minuta } from "@/api/minutas";

const TIPO_LABEL: Record<string, string> = { REUNION: "Reunión", OTRO: "Otro" };
const ESTADO_LABEL: Record<string, string> = { BORRADOR: "Borrador", PUBLICADA: "Publicada" };
const ESTADO_CLASS: Record<string, string> = {
  BORRADOR: "border-line bg-panel-hover text-ink-faint",
  PUBLICADA: "border-teal/30 bg-teal/10 text-teal",
};

const ACUERDO_ESTADOS = ["PENDIENTE", "EN_CURSO", "CUMPLIDO", "CANCELADO"];
const ACUERDO_ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  CUMPLIDO: "Cumplido",
  CANCELADO: "Cancelado",
};
const ACUERDO_ESTADO_CLASS: Record<string, string> = {
  PENDIENTE: "border-line bg-panel-hover text-ink-faint",
  EN_CURSO: "border-accent/30 bg-accent/10 text-accent",
  CUMPLIDO: "border-teal/30 bg-teal/10 text-teal",
  CANCELADO: "border-state-critical/30 bg-state-critical/10 text-state-critical",
};

/**
 * Full acta view: header pills (estado/tipo), asistentes, notas, and the
 * acuerdos list — each with an estado `<select>` that PATCHes immediately
 * (write-tier only). A BORRADOR minuta offers "Editar" + "Publicar"; once
 * PUBLICADA the acta itself is locked (backend 409s on edit attempts).
 */
export function MinutaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role ? MINUTAS_WRITE.includes(role) : false;

  const state = useAsync<Minuta>(() => {
    if (!id) return Promise.reject(new Error("Falta el id de la minuta."));
    return getMinuta(id);
  }, [id]);
  const m = state.data;

  const [error, setError] = useState<string | null>(null);
  // Track the acuerdo currently being PATCHed so its <select> can't be
  // double-fired while the request is in flight.
  const [busyAcuerdoId, setBusyAcuerdoId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  async function cambiarEstadoAcuerdo(aid: string, estado: string) {
    if (!id) return;
    setBusyAcuerdoId(aid);
    setError(null);
    try {
      await updateAcuerdo(id, aid, { estado });
      state.reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el acuerdo.");
    } finally {
      setBusyAcuerdoId(null);
    }
  }

  async function publicar() {
    if (!id) return;
    setPublishing(true);
    setError(null);
    try {
      await updateMinuta(id, { estado: "PUBLICADA" });
      state.reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo publicar la minuta.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <AppLayout title={m?.titulo ?? "Minuta"} crumb="Ciudadanía">
      <PageHeader
        eyebrow="Ciudadanía"
        title={m ? m.titulo : "Minuta"}
        subtitle={
          m
            ? `${m.fecha}${m.lugar ? ` · ${m.lugar}` : ""} · ${TIPO_LABEL[m.tipo] ?? m.tipo}`
            : undefined
        }
        actions={
          m && canWrite && m.estado === "BORRADOR" ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost focus-ring"
                onClick={() => nav(`/minutas/${m.id}/editar`)}
              >
                Editar
              </button>
              <button
                type="button"
                className="btn-primary focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                onClick={publicar}
                disabled={publishing}
              >
                {publishing ? "Publicando…" : "Publicar"}
              </button>
            </div>
          ) : undefined
        }
      />

      {error && (
        <div className="card-premium mb-4 px-3.5 py-2.5 text-sm text-state-critical">{error}</div>
      )}

      <DataState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
        isEmpty={false}
        skeleton={<div className="card-premium p-6 text-ink-muted">Cargando…</div>}
      >
        {m && (
          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <div className="card-premium reveal p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`pill ${ESTADO_CLASS[m.estado] ?? "border-line bg-panel-hover text-ink-faint"}`}>
                  {ESTADO_LABEL[m.estado] ?? m.estado}
                </span>
                <span className="pill border-line bg-panel-hover text-ink-muted">
                  {TIPO_LABEL[m.tipo] ?? m.tipo}
                </span>
              </div>

              <dl className="mt-4 divide-y divide-line/60">
                <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span className="text-ink-faint">Fecha</span>
                  <span className="font-mono text-ink">{m.fecha}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span className="text-ink-faint">Lugar</span>
                  <span className="text-ink">{m.lugar ?? "—"}</span>
                </div>
              </dl>

              <div className="mt-4 border-t border-line pt-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Asistentes</p>
                {m.asistentes.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-faint">Sin asistentes registrados.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.asistentes.map((a, idx) => (
                      <span key={idx} className="pill border-line bg-panel-hover text-ink-muted">
                        {a.nombre}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {m.cuerpo && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Notas</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{m.cuerpo}</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <SectionHeading
                eyebrow="Seguimiento"
                title="Acuerdos"
                note={`${m.acuerdos_pendientes} pendientes`}
              />
              {m.acuerdos.length === 0 ? (
                <div className="card-premium p-4 text-sm text-ink-faint">Sin acuerdos registrados.</div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {m.acuerdos.map((a) => (
                    <li key={a.id} className="card-premium p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex-1 text-sm text-ink">{a.texto}</p>
                        <span
                          className={`pill shrink-0 ${
                            ACUERDO_ESTADO_CLASS[a.estado] ?? "border-line bg-panel-hover text-ink-faint"
                          }`}
                        >
                          {ACUERDO_ESTADO_LABEL[a.estado] ?? a.estado}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-faint">
                        <span>{a.responsable_nombre ?? "Sin responsable"}</span>
                        <span className="font-mono">{a.fecha_limite ?? "sin fecha"}</span>
                      </div>
                      {canWrite && (
                        <select
                          value={a.estado}
                          onChange={(e) => cambiarEstadoAcuerdo(a.id, e.target.value)}
                          disabled={busyAcuerdoId === a.id}
                          className="field-input focus-ring mt-2 h-9 w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {ACUERDO_ESTADOS.map((s) => (
                            <option key={s} value={s}>
                              {ACUERDO_ESTADO_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DataState>
    </AppLayout>
  );
}

export default MinutaDetailPage;
