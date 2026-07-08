import { useMemo, useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { MetricCard } from "@/components/ui/MetricCard";
import { CellBar } from "@/components/ui/CellBar";
import { DataState } from "@/components/ui/DataState";
import { useAsync } from "@/hooks/useAsync";
import {
  getPlanes, upsertPlan, getAgenda, createAgendaItem, updateAgendaItem,
  type PlanRow, type PlanUpdate, type AgendaItem,
} from "@/api/operacion";

const PRIORIDAD_TONE: Record<string, string> = {
  DEFENDER_EXPANDIR: "text-state-ok bg-state-ok/12",
  COMPETITIVA: "text-warm bg-warm/14",
  RECUPERAR_OPOSICION: "text-amber bg-amber/15",
  ALTA_PERSUADIBLE: "text-accent bg-accent/12",
};
const label = (p: string | null) =>
  (p ?? "—").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const FASES = [30, 60, 90];

/* ------------------------------------------------------------- edit modal */
function EditPlan({ row, onClose, onSaved }: { row: PlanRow; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<PlanUpdate>({
    problema_dominante: row.plan.problema_dominante ?? "",
    liderazgo: row.plan.liderazgo ?? "",
    meta_semanal: row.plan.meta_semanal ?? row.plan.meta_sugerida,
    notas: row.plan.notas ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await upsertPlan(row.seccion, form);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card-premium w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <SectionHeading eyebrow={`Sección ${row.seccion}`} title="Plan operativo" note={`meta sugerida ${row.plan.meta_sugerida}`} />
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-ink-muted">Problema dominante</span>
            <input className="field-input mt-1 w-full" value={form.problema_dominante ?? ""}
              onChange={(e) => setForm({ ...form, problema_dominante: e.target.value })}
              placeholder="agua, seguridad, alumbrado…" />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Liderazgo / responsable local</span>
            <input className="field-input mt-1 w-full" value={form.liderazgo ?? ""}
              onChange={(e) => setForm({ ...form, liderazgo: e.target.value })}
              placeholder="nombre del responsable / liderazgo de la sección" />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Meta semanal (promovidos)</span>
            <input type="number" min={0} className="field-input mt-1 w-full" value={form.meta_semanal ?? 0}
              onChange={(e) => setForm({ ...form, meta_semanal: Number(e.target.value) })} />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Notas</span>
            <textarea className="field-input mt-1 w-full" rows={2} value={form.notas ?? ""}
              onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- agenda card */
function AgendaFase({ fase, items, onChanged }: { fase: number; items: AgendaItem[]; onChanged: () => void }) {
  const [nuevo, setNuevo] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!nuevo.trim()) return;
    setBusy(true);
    try { await createAgendaItem(fase, nuevo.trim()); setNuevo(""); onChanged(); }
    finally { setBusy(false); }
  }
  async function toggle(it: AgendaItem) {
    await updateAgendaItem(it.id, { done: !it.done });
    onChanged();
  }

  return (
    <div className="card-premium p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg font-bold text-ink">{fase} días</h3>
        <span className="text-xs text-ink-faint">{items.filter((i) => i.done).length}/{items.length}</span>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={it.done} onChange={() => toggle(it)} className="mt-0.5 accent-[rgb(var(--c-warm))]" />
            <span className={it.done ? "text-ink-faint line-through" : "text-ink"}>{it.titulo}</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-ink-faint">Sin acciones aún.</li>}
      </ul>
      <div className="mt-3 flex gap-2">
        <input className="field-input flex-1 text-sm" placeholder="Nueva acción…" value={nuevo}
          onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn-ghost text-sm" onClick={add} disabled={busy}>Añadir</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- page */
export default function PlanTerritorialPage() {
  const planes = useAsync(() => getPlanes(), []);
  const agenda = useAsync(() => getAgenda(), []);
  const [editing, setEditing] = useState<PlanRow | null>(null);

  const rows = planes.data ?? [];
  const resumen = useMemo(() => {
    const persuadibles = rows.filter((r) => r.electoral.persuadible).length;
    const conMeta = rows.filter((r) => r.plan.meta_semanal != null).length;
    const promovidos = rows.reduce((a, r) => a + r.avance.promovidos, 0);
    return { total: rows.length, persuadibles, conMeta, promovidos };
  }, [rows]);

  return (
    <AppLayout title="Plan Territorial" crumb="Operación por sección">
      <PageHeader
        eyebrow="Operación · Estructura VG"
        title="Plan Territorial"
        subtitle="La elección se decide casilla por casilla. Responsable, problema y meta semanal por sección, con avance vivo de promovidos."
      />

      {/* resumen */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Secciones" value={String(resumen.total)} context="territorio" tone="accent" delay={80} />
        <MetricCard label="Persuadibles" value={String(resumen.persuadibles)} context="±150 votos" tone="warm" delay={120} />
        <MetricCard label="Con meta asignada" value={String(resumen.conMeta)} context={`de ${resumen.total}`} tone="teal" delay={160} />
        <MetricCard label="Promovidos" value={String(resumen.promovidos)} context="capturados" tone="accent" delay={200} />
      </div>

      {/* plan por sección */}
      <section className="mt-8">
        <SectionHeading eyebrow="Matriz operativa" title="Plan por sección" note="ordenado por margen (más disputadas primero)" />
        <div className="mt-4 card-premium p-2">
          <DataState loading={planes.loading} error={planes.error} onRetry={planes.reload}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-ink-faint">
                    <th className="px-3 py-2 font-semibold">Sección</th>
                    <th className="px-3 py-2 font-semibold">Prioridad</th>
                    <th className="px-3 py-2 font-semibold text-right">Margen</th>
                    <th className="px-3 py-2 font-semibold">Problema</th>
                    <th className="px-3 py-2 font-semibold">Liderazgo</th>
                    <th className="px-3 py-2 font-semibold" style={{ minWidth: 150 }}>Avance (prom. vs meta)</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.seccion} className="border-t border-line/70 hover:bg-panel-hover">
                      <td className="px-3 py-2 font-medium tabular-nums">
                        {r.seccion}
                        {r.electoral.persuadible && <span className="ml-1.5 rounded-pill bg-warm/14 px-1.5 py-0.5 text-[10px] font-semibold text-warm">persuadible</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-pill px-2 py-0.5 text-[11px] font-semibold ${PRIORIDAD_TONE[r.electoral.prioridad ?? ""] ?? "text-ink-muted bg-line/60"}`}>
                          {label(r.electoral.prioridad)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold"
                        style={{ color: r.electoral.margen >= 0 ? "rgb(var(--c-accent))" : "rgb(var(--c-warm))" }}>
                        {r.electoral.margen >= 0 ? "+" : ""}{r.electoral.margen}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">{r.plan.problema_dominante ?? "—"}</td>
                      <td className="px-3 py-2 text-ink-muted">{r.plan.liderazgo ?? r.plan.responsable_nombre ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1"><CellBar value={r.avance.pct ?? 0} /></div>
                          <span className="whitespace-nowrap text-xs tabular-nums text-ink-faint">{r.avance.promovidos}/{r.avance.meta ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button className="btn-ghost text-xs" onClick={() => setEditing(r)}>Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataState>
        </div>
      </section>

      {/* agenda 30/60/90 */}
      <section className="mt-8">
        <SectionHeading eyebrow="Plan de arranque" title="Agenda 30 / 60 / 90" note="acciones críticas por fase" />
        <DataState loading={agenda.loading} error={agenda.error} onRetry={agenda.reload}>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {FASES.map((f) => (
              <AgendaFase key={f} fase={f}
                items={(agenda.data ?? []).filter((i) => i.fase === f)}
                onChanged={agenda.reload} />
            ))}
          </div>
        </DataState>
      </section>

      {editing && <EditPlan row={editing} onClose={() => setEditing(null)} onSaved={planes.reload} />}
    </AppLayout>
  );
}
