import type { ReactNode } from "react";
import type { FormField, FormSchema } from "@/api/atencion";
import { PhotoCapture } from "@/modules/militantes/components/PhotoCapture";

/**
 * Dynamic JSON-schema form renderer.
 *
 * Renders each `seccion`/`campo` from a `FormSchema` (see `app/services/form_schema.py`
 * on the backend, which this file mirrors for client-side validation). Fields whose
 * `mostrar_si` condition is unmet are hidden from both rendering and validation —
 * matching the backend's `_visible` behavior exactly.
 */

export interface DynamicFormProps {
  schema: FormSchema;
  value: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors?: Record<string, string>;
}

/** Mirrors backend `_visible(schema, answers, field)` in app/services/form_schema.py. */
function isVisible(field: FormField, value: Record<string, unknown>): boolean {
  const cond = field.mostrar_si;
  if (!cond) return true;
  return value[cond.campo] === cond.igual;
}

/**
 * Client-side mirror of backend `validate_answers` (required + conditional).
 * Returns a map of field key -> error message for every visible, required
 * field that is missing a value. Hidden fields (per `mostrar_si`) are never
 * validated, exactly like the backend.
 */
export function validate(
  schema: FormSchema,
  value: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const seccion of schema.secciones ?? []) {
    for (const field of seccion.campos ?? []) {
      if (!isVisible(field, value)) continue;
      if (!field.requerido) continue;
      const v = value[field.key];
      const isEmpty =
        v === undefined ||
        v === null ||
        v === "" ||
        (Array.isArray(v) && v.length === 0);
      if (isEmpty) {
        errors[field.key] = `${field.label} es requerido`;
      }
    }
  }
  return errors;
}

const TEXT_LIKE_TYPES = new Set([
  "text",
  "phone",
  "email",
]);

function fieldInputType(tipo: string): string {
  switch (tipo) {
    case "email":
      return "email";
    case "date":
      return "date";
    case "phone":
      return "tel";
    default:
      return "text";
  }
}

interface FieldProps {
  field: FormField;
  value: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  error?: string;
}

function FieldWrapper({
  field,
  error,
  children,
}: {
  field: FormField;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={field.key} className="field-label">
        {field.label}
        {field.requerido && <span className="text-state-critical"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-state-critical">{error}</p>}
    </div>
  );
}

function Field({ field, value, onChange, error }: FieldProps) {
  const raw = value[field.key];

  if (TEXT_LIKE_TYPES.has(field.tipo) || field.tipo === "date") {
    return (
      <FieldWrapper field={field} error={error}>
        <input
          id={field.key}
          type={fieldInputType(field.tipo)}
          className="field-input"
          value={typeof raw === "string" ? raw : ""}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      </FieldWrapper>
    );
  }

  if (field.tipo === "textarea") {
    return (
      <FieldWrapper field={field} error={error}>
        <textarea
          id={field.key}
          rows={3}
          className="field-input resize-y"
          value={typeof raw === "string" ? raw : ""}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      </FieldWrapper>
    );
  }

  if (field.tipo === "number" || field.tipo === "seccion") {
    return (
      <FieldWrapper field={field} error={error}>
        <input
          id={field.key}
          type="text"
          inputMode="numeric"
          className="field-input"
          value={raw === undefined || raw === null ? "" : String(raw)}
          onChange={(e) => onChange(field.key, e.target.value.replace(/\D/g, ""))}
        />
      </FieldWrapper>
    );
  }

  if (field.tipo === "select") {
    return (
      <FieldWrapper field={field} error={error}>
        <select
          id={field.key}
          className="field-input"
          value={typeof raw === "string" ? raw : ""}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          <option value="">Selecciona…</option>
          {(field.opciones ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </FieldWrapper>
    );
  }

  if (field.tipo === "multiselect") {
    const selected = Array.isArray(raw) ? (raw as string[]) : [];
    return (
      <FieldWrapper field={field} error={error}>
        <div className="mt-1 flex flex-wrap gap-2">
          {(field.opciones ?? []).map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label
                key={opt}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  checked
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line text-ink-muted hover:border-accent/40"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 accent-accent"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((s) => s !== opt)
                      : [...selected, opt];
                    onChange(field.key, next);
                  }}
                />
                {opt}
              </label>
            );
          })}
        </div>
      </FieldWrapper>
    );
  }

  if (field.tipo === "boolean") {
    const checked = raw === true;
    return (
      <FieldWrapper field={field} error={error}>
        <button
          id={field.key}
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(field.key, !checked)}
          className={`mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
            checked ? "border-accent bg-accent/80 justify-end" : "border-line bg-bg-sunken justify-start"
          } px-0.5`}
        >
          <span className="h-5 w-5 rounded-full bg-white shadow" />
        </button>
      </FieldWrapper>
    );
  }

  if (field.tipo === "foto") {
    return (
      <PhotoCapture
        label={field.label + (field.requerido ? " *" : "")}
        onCapture={(blob) => onChange(field.key, blob)}
      />
    );
  }

  return null;
}

export function DynamicForm({ schema, value, onChange, errors }: DynamicFormProps) {
  return (
    <div className="flex flex-col gap-6">
      {(schema.secciones ?? []).map((seccion, idx) => {
        const visibleCampos = seccion.campos.filter((f) => isVisible(f, value));
        if (visibleCampos.length === 0) return null;
        return (
          <div key={`${seccion.titulo}-${idx}`} className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-ink">{seccion.titulo}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visibleCampos.map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={value}
                  onChange={onChange}
                  error={errors?.[field.key]}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
