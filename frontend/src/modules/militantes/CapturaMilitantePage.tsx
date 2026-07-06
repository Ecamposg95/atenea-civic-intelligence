import { useCallback, useEffect, useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { AlertIcon, ShieldIcon } from "@/components/ui/icons";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getPerfil } from "@/api/registros";
import {
  createMilitante,
  uploadDocumento,
  type MilitanteCreate,
} from "@/api/militantes";
import { PhotoCapture } from "./components/PhotoCapture";
import { SignaturePad } from "./components/SignaturePad";

/* ------------------------------------------------------------------ types */

type Step = 1 | 2 | 3;

type DocTipo = "frente" | "reverso" | "firma";

type DocStatus = "idle" | "uploading" | "done" | "error";

interface FormState {
  nombre_completo: string;
  curp: string;
  clave_elector: string;
  fecha_nacimiento: string;
  sexo: string; // "" | "M" | "F"
  seccion: string;
  calle_numero: string;
  colonia: string;
  cp: string;
  municipio: string;
  telefono: string;
  email: string;
  es_activista: boolean;
  estructura: string;
  promotor: string;
  consentimiento: boolean;
}

const EMPTY_FORM: FormState = {
  nombre_completo: "",
  curp: "",
  clave_elector: "",
  fecha_nacimiento: "",
  sexo: "",
  seccion: "",
  calle_numero: "",
  colonia: "",
  cp: "",
  municipio: "San Mateo Atenco",
  telefono: "",
  email: "",
  es_activista: false,
  estructura: "",
  promotor: "",
  consentimiento: false,
};

const DOC_LABELS: Record<DocTipo, string> = {
  frente: "Credencial — frente",
  reverso: "Credencial — reverso",
  firma: "Firma",
};

const STEP_LABELS: Record<Step, string> = {
  1: "Identidad",
  2: "Contacto",
  3: "Documentos",
};

/* Shared button treatments for the wizard nav — larger touch targets
 * (one-handed field use) with a light tactile microinteraction. */
const BACK_BTN_CLASS =
  "inline-flex items-center gap-1.5 rounded-lg border border-line px-5 py-3 text-sm font-semibold text-ink-muted transition-all duration-150 hover:border-accent/40 hover:text-ink active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";
const NEXT_BTN_CLASS =
  "btn-primary gap-1.5 px-6 py-3 text-base transition-transform duration-150 active:scale-[0.97] disabled:active:scale-100";

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* ------------------------------------------------------------- stepper */

/** 1·2·3 progress indicator: filled+check when done, glowing ring when
 * active, quiet outline when upcoming. Purely presentational — `step`
 * still drives which form panel renders below. */
