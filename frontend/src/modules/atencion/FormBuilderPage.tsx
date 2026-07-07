// frontend/src/modules/atencion/FormBuilderPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useAsync } from "@/hooks/useAsync";
import {
  createForm,
  getForm,
  listForms,
  updateForm,
  type FormDefinition,
  type FormField,
  type FormSchema,
} from "@/api/atencion";

import { DynamicForm, validate } from "./components/DynamicForm";
import { FIELD_TYPES, FieldEditor, type EarlierField } from "./components/FieldEditor";

/* -------------------------------------------------------------- helpers */

/** Lowercase, hyphenated, ascii-safe slug derived from a name. Mirrors OrgsPage's slugify. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const OPTIONS_TYPES = new Set(["select", "multiselect"]);

function uniqueKey(base: string, taken: Set<string>): string {
  let candidate = base || "campo";
  let i = 1;
  while (taken.has(candidate)) {
    i += 1;
    candidate = `${base || "campo"}_${i}`;
  }
  return candidate;
}

const TIPO_OPTIONS = [
  { value: "PETICION", label: "Petición" },
  { value: "QUEJA", label: "Queja" },
  { value: "APOYO", label: "Apoyo" },
  { value: "OTRO", label: "Otro" },
];

const CANAL_OPTIONS = [
  { value: "INTERNO", label: "Interno" },
  { value: "PUBLICO", label: "Público" },
  { value: "AMBOS", label: "Ambos" },
];

interface MetaState {
  nombre: string;
  tipo: string;
  canal: string;
  slug: string;
  is_active: boolean;
}

const EMPTY_META: MetaState = {
  nombre: "",
  tipo: "PETICION",
  canal: "INTERNO",
  slug: "",
  is_active: true,
};

const EMPTY_SCHEMA: FormSchema = {
  secciones: [{ titulo: "Sección 1", campos: [] }],
};

/* ------------------------------------------------------------- component */

/**
 * Visual builder for Atención Ciudadana forms: field-type palette + section
 * management on the left, the editable form structure in the center (each
 * field via `FieldEditor`, including the `mostrar_si` conditional-logic
 * rule), and a live `<DynamicForm>` preview on the right. Meta (nombre,
 * tipo, canal, slug) sits above. `?id=<formId>` switches into edit mode.
 */
