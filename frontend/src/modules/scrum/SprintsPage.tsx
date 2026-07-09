// frontend/src/modules/scrum/SprintsPage.tsx
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { useAsync } from "@/hooks/useAsync";
import { CHART_PALETTE, CHART_TOOLTIP_STYLE } from "@/constants/ui";
import { SCRUM_GOV } from "@/modules/registry";
import { useAuthStore } from "@/store/authStore";
import {
  activarSprint,
  cerrarSprint,
  createSprint,
  crearCeremonia,
  getBurndown,
  getSprintMetrics,
  listCeremonias,
  listSprints,
} from "@/api/scrum";

const ESTADO_LABEL: Record<string, string> = {
  PLANIFICACION: "Planificación",
  ACTIVO: "Activo",
  CERRADO: "Cerrado",
};
const ESTADO_CLASS: Record<string, string> = {
  PLANIFICACION: "border-line bg-panel-hover text-ink-faint",
  ACTIVO: "border-teal/30 bg-teal/10 text-teal",
  CERRADO: "border-line bg-panel-hover text-ink-muted",
};

const CEREMONIA_TIPO_LABEL: Record<string, string> = {
  PLANNING: "Planning",
  DAILY: "Daily",
  REVIEW: "Review",
  RETRO: "Retro",
};
const COLUMNA_LABEL: Record<string, string> = {
  POR_HACER: "Por hacer",
  EN_CURSO: "En curso",
  HECHO: "Hecho",
};
const nf = new Intl.NumberFormat("es-MX");

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
const today = () => toIsoDate(new Date());
const inTwoWeeks = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return toIsoDate(d);
};

const EMPTY_FORM = { nombre: "", objetivo: "", fecha_inicio: today(), fecha_fin: inTwoWeeks() };

/**
 * Sprint governance — list + create (nombre/objetivo/fechas) and, per sprint,
 * activar/cerrar. Only one ACTIVO sprint per campaña — the backend 409s a
 * second activation attempt, surfaced here as "ya hay un sprint activo".
 * Create/activar/cerrar are SCRUM_GOV-only (coordinador/admin); everyone in
 * the read tier can browse the list.
 */
