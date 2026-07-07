// frontend/src/modules/atencion/CapturaAtencionPage.tsx
import { useState, type FormEvent } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { AlertIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  getCaso,
  listForms,
  submitResponse,
  type FormDefinition,
} from "@/api/atencion";
import { PhotoCapture } from "@/modules/militantes/components/PhotoCapture";

import { DynamicForm, validate } from "./components/DynamicForm";
import { scanIne, type IneFields } from "./lib/ocr";

/**
 * Internal capture page — route `/atencion/captura` (ACTIVISTA+).
 *
 * Picks an active internal-channel form, renders it via <DynamicForm>, and
 * offers an "Escanear credencial (OCR)" shortcut that prefills matching
 * fields from an INE photo. OCR is assist-only: results are always editable
 * and marked "OCR — verifica" — never authoritative — matching the
 * behavior documented in `lib/ocr.ts`.
 *
 * House style / online guard / success-screen shape mirrors
 * `modules/militantes/CapturaMilitantePage.tsx`.
 */

const OCR_KEYS: (keyof IneFields)[] = ["nombre", "curp", "clave", "seccion", "domicilio"];

function isEligible(f: FormDefinition): boolean {
  return f.is_active && (f.canal === "INTERNO" || f.canal === "AMBOS");
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3" />
      <path d="M4 12h16" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

interface SubmitResult {
  casoId?: string;
  folio?: string;
}

export default function CapturaAtencionPage() {
  const isOnline = useOnlineStatus();
  const formsState = useAsync(() => listForms(), []);
  const eligibleForms = (formsState.data ?? []).filter(isEligible);

  const [formId, setFormId] = useState<string | null>(null);
  const form = eligibleForms.find((f) => f.id === formId) ?? eligibleForms[0] ?? null;

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ocrKeys, setOcrKeys] = useState<Set<string>>(new Set());
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  function resetCapture() {
    setAnswers({});
    setErrors({});
    setOcrKeys(new Set());
    setScanOpen(false);
    setScanning(false);
    setScanMessage(null);
    setSubmitError(null);
  }

  function handleSelectForm(id: string) {
    setFormId(id);
    resetCapture();
  }

  function handleChange(key: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    // Once the human edits an OCR-prefilled field, treat it as verified.
    setOcrKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function handleScan(blob: Blob) {
    if (!form) return;
    setScanning(true);
    setScanMessage(null);

    scanIne(blob)
      .then(({ fields }) => {
        const allFields = form.schema.secciones.flatMap((s) => s.campos);
        const patch: Record<string, unknown> = {};
        const labels: string[] = [];

        for (const key of OCR_KEYS) {
          const value = fields[key];
          if (!value) continue;
          const target = allFields.find((f) => f.key === key);
          if (!target) continue;
          patch[key] = value;
          labels.push(target.label);
        }

        if (labels.length === 0) {
          setScanMessage(
            "No se detectaron datos de la credencial que coincidan con los campos de este formulario. Captura los datos manualmente.",
          );
          return;
        }

        setAnswers((prev) => ({ ...prev, ...patch }));
        setOcrKeys((prev) => new Set([...prev, ...Object.keys(patch)]));
        setScanMessage(
          `Se prellenaron ${labels.length} campo(s) desde la credencial: ${labels.join(", ")}. Verifica los datos antes de enviar.`,
        );
        setScanOpen(false);
      })
      .catch(() => {
        // OCR is assist-only and must never block capture — surface a soft
        // hint and let the person keep typing.
        setScanMessage(
          "No se pudo leer la credencial (foto borrosa o formato no reconocido). Captura los datos manualmente.",
        );
      })
      .finally(() => setScanning(false));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;

    const validationErrors = validate(form.schema, answers);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);

    // "foto" answers are raw Blobs. The authenticated capture flow has no
    // endpoint to pre-upload evidencia before a Caso exists — evidencia can
    // only be attached to an already-created Caso (POST /casos/{id}/evidencia).
    // Same limitation documented in PublicFormPage; stripped here too.
    const fotoKeys = new Set(
      form.schema.secciones
        .flatMap((s) => s.campos)
        .filter((f) => f.tipo === "foto")
        .map((f) => f.key),
    );
    const payloadAnswers = Object.fromEntries(
      Object.entries(answers).filter(([key]) => !fotoKeys.has(key)),
    );

    try {
      const resp = await submitResponse({
        form_definition_id: form.id,
        answers: payloadAnswers,
      });

      let folio: string | undefined;
      if (resp.caso_id) {
        try {
          folio = (await getCaso(resp.caso_id)).folio;
        } catch {
          /* best-effort — fall back to showing the caso id below */
        }
      }
      setResult({ casoId: resp.caso_id, folio });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "No se pudo enviar la captura.",
      );
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  function resetAll() {
    resetCapture();
    setResult(null);
  }

  /* ------------------------------------------------------------ offline */

  if (!isOnline) {
    return (
      <AppLayout title="Atención Ciudadana" crumb="Atención Ciudadana">
        <PageHeader eyebrow="Atención Ciudadana" title="Captura" accent="Interna" />
        <div className="card-premium flex flex-col items-center gap-4 px-5 py-12 text-center">
          <span className="metric-chip h-12 w-12 text-state-warning">
            <AlertIcon width={20} height={20} />
          </span>
          <div>
            <p className="font-semibold text-ink">Necesitas conexión para capturar</p>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">
              La captura de atención ciudadana requiere conexión a internet
              para cargar el formulario y enviar tu registro. Vuelve a
              intentarlo cuando tengas señal.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  /* ------------------------------------------------------------ success */

  if (result) {
    return (
      <AppLayout title="Atención Ciudadana" crumb="Atención Ciudadana">
        <PageHeader eyebrow="Atención Ciudadana" title="Captura" accent="Interna" />
        <div className="card-premium flex flex-col items-center gap-4 px-5 py-12 text-center">
          <span className="metric-chip h-14 w-14 text-state-success">
            <CheckIcon />
          </span>
          <div>
            <p className="font-semibold text-ink">Caso registrado</p>
            <p className="mt-1 text-sm text-ink-muted">Folio</p>
            <p className="mt-1 font-display text-2xl font-bold text-gradient">
              {result.folio ?? result.casoId ?? "—"}
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={resetAll}>
            Capturar otro
          </button>
        </div>
      </AppLayout>
    );
  }

  /* ---------------------------------------------------- forms loading/error */

  if (formsState.loading) {
    return (
      <AppLayout title="Atención Ciudadana" crumb="Atención Ciudadana">
        <PageHeader eyebrow="Atención Ciudadana" title="Captura" accent="Interna" />
        <div className="h-40 animate-pulse rounded-lg bg-panel-hover" />
      </AppLayout>
    );
  }

  if (formsState.error) {
    return (
      <AppLayout title="Atención Ciudadana" crumb="Atención Ciudadana">
        <PageHeader eyebrow="Atención Ciudadana" title="Captura" accent="Interna" />
        <div className="card-premium animate-fade-in flex flex-col items-center gap-3 px-5 py-8 text-center">
          <span className="metric-chip h-10 w-10 text-state-critical">
            <AlertIcon width={18} height={18} />
          </span>
          <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
            {formsState.error}
          </p>
          <button type="button" className="btn-ghost" onClick={formsState.reload}>
            Reintentar
          </button>
        </div>
      </AppLayout>
    );
  }

  if (!form) {
    return (
      <AppLayout title="Atención Ciudadana" crumb="Atención Ciudadana">
        <PageHeader eyebrow="Atención Ciudadana" title="Captura" accent="Interna" />
        <div className="card-premium px-5 py-8 text-center text-sm text-ink-faint">
          No hay formularios activos para captura interna. Contacta a un
          administrador.
        </div>
      </AppLayout>
    );
  }

  /* ------------------------------------------------------------- capture */

  const allFields = form.schema.secciones.flatMap((s) => s.campos);

  return (
    <AppLayout title="Atención Ciudadana" crumb="Atención Ciudadana">
      <PageHeader
        eyebrow="Atención Ciudadana"
        title="Captura"
        accent="Interna"
        subtitle="Registra una petición, queja o solicitud de apoyo capturada en campo. Escanea la credencial del elector para agilizar el llenado."
        actions={
          eligibleForms.length > 1 ? (
            <select
              className="field-input w-56"
              aria-label="Formulario"
              value={form.id}
              onChange={(e) => handleSelectForm(e.target.value)}
            >
              {eligibleForms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        <Card title="Escanear credencial" accentDot>
          <p className="text-xs leading-relaxed text-ink-muted">
            Toma una foto de la credencial de elector para prellenar los
            campos coincidentes automáticamente. Los datos siempre quedan
            editables — verifica antes de enviar.
          </p>

          {!scanOpen ? (
            <button
              type="button"
              className="btn-primary mt-3 gap-2"
              onClick={() => setScanOpen(true)}
            >
              <ScanIcon />
              Escanear credencial (OCR)
            </button>
          ) : (
            <div className="mt-3">
              <PhotoCapture
                label="Foto de la credencial"
                onCapture={(blob) => blob && handleScan(blob)}
              />
              {scanning && (
                <p className="mt-2 text-xs font-medium text-accent">
                  Leyendo credencial…
                </p>
              )}
              <button
                type="button"
                className="btn-ghost mt-2 text-xs"
                onClick={() => setScanOpen(false)}
                disabled={scanning}
              >
                Cancelar escaneo
              </button>
            </div>
          )}

          {scanMessage && (
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              {scanMessage}
            </p>
          )}
        </Card>

        {ocrKeys.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
              OCR — verifica
            </span>
            {[...ocrKeys].map((key) => (
              <span key={key} className="pill border-accent/40 text-accent">
                {allFields.find((f) => f.key === key)?.label ?? key}
              </span>
            ))}
          </div>
        )}

        <Card title={form.nombre} accentDot>
          {form.descripcion && (
            <p className="mb-4 text-xs text-ink-muted">{form.descripcion}</p>
          )}
          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            <DynamicForm
              schema={form.schema}
              value={answers}
              onChange={handleChange}
              errors={errors}
            />

            {submitError && (
              <p className="mt-4 text-sm text-state-critical">{submitError}</p>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
}