export function FormBuilderPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const formId = searchParams.get("id");

  const existingState = useAsync<FormDefinition | null>(
    () => (formId ? getForm(formId) : Promise.resolve(null)),
    [formId],
  );
  const listState = useAsync(() => listForms(), []);

  const [meta, setMeta] = useState<MetaState>(EMPTY_META);
  const [slugTouched, setSlugTouched] = useState(false);
  const [schema, setSchema] = useState<FormSchema>(EMPTY_SCHEMA);
  const [selectedSectionIdx, setSelectedSectionIdx] = useState(0);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});
  const [showValidation, setShowValidation] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Load an existing form into the builder whenever ?id= resolves.
  useEffect(() => {
    if (!existingState.data) return;
    const d = existingState.data;
    setMeta({ nombre: d.nombre, tipo: d.tipo, canal: d.canal, slug: d.slug, is_active: d.is_active });
    setSlugTouched(true);
    setSchema(d.schema?.secciones?.length ? d.schema : EMPTY_SCHEMA);
    setSelectedSectionIdx(0);
    setPreviewAnswers({});
    setShowValidation(false);
    setSaveError(null);
    setSaveMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingState.data]);

  const secciones = schema.secciones ?? [];
  const clampedSectionIdx = Math.min(selectedSectionIdx, Math.max(0, secciones.length - 1));
  const totalCampos = secciones.reduce((acc, s) => acc + s.campos.length, 0);

  /* ------------------------------------------------------ meta handlers */

  function handleNombreChange(nombre: string): void {
    setMeta((m) => ({ ...m, nombre, ...(slugTouched ? {} : { slug: slugify(nombre) }) }));
  }

  function handleSlugChange(slug: string): void {
    setSlugTouched(true);
    setMeta((m) => ({ ...m, slug: slugify(slug) }));
  }

  /* -------------------------------------------------- section handlers */

  function addSection(): void {
    const idx = secciones.length;
    setSchema((s) => ({ secciones: [...s.secciones, { titulo: `Sección ${idx + 1}`, campos: [] }] }));
    setSelectedSectionIdx(idx);
  }

  function renameSection(idx: number, titulo: string): void {
    setSchema((s) => ({
      secciones: s.secciones.map((sec, i) => (i === idx ? { ...sec, titulo } : sec)),
    }));
  }

  function removeSection(idx: number): void {
    if (!window.confirm("¿Eliminar esta sección y todos sus campos?")) return;
    setSchema((s) => ({ secciones: s.secciones.filter((_, i) => i !== idx) }));
    setSelectedSectionIdx((i) => Math.max(0, Math.min(i, secciones.length - 2)));
  }

  function moveSection(idx: number, dir: -1 | 1): void {
    const target = idx + dir;
    if (target < 0 || target >= secciones.length) return;
    setSchema((s) => {
      const next = [...s.secciones];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { secciones: next };
    });
    setSelectedSectionIdx((i) => (i === idx ? target : i === target ? idx : i));
  }

  /* ---------------------------------------------------- field handlers */

  function addField(sectionIdx: number, tipo: string): void {
    const typeMeta = FIELD_TYPES.find((t) => t.value === tipo);
    const takenKeys = new Set(secciones.flatMap((s) => s.campos.map((c) => c.key)));
    const key = uniqueKey(tipo, takenKeys);
    const newField: FormField = {
      key,
      tipo,
      label: typeMeta?.label ?? tipo,
      requerido: false,
      ...(OPTIONS_TYPES.has(tipo) ? { opciones: ["Opción 1", "Opción 2"] } : {}),
    };
    setSchema((s) => ({
      secciones: s.secciones.map((sec, i) =>
        i === sectionIdx ? { ...sec, campos: [...sec.campos, newField] } : sec,
      ),
    }));
  }

  function updateField(sectionIdx: number, fieldIdx: number, next: FormField): void {
    setSchema((s) => ({
      secciones: s.secciones.map((sec, i) =>
        i === sectionIdx
          ? { ...sec, campos: sec.campos.map((c, j) => (j === fieldIdx ? next : c)) }
          : sec,
      ),
    }));
  }

  function removeField(sectionIdx: number, fieldIdx: number): void {
    setSchema((s) => ({
      secciones: s.secciones.map((sec, i) =>
        i === sectionIdx ? { ...sec, campos: sec.campos.filter((_, j) => j !== fieldIdx) } : sec,
      ),
    }));
  }

  function moveField(sectionIdx: number, fieldIdx: number, dir: -1 | 1): void {
    setSchema((s) => ({
      secciones: s.secciones.map((sec, i) => {
        if (i !== sectionIdx) return sec;
        const target = fieldIdx + dir;
        if (target < 0 || target >= sec.campos.length) return sec;
        const next = [...sec.campos];
        [next[fieldIdx], next[target]] = [next[target], next[fieldIdx]];
        return { ...sec, campos: next };
      }),
    }));
  }

  /** Fields that appear strictly before (section, field) index — valid `mostrar_si` targets. */
  function earlierFieldsFor(sectionIdx: number, fieldIdx: number): EarlierField[] {
    const out: EarlierField[] = [];
    secciones.forEach((sec, si) => {
      sec.campos.forEach((f, fi) => {
        if (si < sectionIdx || (si === sectionIdx && fi < fieldIdx)) {
          out.push({ key: f.key, label: f.label, tipo: f.tipo, opciones: f.opciones });
        }
      });
    });
    return out;
  }

  /* ------------------------------------------------------------ save */

  const structureErrors = useMemo(() => {
    const errors: string[] = [];
    if (!meta.nombre.trim()) errors.push("El nombre es obligatorio.");
    if (!meta.slug.trim()) errors.push("El slug es obligatorio.");
    if (secciones.length === 0) errors.push("Agrega al menos una sección.");

    const allKeys: string[] = [];
    for (const sec of secciones) {
      for (const f of sec.campos) {
        if (!f.key.trim() || !f.label.trim()) {
          errors.push("Todos los campos deben tener etiqueta y clave.");
        }
        if (OPTIONS_TYPES.has(f.tipo) && (!f.opciones || f.opciones.length === 0)) {
          errors.push(`El campo "${f.label || f.key}" necesita al menos una opción.`);
        }
        allKeys.push(f.key);
      }
    }
    const dupes = allKeys.filter((k, i) => k && allKeys.indexOf(k) !== i);
    if (dupes.length > 0) errors.push("Las claves de los campos deben ser únicas.");

    return [...new Set(errors)];
  }, [meta, secciones]);

  const canSave = structureErrors.length === 0 && !saving;

  async function handleSave(): Promise<void> {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    const payload: Partial<FormDefinition> = {
      nombre: meta.nombre.trim(),
      tipo: meta.tipo,
      canal: meta.canal,
      slug: meta.slug.trim(),
      is_active: meta.is_active,
      schema,
    };
    try {
      if (formId) {
        await updateForm(formId, payload);
        setSaveMessage("Formulario actualizado.");
      } else {
        const created = await createForm(payload);
        setSaveMessage("Formulario creado.");
        navigate(`/atencion/formularios?id=${created.id}`, { replace: true });
      }
      listState.reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Error al guardar el formulario.");
    } finally {
      setSaving(false);
    }
  }

  function resetToNew(): void {
    setMeta(EMPTY_META);
    setSlugTouched(false);
    setSchema(EMPTY_SCHEMA);
    setSelectedSectionIdx(0);
    setPreviewAnswers({});
    setShowValidation(false);
    setSaveError(null);
    setSaveMessage(null);
    navigate("/atencion/formularios");
  }

  const previewErrors = showValidation ? validate(schema, previewAnswers) : undefined;
  const savedForms = listState.data ?? [];

  return (
    <AppLayout title="Constructor de Formularios" crumb="Atención Ciudadana">
      <PageHeader
        eyebrow="Atención Ciudadana"
        title="Constructor de"
        accent="Formularios"
        subtitle="Diseña formularios de captación con secciones, lógica condicional y vista previa en vivo."
        actions={
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost" onClick={resetToNew}>
              Nuevo formulario
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canSave}
              onClick={() => void handleSave()}
            >
              {saving ? "Guardando…" : formId ? "Guardar cambios" : "Crear formulario"}
            </button>
          </div>
        }
      />

      {/* Saved forms switcher */}
      {savedForms.length > 0 && (
        <div className="reveal mb-4 flex flex-wrap gap-2" style={{ animationDelay: "40ms" }}>
          {savedForms.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => navigate(`/atencion/formularios?id=${f.id}`)}
              className={`pill transition-colors ${
                f.id === formId
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-line text-ink-muted hover:border-accent/40"
              }`}
            >
              {f.nombre}
            </button>
          ))}
        </div>
      )}

      {existingState.loading && formId && (
        <p className="mb-3 text-xs text-ink-faint">Cargando formulario…</p>
      )}
      {existingState.error && formId && (
        <div className="mb-3 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-xs text-state-critical">
          {existingState.error}
        </div>
      )}

      {/* Meta */}
      <div className="reveal mb-4" style={{ animationDelay: "100ms" }}>
        <Card title="Datos del formulario" accentDot>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="field-label">Nombre</span>
              <input
                value={meta.nombre}
                onChange={(e) => handleNombreChange(e.target.value)}
                placeholder="Ej. Solicitud de apoyo"
                className="field-input w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="field-label">Tipo</span>
              <select
                value={meta.tipo}
                onChange={(e) => setMeta((m) => ({ ...m, tipo: e.target.value }))}
                className="field-input w-full"
              >
                {TIPO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="field-label">Canal</span>
              <select
                value={meta.canal}
                onChange={(e) => setMeta((m) => ({ ...m, canal: e.target.value }))}
                className="field-input w-full"
              >
                {CANAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="field-label">Slug</span>
              <input
                value={meta.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="solicitud-de-apoyo"
                className="field-input w-full font-mono text-xs"
              />
            </label>

            <label className="mt-1 flex cursor-pointer items-center gap-2 self-end pb-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-accent"
                checked={meta.is_active}
                onChange={(e) => setMeta((m) => ({ ...m, is_active: e.target.checked }))}
              />
              Formulario activo
              {existingState.data && (
                <span className="pill border-line text-ink-faint">v{existingState.data.version}</span>
              )}
            </label>
          </div>

          {structureErrors.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 rounded-lg border border-state-warning/30 bg-state-warning/5 px-3 py-2 text-xs text-state-warning">
              {structureErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
          {saveError && (
            <div className="mt-3 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-xs text-state-critical">
              {saveError}
            </div>
          )}
          {saveMessage && (
            <div className="mt-3 rounded-lg border border-state-success/40 bg-state-success/10 px-3 py-2 text-xs text-state-success">
              {saveMessage}
            </div>
          )}
        </Card>
      </div>

      {/* Left: palette + sections | Center: structure | Right: preview */}
      <div className="reveal mb-4" style={{ animationDelay: "160ms" }}>
        <SectionHeading
          eyebrow="Constructor"
          title="Diseño del formulario"
          note={`${secciones.length} sección${secciones.length === 1 ? "" : "es"} · ${totalCampos} campo${totalCampos === 1 ? "" : "s"}`}
        />
      </div>

      <div className="reveal grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_380px]" style={{ animationDelay: "220ms" }}>
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <Card title="Agregar campo" accentDot>
            {secciones.length === 0 ? (
              <p className="text-xs text-ink-faint">Agrega una sección primero.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {FIELD_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => addField(clampedSectionIdx, t.value)}
                    className="btn-ghost justify-start px-2.5 py-2 text-left text-xs"
                    title={`Agregar a "${secciones[clampedSectionIdx]?.titulo}"`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card title="Secciones" accentDot>
            <div className="flex flex-col gap-2">
              {secciones.map((sec, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedSectionIdx(idx)}
                  className={`flex items-center gap-1.5 rounded-lg border p-2 transition-colors ${
                    idx === clampedSectionIdx
                      ? "border-accent/40 bg-accent/5"
                      : "border-line hover:border-accent/30"
                  }`}
                >
                  <input
                    value={sec.titulo}
                    onChange={(e) => renameSection(idx, e.target.value)}
                    className="field-input min-w-0 flex-1 !py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveSection(idx, -1);
                    }}
                    title="Subir sección"
                    aria-label="Subir sección"
                    className="rounded-md p-1 text-ink-faint transition-colors hover:bg-panel-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m18 15-6-6-6 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={idx === secciones.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveSection(idx, 1);
                    }}
                    title="Bajar sección"
                    aria-label="Bajar sección"
                    className="rounded-md p-1 text-ink-faint transition-colors hover:bg-panel-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSection(idx);
                    }}
                    title="Eliminar sección"
                    aria-label="Eliminar sección"
                    className="rounded-md p-1 text-ink-faint transition-colors hover:bg-state-critical/10 hover:text-state-critical"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              ))}
              <button type="button" onClick={addSection} className="btn-ghost mt-1 w-full justify-center text-xs">
                + Agregar sección
              </button>
            </div>
          </Card>
        </div>

        {/* Center column: form structure */}
        <div className="flex flex-col gap-4">
          {secciones.length === 0 ? (
            <div className="card-premium px-5 py-12 text-center text-sm text-ink-muted">
              Este formulario no tiene secciones todavía.
            </div>
          ) : (
            secciones.map((sec, sIdx) => (
              <Card
                key={sIdx}
                title={sec.titulo || `Sección ${sIdx + 1}`}
                accentDot
                action={<span className="pill border-line text-ink-faint">{sec.campos.length} campos</span>}
              >
                {sec.campos.length === 0 ? (
                  <p className="text-xs text-ink-faint">
                    Sin campos en esta sección. Selecciónala y agrega un campo desde la paleta.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {sec.campos.map((field, fIdx) => (
                      <FieldEditor
                        key={`${sIdx}-${fIdx}-${field.key}`}
                        field={field}
                        earlierFields={earlierFieldsFor(sIdx, fIdx)}
                        onChange={(next) => updateField(sIdx, fIdx, next)}
                        onRemove={() => removeField(sIdx, fIdx)}
                        onMoveUp={() => moveField(sIdx, fIdx, -1)}
                        onMoveDown={() => moveField(sIdx, fIdx, 1)}
                        canMoveUp={fIdx > 0}
                        canMoveDown={fIdx < sec.campos.length - 1}
                      />
                    ))}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>

        {/* Right column: live preview */}
        <div>
          <Card
            title="Vista previa"
            accentDot
            action={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowValidation((v) => !v)}
                  className={`text-xs font-semibold ${showValidation ? "text-accent" : "text-ink-faint"}`}
                >
                  Validar
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAnswers({})}
                  className="text-xs font-semibold text-ink-faint hover:text-ink"
                >
                  Reiniciar
                </button>
              </div>
            }
          >
            <DynamicForm
              schema={schema}
              value={previewAnswers}
              onChange={(key, value) => setPreviewAnswers((p) => ({ ...p, [key]: value }))}
              errors={previewErrors}
            />
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

export default FormBuilderPage;
