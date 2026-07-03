import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { useAsync } from "@/hooks/useAsync";
import { listPromovidos, type Promovido } from "@/api/promovidos";

const PRIORIDAD_CLASS: Record<string, string> = {
  DEFENDER_EXPANDIR: "bg-state-success/10 text-state-success",
  COMPETITIVA: "bg-state-warning/10 text-state-warning",
  RECUPERAR_OPOSICION: "bg-state-critical/10 text-state-critical",
  ALTA_PERSUADIBLE: "bg-accent/10 text-accent",
};

export function PromovidosPage() {
  const [q, setQ] = useState("");
  const state = useAsync(() => listPromovidos({ q }), [q]);
  const data = state.data;

  return (
    <AppLayout title="Promovidos" crumb="Ciudadanía">
      <PageHeader eyebrow="Ciudadanía" title="Tabla de" accent="Promovidos"
        subtitle="Ciudadanos promovidos en tu territorio, con contexto electoral por sección." />

      {data && !data.has_territory ? (
        <div className="card-premium px-5 py-12 text-center text-ink-muted">
          Pídele a tu administrador que te asigne un territorio.
        </div>
      ) : (
        <Card title="Promovidos" accentDot
          action={<input className="field-input h-8 w-48" placeholder="Buscar nombre…"
            value={q} onChange={(e) => setQ(e.target.value)} />}>
          <DataState loading={state.loading} error={state.error} onRetry={state.reload}
            isEmpty={!state.loading && !state.error && (data?.items.length ?? 0) === 0}
            emptyMessage="Sin promovidos…">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-ink-faint">
                    <th className="py-2 pr-3">Nombre</th><th className="pr-3">Edad</th>
                    <th className="pr-3">Sección</th><th className="pr-3">Colonia</th>
                    <th className="pr-3">Teléfono</th><th className="pr-3">Promotor</th>
                    <th className="pr-3">Estructura</th><th className="pr-3">Part.</th>
                    <th className="pr-3">Margen</th><th className="pr-3">Prioridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data?.items.map((p: Promovido) => (
                    <tr key={p.id}>
                      <td className="py-2 pr-3 font-medium text-ink">{p.nombre_completo}</td>
                      <td className="pr-3">{p.edad ?? "—"}</td>
                      <td className="pr-3 font-mono">{p.seccion ?? "—"}</td>
                      <td className="pr-3">{p.colonia ?? "—"}</td>
                      <td className="pr-3">{p.telefono ?? "—"}</td>
                      <td className="pr-3">{p.promotor ?? "—"}</td>
                      <td className="pr-3">{p.estructura ?? "—"}</td>
                      <td className="pr-3">{p.participacion != null ? `${p.participacion}%` : "—"}</td>
                      <td className="pr-3 tabular-nums">{p.margen ?? "—"}</td>
                      <td className="pr-3">
                        {p.prioridad ? (
                          <span className={`pill ${PRIORIDAD_CLASS[p.prioridad] ?? ""}`}>
                            {p.prioridad.replace(/_/g, " ")}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataState>
        </Card>
      )}
    </AppLayout>
  );
}
