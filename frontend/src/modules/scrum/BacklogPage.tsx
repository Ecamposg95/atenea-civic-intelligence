// frontend/src/modules/scrum/BacklogPage.tsx
import { useMemo, useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { useAsync } from "@/hooks/useAsync";
import { SCRUM_GOV } from "@/modules/registry";
import { useAuthStore } from "@/store/authStore";
import { createWorkitem, listSprints, listWorkitems, type WorkItem } from "@/api/scrum";

import { WorkItemDetail } from "./WorkItemDetail";

const PAGE = 20;
// No dedicated "sin sprint" filter on the API — fetch a generous page once
// and filter/sort/paginate client-side, same convention as MisAcuerdosPage.
const FETCH_LIMIT = 200;

const TIPO_LABEL: Record<string, string> = { HISTORIA: "Historia", TAREA: "Tarea", BUG: "Incidencia" };
const PRIORIDAD_LABEL: Record<string, string> = { ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" };
const ESTADO_LABEL: Record<string, string> = { POR_HACER: "Por hacer", EN_CURSO: "En curso", HECHO: "Hecho" };
const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];

const EMPTY_FORM = {
  titulo: "",
  tipo: "HISTORIA",
  prioridad: "MEDIA",
  story_points: "" as string,
  sprint_id: "",
};

/**
 * Product backlog — every workitem in the campaign (historias/tareas/bugs).
 * Coordinador/admin (SCRUM_GOV) can create new items; everyone in the read
 * tier can browse and open the detail drawer (read-only there unless they're
 * SCRUM_GOV, mirroring MinutasListPage's canWrite gating convention).
 */
export function BacklogPage() {
  const role = useAuthStore((s) => s.user?.role);
  const canGovern = role ? SCRUM_GOV.includes(role) : false;

  const state = useAsync(() => listWorkitems({ limit: FETCH_LIMIT, offset: 0 }), []);
  const sprintsState = useAsync(() => listSprints({ limit: FETCH_LIMIT, offset: 0 }), []);
  const sprints = sprintsState.data?.items ?? [];
  const sprintName = useMemo(() => {
    const m = new Map<string, string>();
    sprints.forEach((s) => m.set(s.id, s.nombre));
    return m;
  }, [sprints]);

  const [sprintFilter, setSprintFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = state.data?.items ?? [];
  const filtered = useMemo(() => {
    if (!sprintFilter) return items;
    if (sprintFilter === "__backlog__") return items.filter((w) => !w.sprint_id);
    return items.filter((w) => w.sprint_id === sprintFilter);
  }, [items, sprintFilter]);

  async function submitCreate() {
    if (!form.titulo.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      await createWorkitem({
        titulo: form.titulo.trim(),
        tipo: form.tipo,
        prioridad: form.prioridad,
        story_points: form.story_points === "" ? undefined : Number(form.story_points),
        sprint_id: form.sprint_id || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      state.reload();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "No se pudo crear la historia.");
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<WorkItem>[] = [
    {
      key: "titulo",
      header: "Título",
      sortValue: (w) => w.titulo,
      render: (w) => <span className="font-medium text-ink">{w.titulo}</span>,
    },
    {
      key: "tipo",
      header: "Tipo",
      hideOnCard: true,
      render: (w) => <span className="text-ink-muted">{TIPO_LABEL[w.tipo] ?? w.tipo}</span>,
    },
    {
      key: "story_points",
      header: "Esfuerzo",
      align: "right",
      sortValue: (w) => w.story_points ?? -1,
      render: (w) => <span className="font-mono text-ink-muted">{w.story_points ?? "–"}</span>,
    },
    {
      key: "prioridad",
      header: "Prioridad",
      render: (w) => <span className="text-ink-muted">{PRIORIDAD_LABEL[w.prioridad] ?? w.prioridad}</span>,
    },
    {
      key: "sprint",
      header: "Ciclo",
      hideOnCard: true,
      render: (w) => (
        <span className="text-ink-muted">{w.sprint_id ? sprintName.get(w.sprint_id) ?? "—" : "Pendientes"}</span>
      ),
    },
    {
      key: "responsable",
      header: "Responsable",
      hideOnCard: true,
      render: (w) => <span className="text-ink-muted">{w.responsable_nombre ?? "Sin asignar"}</span>,
    },
    {
      key: "estado",
      header: "Estado",
      render: (w) => (
        <span className="pill border-line bg-panel-hover text-ink-faint">{ESTADO_LABEL[w.estado] ?? w.estado}</span>
      ),
    },
  ];

  return (
    <AppLayout title="Pendientes" crumb="Ciudadanía">
      <PageHeader
        eyebrow="Ciudadanía"
        title="Pendientes"
        accent="Scrum"
        subtitle="Historias, tareas e incidencias de la campaña — estímalas, asígnalas y muévelas a un ciclo."
        actions={
          canGovern ? (
            <button type="button" className="btn-primary focus-ring" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancelar" : "Nueva historia"}
            </button>
          ) : undefined
        }
      />

      {showForm && canGovern && (
        <div className="card-premium reveal mb-5 flex flex-col gap-3 p-4">
          {formError && <p className="text-sm text-state-critical">{formError}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Título *</span>
              <input
                className="field-input h-10"
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Como activista quiero…"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Tipo</span>
              <select
                className="field-input h-10"
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
              >
                <option value="HISTORIA">Historia</option>
                <option value="TAREA">Tarea</option>
                <option value="BUG">Incidencia</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Prioridad</span>
              <select
                className="field-input h-10"
                value={form.prioridad}
                onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value }))}
              >
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
                <option value="BAJA">Baja</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Esfuerzo <span className="normal-case tracking-normal text-ink-faint">(dificultad 1-21)</span>
              </span>
              <select
                className="field-input h-10"
                value={form.story_points}
                onChange={(e) => setForm((f) => ({ ...f, story_points: e.target.value }))}
              >
                <option value="">Sin estimar</option>
                {FIBONACCI.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Ciclo</span>
              <select
                className="field-input h-10"
                value={form.sprint_id}
                onChange={(e) => setForm((f) => ({ ...f, sprint_id: e.target.value }))}
              >
                <option value="">Pendientes (sin ciclo)</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary focus-ring disabled:cursor-not-allowed disabled:opacity-40"
              disabled={saving || !form.titulo.trim()}
              onClick={submitCreate}
            >
              {saving ? "Guardando…" : "Crear"}
            </button>
          </div>
        </div>
      )}

      <div className="reveal mb-4 flex items-center gap-3" style={{ animationDelay: "60ms" }}>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Ciclo
          <select
            className="field-input h-9 text-sm"
            value={sprintFilter}
            onChange={(e) => setSprintFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="__backlog__">Pendientes (sin ciclo)</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DataState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
        isEmpty={!state.loading && !state.error && filtered.length === 0}
        emptyMessage="Sin historias registradas todavía."
        skeleton={
          <div className="card-premium p-4">
            <SkeletonRows rows={6} />
          </div>
        }
      >
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(w) => w.id}
          pageSize={PAGE}
          onRowClick={(w) => setSelectedId(w.id)}
          emptyMessage="Sin historias registradas todavía."
        />
      </DataState>

      {selectedId && (
        <WorkItemDetail id={selectedId} onClose={() => setSelectedId(null)} onChanged={state.reload} />
      )}
    </AppLayout>
  );
}

export default BacklogPage;
