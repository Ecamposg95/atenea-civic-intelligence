import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { CellBar } from "@/components/ui/CellBar";
import type { Column } from "@/components/ui/DataTable";
import { DataTable } from "@/components/ui/DataTable";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useAsync } from "@/hooks/useAsync";
import { listPromovidos, type Promovido } from "@/api/promovidos";

const PRIORIDAD_CLASS: Record<string, string> = {
  DEFENDER_EXPANDIR: "bg-state-success/10 text-state-success",
  COMPETITIVA: "bg-state-warning/10 text-state-warning",
  RECUPERAR_OPOSICION: "bg-state-critical/10 text-state-critical",
  ALTA_PERSUADIBLE: "bg-accent/10 text-accent",
};

/** Up to two initials from a full name, for the Avatar element. */
const initials = (nombre: string): string => {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const COLUMNS: Column<Promovido>[] = [
  {
    key: "nombre_completo",
    header: "Nombre",
    sortValue: (p) => p.nombre_completo,
    render: (p) => (
      <span className="flex items-center gap-2.5">
        <Avatar initials={initials(p.nombre_completo)} variant="brand" />
        <span className="font-medium text-ink">{p.nombre_completo}</span>
      </span>
    ),
  },
  {
    key: "edad",
    header: "Edad",
    align: "right",
    hideOnCard: true,
    sortValue: (p) => p.edad ?? -1,
    render: (p) => <span className="tabular-nums text-ink-muted">{p.edad ?? "—"}</span>,
  },
  {
    key: "seccion",
    header: "Sección",
    sortValue: (p) => p.seccion ?? "",
    render: (p) => <span className="font-mono text-ink-muted">{p.seccion ?? "—"}</span>,
  },
  {
    key: "colonia",
    header: "Colonia",
    hideOnCard: true,
    sortValue: (p) => p.colonia ?? "",
    render: (p) => p.colonia ?? "—",
  },
  {
    key: "telefono",
    header: "Teléfono",
    hideOnCard: true,
    render: (p) => <span className="font-mono text-ink-muted">{p.telefono ?? "—"}</span>,
  },
  {
    key: "promotor",
    header: "Promotor",
    sortValue: (p) => p.promotor ?? "",
    render: (p) => p.promotor ?? "—",
  },
  {
    key: "estructura",
    header: "Estructura",
    hideOnCard: true,
    sortValue: (p) => p.estructura ?? "",
    render: (p) => p.estructura ?? "—",
  },
  {
    key: "participacion",
    header: "Part.",
    align: "right",
    sortValue: (p) => p.participacion ?? -1,
    render: (p) =>
      p.participacion != null ? (
        <CellBar value={p.participacion} />
      ) : (
        <span className="text-ink-faint">—</span>
      ),
  },
  {
    key: "margen",
    header: "Margen",
    align: "right",
    hideOnCard: true,
    sortValue: (p) => p.margen ?? -Infinity,
    render: (p) => (
      <span className="font-mono tabular-nums text-ink-muted">{p.margen ?? "—"}</span>
    ),
  },
  {
    key: "prioridad",
    header: "Prioridad",
    sortValue: (p) => p.prioridad ?? "",
    render: (p) =>
      p.prioridad ? (
        <span className={`pill ${PRIORIDAD_CLASS[p.prioridad] ?? ""}`}>
          {p.prioridad.replace(/_/g, " ")}
        </span>
      ) : (
        "—"
      ),
  },
];

export function PromovidosPage() {
  const [q, setQ] = useState("");
  const state = useAsync(() => listPromovidos({ q }), [q]);
  const data = state.data;

  return (
    <AppLayout title="Promovidos" crumb="Ciudadanía">
      <PageHeader eyebrow="Ciudadanía" title="Tabla de" accent="Promovidos"
        subtitle="Ciudadanos promovidos en tu territorio, con contexto electoral por sección." />

      {data && !data.has_territory ? (
        <div className="card-premium reveal px-5 py-12 text-center text-ink-muted">
          Pídele a tu administrador que te asigne un territorio.
        </div>
      ) : (
        <DataState loading={state.loading} error={state.error} onRetry={state.reload}
          isEmpty={!state.loading && !state.error && (data?.items.length ?? 0) === 0}
          emptyMessage="Sin promovidos…"
          skeleton={
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-card bg-panel-hover" />
              ))}
            </div>
          }>
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MetricCard
                label="Total promovidos"
                value={String(data?.total ?? 0)}
                countTo={data?.total ?? 0}
                tone="warm"
                context="En tu territorio asignado"
                delay={0}
              />
              <MetricCard
                label="Mostrando"
                value={String(data?.items.length ?? 0)}
                countTo={data?.items.length ?? 0}
                tone="teal"
                context={data ? `de ${data.total.toLocaleString("en-US")} totales` : undefined}
                delay={80}
              />
            </div>

            <div className="reveal" style={{ animationDelay: "160ms" }}>
              <SectionHeading eyebrow="Ciudadanía" title="Listado"
                note={data ? `${data.items.length} de ${data.total}` : undefined} />
              <div className="mb-3 mt-3 flex justify-end">
                <input className="field-input h-8 w-48" placeholder="Buscar nombre…"
                  value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <DataTable<Promovido>
                columns={COLUMNS}
                rows={data?.items ?? []}
                rowKey={(p) => p.id}
                pageSize={data?.items.length || 50}
                defaultSortKey="nombre_completo"
                defaultSortDir="asc"
                emptyMessage="Sin promovidos…"
              />
            </div>
          </div>
        </DataState>
      )}
    </AppLayout>
  );
}
