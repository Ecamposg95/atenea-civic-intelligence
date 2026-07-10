// frontend/src/modules/atencion/CapturaAtencionPage.tsx
import { useState, type FormEvent } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StatusPill } from "@/components/ui/StatusPill";
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
import { enqueueJob } from "@/offline/queue";
import { isNetworkError } from "@/offline/sync";
import { usePendingSyncStore } from "@/store/pendingSyncStore";

import { DynamicForm, isVisible, validate } from "./components/DynamicForm";
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

// OCR yields free-text strings. Only prefill fields whose control accepts a
// string — injecting into a select/multiselect/boolean/foto field would corrupt
// its value until the user re-edits it.
const OCR_PREFILLABLE_TYPES = new Set([
  "text",
  "textarea",
  "number",
  "date",
  "phone",
  "email",
  "seccion",
]);

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
  /** True when the response was queued for background sync rather than
   * confirmed by the server — no folio/caso exists yet at this point. */
  offline?: boolean;
}

export default function CapturaAtencionPage() {
  const isOnline = useOnlineStatus();
  const { refresh: refreshPending } = usePendingSyncStore();
  const campaignId = localStorage.getItem("agora-campaign") ?? "";

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

  // Stable per form instance so an online submit that falls back to the
  // offline queue (network error mid-request) and a genuinely offline submit
  // both carry the same id — the backend dedupes `/responses` by
  // `client_uuid`, so a retried/queued submit can never create a duplicate
  // response. Regenerated whenever capture resets for the next person.
  const [clientUuid, setClientUuid] = useState<string>(() => crypto.randomUUID());

  function resetCapture() {
    setAnswers({});
    setErrors({});
    setOcrKeys(new Set());
    setScanOpen(false);
    setScanning(false);
    setScanMessage(null);
    setSubmitError(null);
    setClientUuid(crypto.randomUUID());
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
          if (!OCR_PREFILLABLE_TYPES.has(target.tipo)) continue;
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
    // Fields hidden by `mostrar_si` are skipped by both `validate` and
    // `DynamicForm`'s rendering — but any stale answer captured before the
    // condition flipped must not be submitted either. Reuse the same
    // visibility rule so hidden-field answers never reach /responses.
    const visibleKeys = new Set(
      form.schema.secciones
        .flatMap((s) => s.campos)
        .filter((f) => isVisible(f, answers))
        .map((f) => f.key),
    );
    const payloadAnswers = Object.fromEntries(
      Object.entries(answers).filter(([key]) => !fotoKeys.has(key) && visibleKeys.has(key)),
    );

    // `client_uuid` makes a queued/retried submit idempotent server-side —
    // harmless when submitted online, required for the offline fallback.
    const payload = {
      form_definition_id: form.id,
      answers: payloadAnswers,
      client_uuid: clientUuid,
    };

    const queueOffline = async () => {
      await enqueueJob("response", payload, campaignId, []);
      setResult({ offline: true });
      await refreshPending();
    };

    try {
      if (!navigator.onLine) {
        // No connectivity at all — skip the network attempt entirely.
        await queueOffline();
      } else {
        try {
          const resp = await submitResponse(payload);

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
          // Connectivity dropped mid-submit — fall back to the offline queue
          // instead of surfacing a hard error. Any other error (validation,
          // auth, server) is a real failure and must not be swallowed.
          if (isNetworkError(err)) {
            await queueOffline();
          } else {
            throw err;
          }
        }
      }
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

  /* ------------------------------------------------------------ success */

  if (result?.offline) {
    return (
      <AppLayout title="Atención Ciudadana" crumb="Atención Ciudadana">
        <PageHeader eyebrow="Atención Ciudadana" title="Captura" accent="Interna" />
        <div className="reveal flex flex-col items-center gap-5 py-10 text-center">
          <span className="metric-chip h-14 w-14 text-state-warning">
            <AlertIcon width={20} height={20} />
          </span>
          <div>
            <p className="font-semibold text-ink">Guardado sin conexión</p>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">
              Se registrará al reconectar — no necesitas hacer nada más. El
              folio se asignará una vez que el servidor confirme la captura.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={resetAll}>
            Capturar otro
          </button>
        </div>
      </AppLayout>
    );
  }

  if (result) {
    return (
      <AppLayout title="Atención Ciudadana" crumb="Atención Ciudadana">
        <PageHeader eyebrow="Atención Ciudadana" title="Captura" accent="Interna" />
        <div className="reveal flex flex-col items-center gap-5 py-10 text-center">
          <span className="metric-chip h-14 w-14 text-state-success">
            <CheckIcon />
          </span>
          <p className="font-semibold text-ink">Caso registrado</p>
          <div className="w-full max-w-xs">
            <MetricCard
              label="Folio"
              value={result.folio ?? result.casoId ?? "—"}
              tone="warm"
              delay={80}
            />
          </div>
          <button type="button" className="btn-primary" onClick={resetAll}>
            Capturar otro
          </button>
        </div>
      </AppLayout>
    );
  }

  /* ---------------------------------------------------- forms loading/error */

  if (formsState.loading || formsState.error || !form) {
    return (
      <AppLayout title="Atención Ciudadana" crumb="Atención Ciudadana">
        <PageHeader eyebrow="Atención Ciudadana" title="Captura" accent="Interna" />
        <DataState
          loading={formsState.loading}
          error={formsState.error}
          isEmpty={!form}
          onRetry={formsState.reload}
          emptyMessage="No hay formularios activos para captura interna. Contacta a un administrador."
        >
          {null}
        </DataState>
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

      {!isOnline && (
        <div className="reveal mb-2">
          <StatusPill kind="warn">
            Sin conexión — se guardará en este dispositivo y se sincronizará
            al reconectar
          </StatusPill>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <section className="reveal flex flex-col gap-3" style={{ animationDelay: "100ms" }}>
        <SectionHeading
          eyebrow="Asistencia"
          title="Escanear credencial"
          note={
            ocrKeys.size > 0
              ? `${ocrKeys.size} campo${ocrKeys.size === 1 ? "" : "s"} prellenado${ocrKeys.size === 1 ? "" : "s"}`
              : undefined
          }
        />
        <Card>
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
        </section>

        {ocrKeys.size > 0 && (
          <div className="reveal flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
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

        <section className="reveal flex flex-col gap-3" style={{ animationDelay: "200ms" }}>
        <SectionHeading eyebrow="Captura" title={form.nombre} />
        <Card>
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
        </section>
      </div>
    </AppLayout>
  );
}
