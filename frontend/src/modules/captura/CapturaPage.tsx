import { useState, useCallback, useEffect, useRef } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { AlertIcon, ShieldIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  createRegistro,
  deleteRegistro,
  getPerfil,
  listMisRegistros,
  type Registro,
} from "@/api/registros";
import { enqueue } from "@/offline/queue";
import { isNetworkError } from "@/offline/sync";
import { usePendingSyncStore } from "@/store/pendingSyncStore";

/* ------------------------------------------------------------------ types */

interface FormState {
  nombre_completo: string;
  seccion: string;
  direccion: string;
  colonia: string;
  telefono: string;
  sexo: string;      // "" | "M" | "F"
  edad: string;      // string en el input, se castea al enviar
  estructura: string;
  observacion: string;
  clave_elector: string;
  consentimiento: boolean;
}

const EMPTY_FORM: FormState = {
  nombre_completo: "",
  seccion: "",
  direccion: "",
  colonia: "",
  telefono: "",
  sexo: "",
  edad: "",
  estructura: "",
  observacion: "",
  clave_elector: "",
  consentimiento: false,
};

/* ----------------------------------------------------------- main page */

export function CapturaPage() {
  const [hasCampaign] = useState(() =>
    Boolean(localStorage.getItem("agora-campaign")),
  );
  const campaignId = localStorage.getItem("agora-campaign") ?? "";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [privOpen, setPrivOpen] = useState(false);
  const [scope, setScope] = useState<"mine" | "team">("team");

  const isOnline = useOnlineStatus();
  const { refresh: refreshPending, triggerSync } = usePendingSyncStore();

  const perfilState = useAsync(getPerfil, []);
  const teamRoles = ["LIDER", "COORDINADOR", "ADMIN", "SUPERADMIN"];
  const hasTeam = Boolean(
    perfilState.data && teamRoles.includes(perfilState.data.role),
  );
  const effectiveScope = hasTeam ? scope : "mine";
  const registrosState = useAsync(
    () => listMisRegistros(effectiveScope),
    [effectiveScope],
  );

  const { reload: reloadRegistros } = registrosState;

  // Hydrate pending count from IndexedDB on mount; drain if online.
  useEffect(() => {
    void refreshPending();
    if (navigator.onLine) {
      void triggerSync().then(() => reloadRegistros());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync when coming back online.
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      void triggerSync().then(() => reloadRegistros());
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, triggerSync, reloadRegistros]);

  const claveLen = form.clave_elector.replace(/\s/g, "").length;
  const claveWarn = claveLen > 0 && claveLen !== 18;
  const edadWarn = form.edad.trim() !== "" && Number(form.edad) > 120;
  const canSave =
    form.nombre_completo.trim().length > 1 &&
    form.consentimiento &&
    !claveWarn &&
    !edadWarn &&
    !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSave) return;
    setSubmitting(true);
    setSubmitError(null);
    setSaveMessage(null);

    const payload = {
      nombre_completo: form.nombre_completo.trim(),
      consentimiento: form.consentimiento,
      ...(form.seccion.trim() && { seccion: form.seccion.trim() }),
      ...(form.direccion.trim() && { direccion: form.direccion.trim() }),
      ...(form.colonia.trim() && { colonia: form.colonia.trim() }),
      ...(form.telefono.trim() && { telefono: form.telefono.trim() }),
      ...(form.sexo && { sexo: form.sexo }),
      ...(form.edad.trim() && { edad: Number(form.edad) }),
      ...(form.estructura.trim() && { estructura: form.estructura.trim() }),
      ...(form.observacion.trim() && { observacion: form.observacion.trim() }),
      ...(form.clave_elector.replace(/\s+/g, "") && {
        clave_elector: form.clave_elector.replace(/\s+/g, ""),
      }),
      client_uuid: crypto.randomUUID(),
    };

    try {
      if (navigator.onLine) {
        try {
          await createRegistro(payload);
          setSaveMessage("Guardado");
        } catch (e) {
          if (isNetworkError(e)) {
            await enqueue(payload, campaignId);
            setSaveMessage("Guardado sin conexión — se sincronizará");
          } else {
            throw e;
          }
        }
      } else {
        await enqueue(payload, campaignId);
        setSaveMessage("Guardado sin conexión — se sincronizará");
      }

      setForm(EMPTY_FORM);
      await refreshPending();
      if (navigator.onLine) void triggerSync();
      reloadRegistros();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Error al guardar el registro",
      );
    } finally {
      setSubmitting(false);
    }
  }, [form, canSave, reloadRegistros, campaignId, refreshPending, triggerSync]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("¿Eliminar este registro? Esta acción no se puede deshacer."))
        return;
      setDeleteError(null);
      try {
        await deleteRegistro(id);
        reloadRegistros();
      } catch {
        setDeleteError("No se pudo eliminar el registro. Intenta de nuevo.");
      }
    },
    [reloadRegistros],
  );

  const registros = registrosState.data?.items ?? [];

  if (!hasCampaign) {
    return (
      <AppLayout title="Captura de Activistas" crumb="Ciudadanía">
        <PageHeader
          eyebrow="Ciudadanía"
          title="Captura de"
          accent="Activistas"
          subtitle="Registra personas captadas en campo."
        />
        <div className="card-premium flex flex-col items-center gap-4 px-5 py-12 text-center">
          <span className="metric-chip h-12 w-12 text-state-warning">
            <AlertIcon width={20} height={20} />
          </span>
          <div>
            <p className="font-semibold text-ink">Sin campaña activa</p>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">
              Selecciona una campaña desde el menú antes de capturar registros de
              activistas.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Captura de Activistas" crumb="Ciudadanía">
      <PageHeader
        eyebrow="Ciudadanía"
        title="Captura de"
        accent="Activistas"
        subtitle="Registra personas captadas en campo con consentimiento y datos verificados."
        actions={
          <div className="flex items-center gap-2">
            <div className="metric-chip flex h-14 w-16 flex-col items-center justify-center gap-0.5 text-accent">
              <span className="font-display text-xl font-bold leading-none tabular-nums">
                {registros.length}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-ink-faint">
                registros
              </span>
            </div>
          </div>
        }
      />

      {/* --- Perfil del activista (read-only) --- */}
      <div className="mb-4">
        <Card title="Datos del activista" accentDot>
          <DataState
            loading={perfilState.loading}
            error={perfilState.error}
            onRetry={perfilState.reload}
          >
            {perfilState.data && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
                  <span className="eyebrow block">Activista</span>
                  <span className="mt-0.5 block text-sm font-semibold text-ink">
                    {perfilState.data.full_name}
                  </span>
                </div>
                {perfilState.data.lider_nombre && (
                  <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
                    <span className="eyebrow block">Líder</span>
                    <span className="mt-0.5 block text-sm text-ink-muted">
                      {perfilState.data.lider_nombre}
                    </span>
                  </div>
                )}
                {perfilState.data.seccion && (
                  <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
                    <span className="eyebrow block">Sección</span>
                    <span className="mt-0.5 block font-mono text-sm text-ink-muted">
                      {perfilState.data.seccion}
                    </span>
                  </div>
                )}
                {perfilState.data.area && (
                  <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
                    <span className="eyebrow block">Territorio</span>
                    <span className="mt-0.5 inline-flex">
                      <span className="pill border-accent/30 bg-accent/10 text-accent">
                        Territorio: {perfilState.data.area.nombre}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            )}
            {perfilState.data && !perfilState.data.area && (
              <p className="mt-3 text-xs text-ink-faint">
                Pídele a tu administrador que te asigne un territorio.
              </p>
            )}
          </DataState>
        </Card>
      </div>

      {/* --- Aviso de privacidad (collapsible) --- */}
      <div className="mb-4">
        <div className="card-premium p-5">
          <div className="flex items-start gap-3">
            <span className="metric-chip mt-0.5 h-9 w-9 shrink-0 text-state-warning">
              <ShieldIcon width={16} height={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Aviso de privacidad</p>
              <p className="mt-1 text-xs text-ink-muted">
                La clave de elector y el teléfono son datos personales protegidos.
                Captúralos solo con consentimiento y úsalos únicamente para fines
                de la campaña.
              </p>
              <button
                type="button"
                className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-state-warning hover:underline"
                onClick={() => setPrivOpen((o) => !o)}
              >
                {privOpen ? "Ocultar texto" : "Ver texto completo"}
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform duration-200 ${privOpen ? "rotate-180" : ""}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {privOpen && (
                <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                  Los datos recabados (nombre, dirección, sección, colonia, clave
                  de elector y teléfono) serán tratados de forma confidencial y
                  exclusivamente para las actividades de organización y promoción
                  de la campaña. No se compartirán con terceros ajenos a la misma
                  ni se destinarán a un fin distinto. La persona titular puede
                  solicitar en cualquier momento que sus datos sean eliminados del
                  registro. El responsable del tratamiento es el activista que
                  recaba la información.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- Formulario de captura --- */}
      <div className="mb-4">
        <Card title="Agregar persona" accentDot>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Nombre completo */}
            <div className="sm:col-span-2">
              <label htmlFor="cap-nombre" className="field-label">
                Nombre completo{" "}
                <span className="text-state-critical">*</span>
              </label>
              <input
                id="cap-nombre"
                type="text"
                className="field-input"
                placeholder="Nombre y apellidos"
                value={form.nombre_completo}
                onChange={(e) =>
                  setForm((p) => ({ ...p, nombre_completo: e.target.value }))
                }
              />
            </div>

            {/* Sexo */}
            <div>
              <span className="field-label">Sexo</span>
              <div className="mt-1 flex gap-2">
                {(["M", "F"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setForm((p) => ({ ...p, sexo: p.sexo === s ? "" : s }))
                    }
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      form.sexo === s
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line text-ink-muted hover:border-accent/40"
                    }`}
                  >
                    {s === "M" ? "Masculino" : "Femenino"}
                  </button>
                ))}
              </div>
            </div>

            {/* Clave de elector */}
            <div className="sm:col-span-2">
              <label htmlFor="cap-clave" className="field-label">
                Clave de elector
              </label>
              <input
                id="cap-clave"
                type="text"
                className={`field-input ${claveWarn ? "border-state-warning focus:border-state-warning focus:ring-state-warning/30" : ""}`}
                placeholder="18 caracteres (mayúsculas)"
                value={form.clave_elector}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    clave_elector: e.target.value.toUpperCase().replace(/\s/g, ""),
                  }))
                }
              />
              {claveWarn ? (
                <p className="mt-1 text-xs text-state-warning">
                  Lleva 18 caracteres ({claveLen} capturados)
                </p>
              ) : (
                <p className="mt-1 text-xs text-ink-faint">
                  Opcional · como aparece en la credencial
                </p>
              )}
            </div>

            {/* Edad */}
            <div>
              <label htmlFor="cap-edad" className="field-label">Edad</label>
              <input
                id="cap-edad"
                type="text"
                inputMode="numeric"
                className={`field-input ${edadWarn ? "border-state-warning focus:border-state-warning focus:ring-state-warning/30" : ""}`}
                placeholder="Años"
                value={form.edad}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    edad: e.target.value.replace(/\D/g, "").slice(0, 3),
                  }))
                }
              />
              {edadWarn && (
                <p className="mt-1 text-xs text-state-warning">
                  Edad máxima 120
                </p>
              )}
            </div>

            {/* Sección */}
            <div>
              <label htmlFor="cap-seccion" className="field-label">
                Sección
              </label>
              <input
                id="cap-seccion"
                type="text"
                inputMode="numeric"
                className="field-input"
                placeholder="Ej. 4129"
                value={form.seccion}
                onChange={(e) =>
                  setForm((p) => ({ ...p, seccion: e.target.value }))
                }
              />
            </div>

            {/* Dirección */}
            <div className="sm:col-span-2">
              <label htmlFor="cap-direccion" className="field-label">
                Dirección
              </label>
              <input
                id="cap-direccion"
                type="text"
                className="field-input"
                placeholder="Calle y número"
                value={form.direccion}
                onChange={(e) =>
                  setForm((p) => ({ ...p, direccion: e.target.value }))
                }
              />
            </div>

            {/* Colonia */}
            <div>
              <label htmlFor="cap-colonia" className="field-label">
                Bo./Col.
              </label>
              <input
                id="cap-colonia"
                type="text"
                className="field-input"
                placeholder="Barrio o colonia"
                value={form.colonia}
                onChange={(e) =>
                  setForm((p) => ({ ...p, colonia: e.target.value }))
                }
              />
            </div>

            {/* Teléfono */}
            <div>
              <label htmlFor="cap-telefono" className="field-label">
                Teléfono
              </label>
              <input
                id="cap-telefono"
                type="text"
                inputMode="tel"
                className="field-input"
                placeholder="10 dígitos"
                value={form.telefono}
                onChange={(e) =>
                  setForm((p) => ({ ...p, telefono: e.target.value }))
                }
              />
            </div>

            {/* Estructura */}
            <div>
              <label htmlFor="cap-estructura" className="field-label">Estructura</label>
              <input
                id="cap-estructura"
                type="text"
                className="field-input"
                placeholder="Red o estructura"
                value={form.estructura}
                onChange={(e) =>
                  setForm((p) => ({ ...p, estructura: e.target.value }))
                }
              />
            </div>

            {/* Observación */}
            <div className="sm:col-span-2">
              <label htmlFor="cap-observacion" className="field-label">Observación</label>
              <textarea
                id="cap-observacion"
                rows={2}
                className="field-input resize-y"
                placeholder="Notas u observaciones"
                value={form.observacion}
                onChange={(e) =>
                  setForm((p) => ({ ...p, observacion: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Consentimiento */}
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-teal/30 bg-teal/5 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              checked={form.consentimiento}
              onChange={(e) =>
                setForm((p) => ({ ...p, consentimiento: e.target.checked }))
              }
            />
            <span className="text-xs leading-relaxed text-ink-muted">
              La persona dio su consentimiento para registrar sus datos conforme
              al aviso de privacidad.
            </span>
          </label>

          {submitError && (
            <div className="mt-3 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-xs text-state-critical">
              {submitError}
            </div>
          )}

          {saveMessage && (
            <div className="mt-3 rounded-lg border border-state-success/40 bg-state-success/10 px-3 py-2 text-xs text-state-success">
              {saveMessage}
            </div>
          )}

          <button
            type="button"
            disabled={!canSave}
            onClick={() => void handleSubmit()}
            className="btn-primary mt-4 w-full"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {submitting ? "Guardando…" : "Guardar en el registro"}
          </button>
        </Card>
      </div>

      {/* --- Lista de registros --- */}
      {deleteError && (
        <div className="mb-3 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-xs text-state-critical">
          {deleteError}
        </div>
      )}
      <Card
        title="Personas registradas"
        accentDot
        action={
          <div className="flex items-center gap-2">
            {hasTeam && (
              <div className="flex rounded-lg border border-line p-0.5 text-xs">
                {(["mine", "team"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                      scope === s
                        ? "bg-accent/10 text-accent"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {s === "mine" ? "Míos" : "Todo el equipo"}
                  </button>
                ))}
              </div>
            )}
            <span className="pill border-line text-ink-muted">
              {registros.length} total
            </span>
          </div>
        }
      >
        <DataState
          loading={registrosState.loading}
          error={registrosState.error}
          isEmpty={
            !registrosState.loading &&
            !registrosState.error &&
            registros.length === 0
          }
          emptyMessage="Aún no hay registros…"
          onRetry={reloadRegistros}
        >
          <div className="divide-y divide-line">
            {registros.map((r, i) => (
              <PersonRow
                key={r.id}
                registro={r}
                index={i}
                showActivista={hasTeam}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </DataState>
      </Card>
    </AppLayout>
  );
}

/* ---------------------------------------------------------- subcomponents */

interface PersonRowProps {
  registro: Registro;
  index: number;
  showActivista: boolean;
  onDelete: (id: string) => Promise<void>;
}

function PersonRow({ registro, index, showActivista, onDelete }: PersonRowProps) {
  return (
    <div className="flex gap-3 py-3 first:pt-0">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 font-display text-xs font-bold text-accent">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{registro.nombre_completo}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-faint">
          {showActivista && registro.activista_nombre && (
            <span className="font-semibold text-accent">
              {registro.activista_nombre}
            </span>
          )}
          {registro.seccion && <span>Secc. {registro.seccion}</span>}
          {registro.sexo && <span>{registro.sexo === "M" ? "M" : "F"}</span>}
          {registro.edad != null && <span>{registro.edad} años</span>}
          {registro.telefono && <span>{registro.telefono}</span>}
          {registro.colonia && <span>{registro.colonia}</span>}
          {(registro.estructura ?? registro.area) && (
            <span>{registro.estructura ?? registro.area}</span>
          )}
          {registro.clave_masked && <span>{registro.clave_masked}</span>}
        </div>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-state-critical/10 hover:text-state-critical"
        onClick={() => void onDelete(registro.id)}
        title="Eliminar registro"
        aria-label={`Eliminar registro de ${registro.nombre_completo}`}
      >
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        </svg>
      </button>
    </div>
  );
}