export function SprintsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const canGovern = role ? SCRUM_GOV.includes(role) : false;

  const state = useAsync(() => listSprints({ limit: 100, offset: 0 }), []);
  const sprints = state.data?.items ?? [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpanded = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  async function submitCreate() {
    if (!form.nombre.trim() || !form.fecha_inicio || !form.fecha_fin) return;
    setSaving(true);
    setFormError(null);
    try {
      await createSprint({
        nombre: form.nombre.trim(),
        objetivo: form.objetivo.trim() || undefined,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      state.reload();
    } catch (e: unknown) {
      const status = (e as Error & { status?: number }).status;
      setFormError(
        status === 409
          ? "Ya hay un sprint activo en la campaña."
          : e instanceof Error
            ? e.message
            : "No se pudo crear el sprint.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function activar(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      await activarSprint(id);
      state.reload();
    } catch (e: unknown) {
      const status = (e as Error & { status?: number }).status;
      setActionError(
        status === 409
          ? "Ya hay un sprint activo en la campaña."
          : e instanceof Error
            ? e.message
            : "No se pudo activar el sprint.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function cerrar(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      await cerrarSprint(id);
      state.reload();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "No se pudo cerrar el sprint.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppLayout title="Sprints" crumb="Ciudadanía">
      <PageHeader
        eyebrow="Ciudadanía"
        title="Sprints"
        accent="Scrum"
        subtitle="Planifica, activa y cierra los sprints de la campaña — solo uno puede estar activo a la vez."
        actions={
          canGovern ? (
            <button type="button" className="btn-primary focus-ring" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancelar" : "Nuevo sprint"}
            </button>
          ) : undefined
        }
      />

      {actionError && (
        <div className="card-premium mb-4 px-3.5 py-2.5 text-sm text-state-critical">{actionError}</div>
      )}

      {showForm && canGovern && (
        <div className="card-premium reveal mb-5 flex flex-col gap-3 p-4">
          {formError && <p className="text-sm text-state-critical">{formError}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Nombre *</span>
              <input
                className="field-input h-10"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Sprint 1 — semana 12"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Inicio *</span>
              <input
                type="date"
                className="field-input h-10"
                value={form.fecha_inicio}
                onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Fin *</span>
              <input
                type="date"
                className="field-input h-10"
                value={form.fecha_fin}
                onChange={(e) => setForm((f) => ({ ...f, fecha_fin: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 lg:col-span-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Objetivo</span>
              <input
                className="field-input h-10"
                value={form.objetivo}
                onChange={(e) => setForm((f) => ({ ...f, objetivo: e.target.value }))}
                placeholder="Qué se busca lograr en este sprint…"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary focus-ring disabled:cursor-not-allowed disabled:opacity-40"
              disabled={saving || !form.nombre.trim()}
              onClick={submitCreate}
            >
              {saving ? "Guardando…" : "Crear sprint"}
            </button>
          </div>
        </div>
      )}

      <DataState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
        isEmpty={!state.loading && !state.error && sprints.length === 0}
        emptyMessage="Sin sprints registrados todavía."
        skeleton={
          <div className="card-premium p-4">
            <SkeletonRows rows={4} />
          </div>
        }
      >
        <ul className="flex flex-col gap-3">
          {sprints.map((s) => (
            <li key={s.id} className="card-premium flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink">{s.nombre}</p>
                    <span className={`pill ${ESTADO_CLASS[s.estado] ?? "border-line bg-panel-hover text-ink-faint"}`}>
                      {ESTADO_LABEL[s.estado] ?? s.estado}
                    </span>
                  </div>
                  {s.objetivo && <p className="mt-1 text-sm text-ink-muted">{s.objetivo}</p>}
                  <p className="mt-1 font-mono text-xs text-ink-faint">
                    {s.fecha_inicio} → {s.fecha_fin}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="btn-ghost focus-ring"
                    onClick={() => toggleExpanded(s.id)}
                  >
                    {expandedId === s.id ? "Ocultar detalle" : "Ver detalle"}
                  </button>
                  {canGovern && (s.estado === "PLANIFICACION" || s.estado === "ACTIVO") && (
                    <>
                      {s.estado === "PLANIFICACION" && (
                        <button
                          type="button"
                          className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={busyId === s.id}
                          onClick={() => activar(s.id)}
                        >
                          Activar
                        </button>
                      )}
                      {s.estado === "ACTIVO" && (
                        <button
                          type="button"
                          className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={busyId === s.id}
                          onClick={() => cerrar(s.id)}
                        >
                          Cerrar
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {expandedId === s.id && <SprintDetail sprintId={s.id} canGovern={canGovern} />}
            </li>
          ))}
        </ul>
      </DataState>
    </AppLayout>
  );
}

/**
 * Per-sprint detail: metrics (comprometido/completado/por_estado/sin_estimar),
 * a burndown line chart (restante vs ideal) and its ceremonias, with a "Nueva
 * ceremonia" form gated to canGovern (mirrors the sprint governance tier —
 * the backend requires ADMIN/COORDINADOR/LIDER to POST /sprints/:id/ceremonias).
 */
function SprintDetail({ sprintId, canGovern }: { sprintId: string; canGovern: boolean }) {
  const metricsState = useAsync(() => getSprintMetrics(sprintId), [sprintId]);
  const burndownState = useAsync(() => getBurndown(sprintId), [sprintId]);
  const ceremoniasState = useAsync(() => listCeremonias(sprintId), [sprintId]);

  const metrics = metricsState.data;
  const burndown = burndownState.data;
  const ceremonias = ceremoniasState.data?.items ?? [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titulo: "", fecha: today(), tipo: "PLANNING", lugar: "", cuerpo: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submitCeremonia() {
    if (!form.titulo.trim() || !form.fecha) return;
    setSaving(true);
    setFormError(null);
    try {
      await crearCeremonia(sprintId, {
        titulo: form.titulo.trim(),
        fecha: form.fecha,
        tipo: form.tipo,
        lugar: form.lugar.trim() || undefined,
        cuerpo: form.cuerpo.trim() || undefined,
      });
      setForm({ titulo: "", fecha: today(), tipo: "PLANNING", lugar: "", cuerpo: "" });
      setShowForm(false);
      ceremoniasState.reload();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "No se pudo crear la ceremonia.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="reveal flex flex-col gap-4 border-t border-line pt-4">
      {/* ---- Métricas ---- */}
      <DataState
        loading={metricsState.loading}
        error={metricsState.error}
        onRetry={metricsState.reload}
        skeleton={<SkeletonRows rows={1} />}
      >
        {metrics && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-center">
              <div className="font-display text-lg font-bold tabular-nums text-ink">
                {nf.format(metrics.comprometido)}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-faint">Comprometido</div>
            </div>
            <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-center">
              <div className="font-display text-lg font-bold tabular-nums text-ink">
                {nf.format(metrics.completado)}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-faint">Completado</div>
            </div>
            <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-center">
              <div className="font-display text-lg font-bold tabular-nums text-ink">
                {nf.format(metrics.historias_hechas)}/{nf.format(metrics.historias_total)}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-faint">Historias</div>
            </div>
            <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-center">
              <div className="font-display text-lg font-bold tabular-nums text-ink">
                {nf.format(metrics.sin_estimar)}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-faint">Sin estimar</div>
            </div>
            {Object.keys(metrics.por_estado).length > 0 && (
              <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-4">
                {Object.entries(metrics.por_estado).map(([k, v]) => (
                  <span key={k} className="pill border-line bg-panel-hover text-ink-faint">
                    {COLUMNA_LABEL[k] ?? k}: {nf.format(v)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </DataState>

      {/* ---- Burndown ---- */}
      <DataState
        loading={burndownState.loading}
        error={burndownState.error}
        onRetry={burndownState.reload}
        isEmpty={!burndownState.loading && !burndownState.error && (burndown?.dias.length ?? 0) === 0}
        emptyMessage="Sin datos de burndown."
        skeleton={<div className="h-56 animate-pulse rounded-card bg-panel-hover" />}
      >
        {burndown && burndown.dias.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Burndown · {nf.format(burndown.total_puntos)} pts totales
            </h4>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={burndown.dias} margin={{ left: -16, top: 8 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="fecha" stroke="var(--chart-axis)" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} />
                  <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="ideal" name="Ideal" stroke={CHART_PALETTE[2]} strokeDasharray="4 4" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="restante" name="Restante" stroke={CHART_PALETTE[0]} strokeWidth={2.5} dot={{ r: 2.5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex gap-4 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CHART_PALETTE[0] }} /> Restante
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CHART_PALETTE[2] }} /> Ideal
              </span>
            </div>
          </div>
        )}
      </DataState>

      {/* ---- Ceremonias ---- */}
      <div>
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Ceremonias</h4>
          {canGovern && (
            <button type="button" className="btn-ghost focus-ring text-xs" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancelar" : "Nueva ceremonia"}
            </button>
          )}
        </div>

        {showForm && canGovern && (
          <div className="reveal mt-3 flex flex-col gap-3 rounded-lg border border-line bg-bg-sunken p-3">
            {formError && <p className="text-sm text-state-critical">{formError}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 lg:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Título *</span>
                <input
                  className="field-input h-10"
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  placeholder="Retro sprint 3"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Fecha *</span>
                <input
                  type="date"
                  className="field-input h-10"
                  value={form.fecha}
                  onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Tipo</span>
                <select
                  className="field-input h-10"
                  value={form.tipo}
                  onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                >
                  <option value="PLANNING">Planning</option>
                  <option value="DAILY">Daily</option>
                  <option value="REVIEW">Review</option>
                  <option value="RETRO">Retro</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 lg:col-span-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Lugar</span>
                <input
                  className="field-input h-10"
                  value={form.lugar}
                  onChange={(e) => setForm((f) => ({ ...f, lugar: e.target.value }))}
                  placeholder="Sala de guerra / videollamada…"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="btn-primary focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                disabled={saving || !form.titulo.trim() || !form.fecha}
                onClick={submitCeremonia}
              >
                {saving ? "Guardando…" : "Crear ceremonia"}
              </button>
            </div>
          </div>
        )}

        <DataState
          loading={ceremoniasState.loading}
          error={ceremoniasState.error}
          onRetry={ceremoniasState.reload}
          isEmpty={!ceremoniasState.loading && !ceremoniasState.error && ceremonias.length === 0}
          emptyMessage="Sin ceremonias registradas para este sprint."
          skeleton={<SkeletonRows rows={2} />}
        >
          <ul className="mt-3 flex flex-col gap-2">
            {ceremonias.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-bg-sunken px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="pill border-line bg-panel-hover text-ink-faint">
                      {CEREMONIA_TIPO_LABEL[c.tipo] ?? c.tipo}
                    </span>
                    <p className="truncate text-sm text-ink">{c.titulo}</p>
                  </div>
                  {c.lugar && <p className="mt-0.5 text-xs text-ink-faint">{c.lugar}</p>}
                </div>
                <span className="font-mono text-xs text-ink-faint">{c.fecha}</span>
              </li>
            ))}
          </ul>
        </DataState>
      </div>
    </div>
  );
}

export default SprintsPage;