function StepIndicator({ step }: { step: Step }) {
  const steps: Step[] = [1, 2, 3];
  return (
    <div className="flex items-center" aria-label={`Paso ${step} de 3`}>
      {steps.map((s, i) => {
        const done = step > s;
        const active = step === s;
        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border font-display text-sm font-bold transition-all duration-300 ${
                  done
                    ? "border-teal/60 bg-teal/15 text-teal"
                    : active
                      ? "border-accent bg-accent/10 text-accent shadow-glow-accent"
                      : "border-line text-ink-faint"
                }`}
              >
                {done ? (
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  s
                )}
              </span>
              <span
                className={`hidden font-mono text-[10px] uppercase tracking-wider sm:block ${
                  active ? "text-accent" : done ? "text-teal" : "text-ink-faint"
                }`}
              >
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`mx-2 h-0.5 w-6 rounded-full transition-colors duration-300 sm:w-10 ${
                  step > s ? "bg-teal/60" : "bg-line"
                }`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- main page */

export default function CapturaMilitantePage() {
  const isOnline = useOnlineStatus();

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [frente, setFrente] = useState<Blob | null>(null);
  const [reverso, setReverso] = useState<Blob | null>(null);
  const [firma, setFirma] = useState<Blob | null>(null);
  const [privOpen, setPrivOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<Record<DocTipo, DocStatus>>({
    frente: "idle",
    reverso: "idle",
    firma: "idle",
  });

  // Kept across retries so a failed photo upload doesn't re-create the militante.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [folio, setFolio] = useState<string | null>(null);

  // Prefill promotor/seccion from the logged-in profile, without
  // clobbering anything the user may have already typed.
  const applyPerfilDefaults = useCallback(() => {
    getPerfil()
      .then((perfil) => {
        setForm((p) => ({
          ...p,
          promotor: p.promotor || perfil.full_name || p.promotor,
          seccion: p.seccion || perfil.seccion || p.seccion,
        }));
      })
      .catch(() => {
        /* profile prefill is best-effort; ignore failures */
      });
  }, []);

  useEffect(() => {
    applyPerfilDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const curpLen = form.curp.replace(/\s/g, "").length;
  const curpWarn = curpLen > 0 && curpLen !== 18;
  const claveLen = form.clave_elector.replace(/\s/g, "").length;
  const claveWarn = claveLen > 0 && claveLen !== 18;

  const canGoStep2 = form.nombre_completo.trim().length > 1;
  const canSubmit =
    form.nombre_completo.trim().length > 1 &&
    form.consentimiento &&
    !submitting;

  const resetAll = useCallback(() => {
    setForm(EMPTY_FORM);
    setFrente(null);
    setReverso(null);
    setFirma(null);
    setCreatedId(null);
    setFolio(null);
    setSubmitError(null);
    setDocStatus({ frente: "idle", reverso: "idle", firma: "idle" });
    setStep(1);
    applyPerfilDefaults();
  }, [applyPerfilDefaults]);

  const buildPayload = useCallback((): MilitanteCreate => {
    return {
      nombre_completo: form.nombre_completo.trim(),
      consentimiento: form.consentimiento,
      ...(form.curp.replace(/\s+/g, "") && {
        curp: form.curp.replace(/\s+/g, ""),
      }),
      ...(form.clave_elector.replace(/\s+/g, "") && {
        clave_elector: form.clave_elector.replace(/\s+/g, ""),
      }),
      ...(form.sexo && { sexo: form.sexo }),
      ...(form.fecha_nacimiento && { fecha_nacimiento: form.fecha_nacimiento }),
      ...(form.seccion.trim() && { seccion: form.seccion.trim() }),
      ...(form.email.trim() && { email: form.email.trim() }),
      ...(form.telefono.trim() && { telefono: form.telefono.trim() }),
      ...(form.calle_numero.trim() && { calle_numero: form.calle_numero.trim() }),
      ...(form.colonia.trim() && { colonia: form.colonia.trim() }),
      ...(form.cp.trim() && { cp: form.cp.trim() }),
      ...(form.municipio.trim() && { municipio: form.municipio.trim() }),
      es_activista: form.es_activista,
      ...(form.estructura.trim() && { estructura: form.estructura.trim() }),
      ...(form.promotor.trim() && { promotor: form.promotor.trim() }),
      client_uuid: crypto.randomUUID(),
    };
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      let id = createdId;
      if (!id) {
        const created = await createMilitante(buildPayload());
        id = created.id;
        setCreatedId(created.id);
        setFolio(created.folio);
      }

      const docs: [DocTipo, Blob | null][] = [
        ["frente", frente],
        ["reverso", reverso],
        ["firma", firma],
      ];

      for (const [tipo, blob] of docs) {
        if (!blob) continue;
        if (docStatus[tipo] === "done") continue;
        setDocStatus((s) => ({ ...s, [tipo]: "uploading" }));
        try {
          await uploadDocumento(id, tipo, blob);
          setDocStatus((s) => ({ ...s, [tipo]: "done" }));
        } catch (err) {
          setDocStatus((s) => ({ ...s, [tipo]: "error" }));
          throw err;
        }
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Error al registrar al militante",
      );
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  }, [canSubmit, createdId, buildPayload, frente, reverso, firma, docStatus]);

  /* ------------------------------------------------------------ offline */

  if (!isOnline) {
    return (
      <AppLayout title="Afiliación de Militantes" crumb="Militantes">
        <PageHeader eyebrow="Afiliación" title="Registro de" accent="Militante" />
        <div className="card-premium flex flex-col items-center gap-4 px-5 py-12 text-center">
          <span className="metric-chip h-12 w-12 text-state-warning">
            <AlertIcon width={20} height={20} />
          </span>
          <div>
            <p className="font-semibold text-ink">Necesitas conexión para afiliar</p>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">
              La afiliación de militantes requiere conexión a internet para
              validar y subir la documentación. Vuelve a intentarlo cuando
              tengas señal.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  /* ------------------------------------------------------------ success */

  if (folio && !submitting && !submitError) {
    return (
      <AppLayout title="Afiliación de Militantes" crumb="Militantes">
        <PageHeader eyebrow="Afiliación" title="Registro de" accent="Militante" />
        <div className="card-premium flex flex-col items-center gap-4 px-5 py-12 text-center">
          <span className="metric-chip h-14 w-14 text-state-success">
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-ink">Militante registrado</p>
            <p className="mt-1 text-sm text-ink-muted">Folio de afiliación</p>
            <p className="mt-1 font-display text-2xl font-bold text-gradient">
              {folio}
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={resetAll}>
            Registrar otro
          </button>
        </div>
      </AppLayout>
    );
  }

  /* --------------------------------------------------------------- form */

  return (
    <AppLayout title="Afiliación de Militantes" crumb="Militantes">
      <PageHeader
        eyebrow="Afiliación"
        title="Registro de"
        accent="Militante"
        subtitle="Captura la afiliación de un militante en tres pasos: identidad, contacto y documentación."
        actions={<StepIndicator step={step} />}
      />

      <Card
        title={
          step === 1
            ? "Identidad"
            : step === 2
              ? "Contacto y domicilio"
              : "Documentos y firma"
        }
        accentDot
      >
        {step === 1 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="mil-nombre" className="field-label">
                Nombre completo <span className="text-state-critical">*</span>
              </label>
              <input
                id="mil-nombre"
                type="text"
                className="field-input"
                placeholder="Nombre y apellidos"
                value={form.nombre_completo}
                onChange={(e) =>
                  setForm((p) => ({ ...p, nombre_completo: e.target.value }))
                }
              />
            </div>

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

            <div>
              <label htmlFor="mil-fecha-nac" className="field-label">
                Fecha de nacimiento
              </label>
              <input
                id="mil-fecha-nac"
                type="date"
                className="field-input"
                value={form.fecha_nacimiento}
                onChange={(e) =>
                  setForm((p) => ({ ...p, fecha_nacimiento: e.target.value }))
                }
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="mil-curp" className="field-label">
                CURP
              </label>
              <input
                id="mil-curp"
                type="text"
                className={`field-input ${curpWarn ? "border-state-warning focus:border-state-warning focus:ring-state-warning/30" : ""}`}
                placeholder="18 caracteres (mayúsculas)"
                value={form.curp}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    curp: e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 18),
                  }))
                }
              />
              {curpWarn ? (
                <p className="mt-1 text-xs text-state-warning">
                  Lleva 18 caracteres ({curpLen} capturados)
                </p>
              ) : (
                <p className="mt-1 text-xs text-ink-faint">
                  Opcional · como aparece en la credencial
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="mil-clave" className="field-label">
                Clave de elector
              </label>
              <input
                id="mil-clave"
                type="text"
                className={`field-input ${claveWarn ? "border-state-warning focus:border-state-warning focus:ring-state-warning/30" : ""}`}
                placeholder="18 caracteres (mayúsculas)"
                value={form.clave_elector}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    clave_elector: e.target.value
                      .toUpperCase()
                      .replace(/\s/g, "")
                      .slice(0, 18),
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

            <div>
              <label htmlFor="mil-seccion" className="field-label">
                Sección
              </label>
              <input
                id="mil-seccion"
                type="text"
                inputMode="numeric"
                className="field-input"
                placeholder="Ej. 4129"
                value={form.seccion}
                onChange={(e) => setForm((p) => ({ ...p, seccion: e.target.value }))}
              />
            </div>

            <div className="sm:col-span-2 mt-2 flex justify-end">
              <button
                type="button"
                disabled={!canGoStep2}
                onClick={() => setStep(2)}
                className={NEXT_BTN_CLASS}
              >
                Siguiente
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="mil-calle" className="field-label">
                Calle y número
              </label>
              <input
                id="mil-calle"
                type="text"
                className="field-input"
                placeholder="Calle, número exterior/interior"
                value={form.calle_numero}
                onChange={(e) =>
                  setForm((p) => ({ ...p, calle_numero: e.target.value }))
                }
              />
            </div>

            <div>
              <label htmlFor="mil-colonia" className="field-label">
                Bo./Col.
              </label>
              <input
                id="mil-colonia"
                type="text"
                className="field-input"
                placeholder="Barrio o colonia"
                value={form.colonia}
                onChange={(e) => setForm((p) => ({ ...p, colonia: e.target.value }))}
              />
            </div>

            <div>
              <label htmlFor="mil-cp" className="field-label">
                Código postal
              </label>
              <input
                id="mil-cp"
                type="text"
                inputMode="numeric"
                className="field-input"
                placeholder="5 dígitos"
                value={form.cp}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    cp: e.target.value.replace(/\D/g, "").slice(0, 5),
                  }))
                }
              />
            </div>

            <div>
              <label htmlFor="mil-municipio" className="field-label">
                Municipio
              </label>
              <input
                id="mil-municipio"
                type="text"
                className="field-input"
                value={form.municipio}
                onChange={(e) =>
                  setForm((p) => ({ ...p, municipio: e.target.value }))
                }
              />
            </div>

            <div>
              <label htmlFor="mil-telefono" className="field-label">
                Teléfono
              </label>
              <input
                id="mil-telefono"
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

            <div>
              <label htmlFor="mil-email" className="field-label">
                Correo electrónico
              </label>
              <input
                id="mil-email"
                type="email"
                className="field-input"
                placeholder="correo@ejemplo.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>

            <div>
              <span className="field-label">¿Es activista?</span>
              <div className="mt-1 flex gap-2">
                {([
                  { v: true, label: "Sí" },
                  { v: false, label: "No" },
                ] as const).map((opt) => (
                  <button
                    key={String(opt.v)}
                    type="button"
                    onClick={() =>
                      setForm((p) => ({ ...p, es_activista: opt.v }))
                    }
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      form.es_activista === opt.v
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line text-ink-muted hover:border-accent/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="mil-estructura" className="field-label">
                Estructura
              </label>
              <input
                id="mil-estructura"
                type="text"
                className="field-input"
                placeholder="Red o estructura"
                value={form.estructura}
                onChange={(e) =>
                  setForm((p) => ({ ...p, estructura: e.target.value }))
                }
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="mil-promotor" className="field-label">
                Promotor
              </label>
              <input
                id="mil-promotor"
                type="text"
                className="field-input"
                placeholder="Quién promueve la afiliación"
                value={form.promotor}
                onChange={(e) =>
                  setForm((p) => ({ ...p, promotor: e.target.value }))
                }
              />
            </div>

            <div className="sm:col-span-2 mt-2 flex justify-between">
              <button type="button" onClick={() => setStep(1)} className={BACK_BTN_CLASS}>
                <ChevronLeftIcon />
                Atrás
              </button>
              <button type="button" onClick={() => setStep(3)} className={NEXT_BTN_CLASS}>
                Siguiente
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PhotoCapture label="Credencial — frente" onCapture={setFrente} />
              <PhotoCapture label="Credencial — reverso" onCapture={setReverso} />
            </div>

            <div>
              <span className="field-label">Firma</span>
              <div className="mt-1">
                <SignaturePad onChange={setFirma} />
              </div>
            </div>

            {/* Quality hints — non-blocking */}
            <div className="flex flex-wrap gap-2">
              {!frente && (
                <span className="pill border-state-warning/40 text-state-warning">
                  Falta frente
                </span>
              )}
              {!reverso && (
                <span className="pill border-state-warning/40 text-state-warning">
                  Falta reverso
                </span>
              )}
              {!firma && (
                <span className="pill border-state-warning/40 text-state-warning">
                  Falta firma
                </span>
              )}
              {curpWarn && (
                <span className="pill border-state-warning/40 text-state-warning">
                  CURP incompleta
                </span>
              )}
              {claveWarn && (
                <span className="pill border-state-warning/40 text-state-warning">
                  Clave de elector incompleta
                </span>
              )}
            </div>

            {/* Aviso de privacidad */}
            <div className="card-premium p-5">
              <div className="flex items-start gap-3">
                <span className="metric-chip mt-0.5 h-9 w-9 shrink-0 text-state-warning">
                  <ShieldIcon width={16} height={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    Aviso de privacidad
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    La CURP, la clave de elector y el teléfono son datos
                    personales protegidos. Captúralos solo con consentimiento
                    y úsalos únicamente para fines de la campaña.
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
                      Los datos recabados (nombre, CURP, clave de elector,
                      domicilio, sección, teléfono, correo y documentación
                      fotográfica) serán tratados de forma confidencial y
                      exclusivamente para las actividades de organización y
                      afiliación de la campaña. No se compartirán con
                      terceros ajenos a la misma ni se destinarán a un fin
                      distinto. La persona titular puede solicitar en
                      cualquier momento que sus datos sean eliminados del
                      registro. El responsable del tratamiento es el
                      promotor que recaba la información.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-teal/30 bg-teal/5 p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                checked={form.consentimiento}
                onChange={(e) =>
                  setForm((p) => ({ ...p, consentimiento: e.target.checked }))
                }
              />
              <span className="text-xs leading-relaxed text-ink-muted">
                La persona dio su consentimiento para afiliarse y registrar
                sus datos conforme al aviso de privacidad.
              </span>
            </label>

            {/* Upload progress */}
            {submitting && (
              <div className="flex flex-wrap gap-2">
                {(["frente", "reverso", "firma"] as DocTipo[])
                  .filter((tipo) =>
                    tipo === "frente" ? frente : tipo === "reverso" ? reverso : firma,
                  )
                  .map((tipo) => (
                    <span
                      key={tipo}
                      className={`pill ${
                        docStatus[tipo] === "done"
                          ? "border-state-success/40 text-state-success"
                          : docStatus[tipo] === "error"
                            ? "border-state-critical/40 text-state-critical"
                            : docStatus[tipo] === "uploading"
                              ? "border-accent/40 text-accent"
                              : "border-line text-ink-faint"
                      }`}
                    >
                      {DOC_LABELS[tipo]}
                      {docStatus[tipo] === "uploading" && "…"}
                      {docStatus[tipo] === "done" && " ✓"}
                    </span>
                  ))}
              </div>
            )}

            {submitError && (
              <div className="rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-xs text-state-critical">
                {submitError}
                {createdId && (
                  <p className="mt-1 text-ink-faint">
                    El militante ya fue creado (folio pendiente de
                    documentación). Puedes reintentar sin perder tus datos.
                  </p>
                )}
              </div>
            )}

            <div className="mt-2 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={submitting}
                className={BACK_BTN_CLASS}
              >
                <ChevronLeftIcon />
                Atrás
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void handleSubmit()}
                className={NEXT_BTN_CLASS}
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
                {submitting
                  ? "Guardando…"
                  : createdId
                    ? "Reintentar documentos"
                    : "Afiliar militante"}
              </button>
            </div>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
