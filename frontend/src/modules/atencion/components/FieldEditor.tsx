// frontend/src/modules/atencion/components/FieldEditor.tsx
import { useState } from "react";

import type { FormField } from "@/api/atencion";

/** The 11 field types supported by the backend `form_schema.FIELD_TYPES`. */
export const FIELD_TYPES: { value: string; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "textarea", label: "Área de texto" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Selección única" },
  { value: "multiselect", label: "Selección múltiple" },
  { value: "boolean", label: "Sí / No" },
  { value: "phone", label: "Teléfono" },
  { value: "email", label: "Correo" },
  { value: "seccion", label: "Sección electoral" },
  { value: "foto", label: "Foto" },
];

const FIELD_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  FIELD_TYPES.map((t) => [t.value, t.label]),
);

const OPTIONS_TYPES = new Set(["select", "multiselect"]);

/** Lowercase, underscored, ascii-safe key derived from a label. Mirrors OrgsPage's slugify. */
function keyify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** A field earlier in the flattened form structure — candidate for a `mostrar_si` rule. */
export interface EarlierField {
  key: string;
  label: string;
  opciones?: string[];
}

interface FieldEditorProps {
  field: FormField;
  /** Fields that appear before this one in the form — valid `mostrar_si.campo` targets. */
  earlierFields: EarlierField[];
  onChange: (next: FormField) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

/**
 * Editor card for a single `FormField`: label, key, requerido, opciones
 * (select/multiselect), sensible toggle and a `mostrar_si` conditional-logic
 * rule builder referencing an earlier field's key + value. Collapsed by
 * default to keep the center column scannable; expands to edit.
 */
export function FieldEditor({
  field,
  earlierFields,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
}: FieldEditorProps) {
  const [open, setOpen] = useState(false);

  function patch(partial: Partial<FormField>): void {
    onChange({ ...field, ...partial });
  }

  function handleLabelChange(label: string): void {
    // Auto-derive the key from the label until the user has set one manually.
    const shouldSyncKey = field.key === "" || field.key === keyify(field.label);
    patch({ label, ...(shouldSyncKey ? { key: keyify(label) } : {}) });
  }

  const condTarget = earlierFields.find((f) => f.key === field.mostrar_si?.campo);

  function setCondCampo(campo: string): void {
    if (!campo) {
      const { mostrar_si: _drop, ...rest } = field;
      onChange(rest);
      return;
    }
    patch({ mostrar_si: { campo, igual: field.mostrar_si?.igual ?? "" } });
  }

  function setCondIgual(igual: string): void {
    if (!field.mostrar_si) return;
    patch({ mostrar_si: { ...field.mostrar_si, igual } });
  }

  return (
    <div className="rounded-lg border border-line bg-bg-sunken">
      {/* Header row: summary + structural actions */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 text-ink-faint transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          <span className="truncate text-sm font-semibold text-ink">
            {field.label || "(sin etiqueta)"}
          </span>
          <span className="pill shrink-0 border-line text-[10px] text-ink-faint">
            {FIELD_TYPE_LABEL[field.tipo] ?? field.tipo}
          </span>
          {field.requerido && (
            <span className="shrink-0 text-xs text-state-critical">*</span>
          )}
          {field.sensible && (
            <span className="pill shrink-0 border-state-warning/30 bg-state-warning/10 text-[10px] text-state-warning">
              sensible
            </span>
          )}
          {field.mostrar_si && (
            <span className="pill shrink-0 border-accent/30 bg-accent/10 text-[10px] text-accent">
              condicional
            </span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            title="Subir campo"
            aria-label="Subir campo"
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-panel-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m18 15-6-6-6 6" />
            </svg>
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            title="Bajar campo"
            aria-label="Bajar campo"
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-panel-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Eliminar campo"
            aria-label="Eliminar campo"
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-state-critical/10 hover:text-state-critical"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded body: editable properties */}
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Etiqueta
              </span>
              <input
                value={field.label}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="Ej. Nombre completo"
                className="field-input w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Clave (key)
              </span>
              <input
                value={field.key}
                onChange={(e) => patch({ key: keyify(e.target.value) })}
                placeholder="ej_nombre_completo"
                className="field-input w-full font-mono text-xs"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-accent"
                checked={Boolean(field.requerido)}
                onChange={(e) => patch({ requerido: e.target.checked })}
              />
              Requerido
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-accent"
                checked={Boolean(field.sensible)}
                onChange={(e) => patch({ sensible: e.target.checked })}
              />
              Dato sensible
            </label>
          </div>

          {OPTIONS_TYPES.has(field.tipo) && (
            <OpcionesEditor
              opciones={field.opciones ?? []}
              onChange={(opciones) => patch({ opciones })}
            />
          )}

          {/* mostrar_si conditional-logic rule builder */}
          <div className="rounded-lg border border-line/70 bg-panel p-2.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              Mostrar solo si…
            </span>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={field.mostrar_si?.campo ?? ""}
                onChange={(e) => setCondCampo(e.target.value)}
                disabled={earlierFields.length === 0}
                className="field-input w-full text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Sin condición</option>
                {earlierFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label || f.key}
                  </option>
                ))}
              </select>

              {field.mostrar_si &&
                (condTarget?.opciones && condTarget.opciones.length > 0 ? (
                  <select
                    value={field.mostrar_si.igual}
                    onChange={(e) => setCondIgual(e.target.value)}
                    className="field-input w-full text-sm"
                  >
                    <option value="">Selecciona un valor…</option>
                    {condTarget.opciones.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={field.mostrar_si.igual}
                    onChange={(e) => setCondIgual(e.target.value)}
                    placeholder="Valor exacto (ej. si)"
                    className="field-input w-full text-sm"
                  />
                ))}
            </div>
            {earlierFields.length === 0 && (
              <p className="mt-1.5 text-xs text-ink-faint">
                Agrega este campo después de otro para poder condicionarlo.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Chip-list editor for `opciones` (select/multiselect). */
function OpcionesEditor({
  opciones,
  onChange,
}: {
  opciones: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addOpcion(): void {
    const value = draft.trim();
    if (!value || opciones.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...opciones, value]);
    setDraft("");
  }

  return (
    <div>
      <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
        Opciones
      </span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {opciones.map((opt) => (
          <span
            key={opt}
            className="pill flex items-center gap-1 border-line text-ink-muted"
          >
            {opt}
            <button
              type="button"
              onClick={() => onChange(opciones.filter((o) => o !== opt))}
              aria-label={`Eliminar opción ${opt}`}
              className="text-ink-faint hover:text-state-critical"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOpcion();
            }
          }}
          placeholder="Nueva opción…"
          className="field-input w-full text-sm"
        />
        <button
          type="button"
          onClick={addOpcion}
          disabled={!draft.trim()}
          className="btn-ghost shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Agregar
        </button>
      </div>
    </div>
  );
}
