import { useRef, useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { createRegistro } from "@/api/registros";

/** Fields kept between entries (digitizing one promoter's list → same sección
 * and promotor repeat), vs. cleared per person. */
interface QuickForm {
  nombre_completo: string;
  seccion: string;
  telefono: string;
  colonia: string;
  direccion: string;
  promotor: string;
  clave_elector: string;
  consentimiento: boolean;
}

const EMPTY: QuickForm = {
  nombre_completo: "",
  seccion: "",
  telefono: "",
  colonia: "",
  direccion: "",
  promotor: "",
  clave_elector: "",
  consentimiento: false,
};

export function CapturaRapidaPage() {
  const [form, setForm] = useState<QuickForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okName, setOkName] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const nombreRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof QuickForm>(k: K, v: QuickForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Clave de elector is optional; when typed it must be exactly 18 alphanumeric.
  const claveDigits = form.clave_elector.trim();
  const claveInvalid = claveDigits.length > 0 && !/^[A-Za-z0-9]{18}$/.test(claveDigits);

  const canSave =
    form.nombre_completo.trim().length >= 2 && form.consentimiento && !claveInvalid && !saving;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setOkName(null);
    try {
      await createRegistro({
        nombre_completo: form.nombre_completo.trim(),
        seccion: form.seccion.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        colonia: form.colonia.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        promotor: form.promotor.trim() || undefined,
        clave_elector: claveDigits ? claveDigits.toUpperCase() : undefined,
        consentimiento: true,
      });
      setOkName(form.nombre_completo.trim());
      setCount((c) => c + 1);
      // Keep sección + promotor for the next person in the same list.
      setForm((f) => ({
        ...EMPTY,
        seccion: f.seccion,
        promotor: f.promotor,
        consentimiento: true,
      }));
      nombreRef.current?.focus();
    } catch {
      setError("No se pudo guardar. Revisa la conexión e intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="Captura rápida" crumb="Ciudadanía">
      <PageHeader
        eyebrow="Ciudadanía"
        title="Captura"
        accent="rápida"
        subtitle="Digitaliza listas en papel a toda velocidad. Guarda y captura otro sin perder sección ni promotor."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        {/* form */}
        <form onSubmit={save} className="card-premium reveal flex flex-col gap-4 p-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Nombre completo *</span>
            <input
              ref={nombreRef}
              autoFocus
              className="field-input h-11 text-base"
              value={form.nombre_completo}
              onChange={(e) => set("nombre_completo", e.target.value)}
              placeholder="Nombre y apellidos"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Sección</span>
              <input
                className="field-input h-11 font-mono"
                inputMode="numeric"
                value={form.seccion}
                onChange={(e) => set("seccion", e.target.value.replace(/\D/g, ""))}
                placeholder="0000"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Teléfono</span>
              <input
                className="field-input h-11 font-mono"
                inputMode="tel"
                value={form.telefono}
                onChange={(e) => set("telefono", e.target.value)}
                placeholder="10 dígitos"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Colonia</span>
              <input className="field-input h-11" value={form.colonia} onChange={(e) => set("colonia", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Promotor</span>
              <input className="field-input h-11" value={form.promotor} onChange={(e) => set("promotor", e.target.value)} placeholder="Quién promovió" />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Dirección</span>
            <input className="field-input h-11" value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Calle y número" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Clave de elector <span className="font-normal normal-case text-ink-subtle">(opcional)</span></span>
            <input
              className="field-input h-11 font-mono uppercase"
              value={form.clave_elector}
              onChange={(e) => set("clave_elector", e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 18))}
              placeholder="18 caracteres del INE"
              autoComplete="off"
            />
            {claveInvalid && (
              <span className="text-[10px] font-sans text-state-critical">La clave debe tener 18 caracteres alfanuméricos.</span>
            )}
          </label>

          <label className="flex items-start gap-2.5 rounded-card bg-panel-hover px-3.5 py-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-accent"
              checked={form.consentimiento}
              onChange={(e) => set("consentimiento", e.target.checked)}
            />
            <span className="text-sm text-ink-muted">
              El ciudadano dio su <span className="font-medium text-ink">consentimiento</span> conforme al aviso de privacidad. *
            </span>
          </label>

          {error && <div className="rounded-card bg-state-critical/10 px-3.5 py-2.5 text-sm text-state-critical">{error}</div>}
          {okName && (
            <div className="rounded-card bg-state-ok/10 px-3.5 py-2.5 text-sm text-state-ok">
              ✓ Guardado: <span className="font-medium">{okName}</span>. Captura el siguiente.
            </div>
          )}

          <button
            type="submit"
            disabled={!canSave}
            className="btn-primary focus-ring h-12 text-base disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Guardar y capturar otro"}
          </button>
        </form>

        {/* session counter */}
        <div className="flex flex-col gap-4">
          <MetricCard
            label="Capturados en esta sesión"
            value={String(count)}
            countTo={count}
            tone="warm"
            context="Desde que abriste esta pantalla"
          />
          <div className="card-premium reveal p-4 text-sm text-ink-muted">
            <p className="mb-2 font-medium text-ink">Tip de velocidad</p>
            Sección y Promotor se conservan al guardar — ideal para digitalizar la lista de un mismo promotor de corrido. Solo cambia el nombre y los datos de cada persona.
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
