// frontend/src/modules/minutas/MinutaEditorPage.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import {
  addAcuerdo,
  createMinuta,
  getMinuta,
  updateMinuta,
  type Asistente,
  type Minuta,
  type MinutaCreate,
} from "@/api/minutas";

const EMPTY: MinutaCreate = {
  titulo: "",
  fecha: new Date().toISOString().slice(0, 10),
  lugar: "",
  tipo: "REUNION",
  asistentes: [],
  cuerpo: "",
  acuerdos: [],
};

/**
 * Handles both `/minutas/nueva` (create) and `/minutas/:id/editar` (edit) —
 * mode is detected from the `:id` route param. In create mode, draft acuerdos
 * live in local form state and ship inside `createMinuta`'s payload. In edit
 * mode the minuta already exists, so a new acuerdo is posted immediately via
 * `addAcuerdo` and merged into the loaded `minuta`; the acta fields (título,
 * fecha, lugar, tipo, asistentes, notas) still save via `updateMinuta`.
 */
export function MinutaEditorPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const editing = Boolean(id);

  const [form, setForm] = useState<MinutaCreate>(EMPTY);
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Load failure in EDIT mode — distinct from `error` (save/publish/acuerdo
  // failures) so a save error after a successful load never re-hides the
  // already-loaded form. See loadFailed gate below.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [asistenteInput, setAsistenteInput] = useState("");
  const [acuerdoTexto, setAcuerdoTexto] = useState("");
  const [acuerdoFecha, setAcuerdoFecha] = useState("");
  const [addingAcuerdo, setAddingAcuerdo] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getMinuta(id)
      .then((m) => {
        if (cancelled) return;
        setMinuta(m);
        setForm({
          titulo: m.titulo,
          fecha: m.fecha,
          lugar: m.lugar ?? "",
          tipo: m.tipo,
          estado: m.estado,
          asistentes: m.asistentes,
          cuerpo: m.cuerpo ?? "",
          area_id: m.area_id,
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "No se pudo cargar la minuta.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  // EDIT mode only becomes safe to render (and save) once the existing
  // minuta has actually loaded — otherwise "Guardar cambios" would submit
  // the EMPTY defaults and overwrite the real record. See Fix 1.
  const editLoadFailed = editing && !loading && (Boolean(loadError) || !minuta);

  const set = <K extends keyof MinutaCreate>(k: K, v: MinutaCreate[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function addAsistente() {
    const nombre = asistenteInput.trim();
    if (!nombre) return;
    set("asistentes", [...(form.asistentes ?? []), { nombre }]);
    setAsistenteInput("");
  }
  function removeAsistente(idx: number) {
    set("asistentes", (form.asistentes ?? []).filter((_, i) => i !== idx));
  }

  async function addAcuerdoRow() {
    const texto = acuerdoTexto.trim();
    if (!texto) return;
    if (editing && id) {
      setAddingAcuerdo(true);
      setError(null);
      try {
        const created = await addAcuerdo(id, { texto, fecha_limite: acuerdoFecha || undefined });
        setMinuta((m) =>
          m
            ? { ...m, acuerdos: [...m.acuerdos, created], acuerdos_pendientes: m.acuerdos_pendientes + 1 }
            : m,
        );
        setAcuerdoTexto("");
        setAcuerdoFecha("");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "No se pudo agregar el acuerdo.");
      } finally {
        setAddingAcuerdo(false);
      }
    } else {
      set("acuerdos", [...(form.acuerdos ?? []), { texto, fecha_limite: acuerdoFecha || undefined }]);
      setAcuerdoTexto("");
      setAcuerdoFecha("");
    }
  }
  function removeAcuerdoDraft(idx: number) {
    set("acuerdos", (form.acuerdos ?? []).filter((_, i) => i !== idx));
  }

  const canSave = form.titulo.trim().length >= 3 && Boolean(form.fecha) && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      if (editing && id) {
        const saved = await updateMinuta(id, form);
        nav(`/minutas/${saved.id}`);
      } else {
        const created = await createMinuta(form);
        nav(`/minutas/${created.id}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la minuta.");
    } finally {
      setSaving(false);
    }
  }

  async function publicar() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await updateMinuta(id, { estado: "PUBLICADA" });
      nav(`/minutas/${saved.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo publicar la minuta.");
    } finally {
      setSaving(false);
    }
  }

  // Gate the entire form in EDIT mode until the real minuta has loaded —
  // never render (or allow saving) the EMPTY-default form over a load
  // failure. Create mode (`editing === false`) is unaffected: `loading` is
  // initialized to `false` there, so it falls straight through.
  if (editing && (loading || editLoadFailed)) {
    return (
      <AppLayout title="Editar minuta" crumb="Ciudadanía">
        <PageHeader
          eyebrow="Ciudadanía"
          title="Editar"
          accent="minuta"
          subtitle="Registra el acta de la reunión: asistentes, notas y los acuerdos con su fecha límite."
        />
        <DataState
          loading={loading}
          error={editLoadFailed ? (loadError ?? "No se pudo cargar la minuta.") : null}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={false}
          skeleton={<div className="card-premium p-6 text-ink-muted">Cargando…</div>}
        >
          <div className="card-premium p-6 text-ink-muted">Cargando…</div>
        </DataState>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={editing ? "Editar minuta" : "Nueva minuta"} crumb="Ciudadanía">
      <PageHeader
        eyebrow="Ciudadanía"
        title={editing ? "Editar" : "Nueva"}
        accent="minuta"
        subtitle="Registra el acta de la reunión: asistentes, notas y los acuerdos con su fecha límite."
        actions={
          editing && minuta?.estado === "BORRADOR" ? (
            <button type="button" className="btn-ghost focus-ring" onClick={publicar} disabled={saving}>
              Publicar
            </button>
          ) : undefined
        }
      />

      {error && (
        <div className="card-premium mb-4 px-3.5 py-2.5 text-sm text-state-critical">{error}</div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="card-premium reveal flex flex-col gap-4 p-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Título *</span>
            <input
              className="field-input h-11"
              value={form.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              placeholder="Reunión de coordinadores — semana 12"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Fecha *</span>
              <input
                type="date"
                className="field-input h-11"
                value={form.fecha}
                onChange={(e) => set("fecha", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Tipo</span>
              <select
                className="field-input h-11"
                value={form.tipo ?? "REUNION"}
                onChange={(e) => set("tipo", e.target.value)}
              >
                <option value="REUNION">Reunión</option>
                <option value="OTRO">Otro</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Lugar</span>
            <input
              className="field-input h-11"
              value={form.lugar ?? ""}
              onChange={(e) => set("lugar", e.target.value)}
              placeholder="Casa de campaña, oficina…"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Asistentes</span>
            <div className="flex flex-wrap gap-1.5">
              {(form.asistentes ?? []).map((a: Asistente, idx: number) => (
                <span key={idx} className="pill border-line bg-panel-hover text-ink-muted">
                  {a.nombre}
                  <button
                    type="button"
                    onClick={() => removeAsistente(idx)}
                    className="ml-1 text-ink-faint hover:text-state-critical"
                    aria-label={`Quitar ${a.nombre}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="field-input h-10 flex-1"
                value={asistenteInput}
                onChange={(e) => setAsistenteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAsistente();
                  }
                }}
                placeholder="Nombre del asistente"
              />
              <button type="button" className="btn-ghost focus-ring" onClick={addAsistente}>
                Agregar
              </button>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Notas</span>
            <textarea
              className="field-input min-h-[120px] resize-y"
              value={form.cuerpo ?? ""}
              onChange={(e) => set("cuerpo", e.target.value)}
              placeholder="Notas de la reunión…"
            />
          </label>

          <div className="flex flex-col gap-1.5 border-t border-line pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Acuerdos</span>
            <ul className="flex flex-col gap-2">
              {!editing &&
                (form.acuerdos ?? []).map((a, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded-card bg-panel-hover px-3 py-2 text-sm"
                  >
                    <span className="text-ink">{a.texto}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink-faint">{a.fecha_limite ?? "sin fecha"}</span>
                      <button
                        type="button"
                        onClick={() => removeAcuerdoDraft(idx)}
                        className="text-ink-faint hover:text-state-critical"
                        aria-label="Quitar acuerdo"
                      >
                        ×
                      </button>
                    </span>
                  </li>
                ))}
              {editing &&
                minuta?.acuerdos.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-card bg-panel-hover px-3 py-2 text-sm"
                  >
                    <span className="text-ink">{a.texto}</span>
                    <span className="font-mono text-xs text-ink-faint">{a.fecha_limite ?? "sin fecha"}</span>
                  </li>
                ))}
              {editing && (minuta?.acuerdos.length ?? 0) === 0 && (
                <li className="text-sm text-ink-faint">Sin acuerdos todavía.</li>
              )}
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="field-input h-10 flex-1"
                value={acuerdoTexto}
                onChange={(e) => setAcuerdoTexto(e.target.value)}
                placeholder="Nuevo acuerdo…"
              />
              <input
                type="date"
                className="field-input h-10 sm:w-40"
                value={acuerdoFecha}
                onChange={(e) => setAcuerdoFecha(e.target.value)}
              />
              <button
                type="button"
                className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                onClick={addAcuerdoRow}
                disabled={addingAcuerdo || !acuerdoTexto.trim()}
              >
                {addingAcuerdo ? "Agregando…" : "Agregar acuerdo"}
              </button>
            </div>
          </div>

          <button
            type="button"
            className="btn-primary focus-ring h-12 text-base disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canSave}
            onClick={submit}
          >
            {saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar minuta"}
          </button>
        </div>

        <div className="card-premium reveal p-4 text-sm text-ink-muted">
          <p className="mb-2 font-medium text-ink">Tip</p>
          {editing
            ? "Los acuerdos nuevos se agregan de inmediato porque la minuta ya existe. Cambia el estado de cada acuerdo desde el detalle."
            : 'Agrega los acuerdos con su fecha límite antes de guardar — quedarán listos para dar seguimiento desde "Mis acuerdos".'}
        </div>
      </div>
    </AppLayout>
  );
}

export default MinutaEditorPage;
