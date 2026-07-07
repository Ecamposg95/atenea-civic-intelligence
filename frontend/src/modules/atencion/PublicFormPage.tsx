// frontend/src/modules/atencion/PublicFormPage.tsx
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";

import { AlertIcon, LogoMark } from "@/components/ui/icons";
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
 * route registration in `App.tsx`. It therefore carries its own brand masthead
 * and backdrop so citizens land on something that reads as official Ágora.
 *
 * ANTI-ABUSE PENDING: the backend has no honeypot field or rate limiting on
 * this channel yet (documented in `public_forms.py`). Treat this page as a
 * functional preview, not a production-hardened public surface.
 */

type Stage = "loading" | "notfound" | "error" | "form" | "submitting" | "done";

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Standalone chrome for the citizen surface: brand masthead + soft backdrop + footer. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-bg text-ink">
      {/* Institutional backdrop — the same command-center language as PageHeader,
          calmed down for an anonymous public surface. */}
      <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="aura left-1/2 -top-24 h-72 w-72 -translate-x-1/2" aria-hidden="true" />
      <div className="aura aura-teal right-0 top-1/3 h-64 w-64" aria-hidden="true" />

      <div className="relative flex min-h-screen flex-col px-4 py-8 sm:py-12">
        <header className="reveal mx-auto flex w-full max-w-xl items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent shadow-glow-accent">
            <LogoMark width={22} height={22} />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="font-display text-sm font-semibold tracking-tight text-ink">Ágora</div>
            <div className="eyebrow">Atención Ciudadana</div>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-xl">{children}</div>
        </main>

        <footer className="reveal mx-auto w-full max-w-xl text-center text-[11px] text-ink-faint">
          Plataforma de Atención Ciudadana · Ágora
        </footer>
      </div>
    </div>
  );
}

/**
 * Full-height status card for the terminal stages (loading / notfound / error /
 * done). `tone` picks the icon chip color; `icon` defaults to an alert glyph.
 */
function StatusCard({
  title,
  body,
  tone = "neutral",
  icon,
  action,
}: {
  title: string;
  body: string;
  tone?: "success" | "critical" | "neutral";
  icon?: ReactNode;
  action?: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "text-teal"
      : tone === "critical"
        ? "text-state-critical"
        : "text-ink-faint";
  return (
    <div className="card-premium reveal flex flex-col items-center gap-4 p-8 text-center">
      <span className={`metric-chip h-14 w-14 ${toneClass}`}>
        {icon ?? <AlertIcon width={20} height={20} />}
      </span>
      <div>
        <p className="font-display text-lg font-semibold tracking-tight text-ink">{title}</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{body}</p>
      </div>
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
        <div className="card-premium animate-pulse space-y-3 p-8">
          <div className="mx-auto h-4 w-40 rounded bg-panel-hover" />
          <div className="h-3 w-full rounded bg-panel-hover" />
          <div className="h-3 w-2/3 rounded bg-panel-hover" />
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
          tone="critical"
          title="No se pudo cargar el formulario"
          body="Ocurrió un problema de conexión. Intenta de nuevo en unos minutos."
          action={
            <button
              type="button"
              className="btn-ghost focus-ring"
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
          tone="success"
          icon={<CheckIcon />}
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
      <div className="card-premium reveal p-6 sm:p-8">
        <div className="mb-6 border-b border-line pb-5">
          <p className="eyebrow">Atención Ciudadana</p>
          <h1 className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight text-ink">
            {form.nombre}
          </h1>
          {form.descripcion && (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{form.descripcion}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <DynamicForm schema={form.schema} value={answers} onChange={handleChange} errors={errors} />

          {submitError && (
            <div className="mt-5 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
              {submitError}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
            <p className="text-xs text-ink-faint">
              Los campos marcados con <span className="text-state-critical">*</span> son obligatorios.
            </p>
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
