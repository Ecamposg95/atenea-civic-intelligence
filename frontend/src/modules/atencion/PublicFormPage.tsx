// frontend/src/modules/atencion/PublicFormPage.tsx
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";

import { getPublicForm, submitPublicResponse, type FormDefinition } from "@/api/atencion";

import { DynamicForm, validate } from "./components/DynamicForm";

/**
 * Public, unauthenticated citizen intake page — route `/p/:slug`.
 *
 * This route is only reachable end-to-end when the backend flag
 * `PUBLIC_FORMS_ENABLED` is on (see `backend/app/routers/public_forms.py`);
 * while it's off, `GET /public/forms/{slug}` 404s unconditionally and this
 * page renders the "not available" state below regardless of whether the
 * slug is real. It is deliberately rendered OUTSIDE the authenticated
 * `AppLayout` shell (no sidebar/topbar, no JWT, no `X-Campaign-Id`) — see the
 * route registration in `App.tsx`.
 *
 * ANTI-ABUSE PENDING: the backend has no honeypot field or rate limiting on
 * this channel yet (documented in `public_forms.py`). Treat this page as a
 * functional preview, not a production-hardened public surface.
 */

type Stage = "loading" | "notfound" | "error" | "form" | "submitting" | "done";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}

function StatusCard({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card-premium animate-fade-in flex flex-col items-center gap-2 p-8 text-center">
      <p className="text-lg font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-sm leading-relaxed text-ink-muted">{body}</p>
      {action}
    </div>
  );
}

export default function PublicFormPage() {
  const { slug = "" } = useParams<{ slug: string }>();

  const [stage, setStage] = useState<Stage>("loading");
  const [form, setForm] = useState<FormDefinition | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStage("loading");
    setForm(null);
    setAnswers({});
    setErrors({});
    setSubmitError(null);

    getPublicForm(slug)
      .then((f) => {
        if (cancelled) return;
        setForm(f);
        setStage("form");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const status = (e as { status?: number } | undefined)?.status;
        // A disabled/missing/inactive/non-public form all 404 identically on
        // the backend (see public_forms.py `_guard_enabled` / `_resolve_public_form`) —
        // there's no way (or need) to distinguish them client-side.
        setStage(status === 404 ? "notfound" : "error");
      });

    return () => {
      cancelled = true;
    };
  }, [slug, reloadNonce]);

  // Field keys of type "foto" — the public/anonymous submission endpoint has
  // no `evidencia_keys` support at all ("anonymous callers cannot reference
  // arbitrary bucket keys", backend/app/routers/public_forms.py), so a raw
  // Blob captured via PhotoCapture can never be sent through this channel.
  // Excluded from the outgoing payload below; see handleSubmit.
  const fotoKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const seccion of form?.schema.secciones ?? []) {
      for (const campo of seccion.campos ?? []) {
        if (campo.tipo === "foto") keys.add(campo.key);
      }
    }
    return keys;
  }, [form]);

  function handleChange(key: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
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
    setStage("submitting");

    const payloadAnswers = Object.fromEntries(
      Object.entries(answers).filter(([key]) => !fotoKeys.has(key)),
    );

    try {
      await submitPublicResponse(slug, { answers: payloadAnswers });
      setStage("done");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "No se pudo enviar tu solicitud.");
      setStage("form");
    }
  }

  if (stage === "loading") {
    return (
      <Shell>
        <div className="card-premium animate-pulse p-8 text-center text-ink-faint">
          Cargando formulario…
        </div>
      </Shell>
    );
  }

  if (stage === "notfound") {
    return (
      <Shell>
        <StatusCard
          title="Formulario no disponible"
          body="Este enlace no existe o ya no está activo. Verifica el enlace o contacta a quien te lo compartió."
        />
      </Shell>
    );
  }

  if (stage === "error") {
    return (
      <Shell>
        <StatusCard
          title="No se pudo cargar el formulario"
          body="Ocurrió un problema de conexión. Intenta de nuevo en unos minutos."
          action={
            <button
              type="button"
              className="btn-ghost focus-ring mt-2"
              onClick={() => setReloadNonce((n) => n + 1)}
            >
              Reintentar
            </button>
          }
        />
      </Shell>
    );
  }

  if (stage === "done") {
    return (
      <Shell>
        <StatusCard
          title="¡Gracias!"
          body="Tu petición fue recibida. Si es necesario, alguien de nuestro equipo te contactará."
        />
      </Shell>
    );
  }

  // stage === "form" | "submitting" — form must be loaded at this point.
  if (!form) return null;

  return (
    <Shell>
      <div className="card-premium p-6 sm:p-8">
        <div className="mb-6">
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
            Atención Ciudadana
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">{form.nombre}</h1>
          {form.descripcion && (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{form.descripcion}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <DynamicForm schema={form.schema} value={answers} onChange={handleChange} errors={errors} />

          {submitError && (
            <p className="mt-4 text-sm text-state-critical">{submitError}</p>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={stage === "submitting"}
              className="btn-primary focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {stage === "submitting" ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
