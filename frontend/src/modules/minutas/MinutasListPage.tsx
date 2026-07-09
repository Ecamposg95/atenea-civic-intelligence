// frontend/src/modules/minutas/MinutasListPage.tsx
import { useNavigate } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { useAsync } from "@/hooks/useAsync";
import { MINUTAS_WRITE } from "@/modules/registry";
import { useAuthStore } from "@/store/authStore";
import { listMinutas, type Minuta } from "@/api/minutas";

const PAGE = 20;

const TIPO_LABEL: Record<string, string> = {
  REUNION: "Reunión",
  OTRO: "Otro",
};

const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: "Borrador",
  PUBLICADA: "Publicada",
};

const ESTADO_CLASS: Record<string, string> = {
  BORRADOR: "border-line bg-panel-hover text-ink-faint",
  PUBLICADA: "border-teal/30 bg-teal/10 text-teal",
};

/**
 * Minutas inbox — server-paginated list of actas with estado, tipo and a
 * pending-acuerdos badge. Row click opens the detail page; "Nueva minuta" is
 * only offered to write-tier roles (read-only roles like activista still
 * reach here via MINUTAS_READ, they just don't see the create action).
 */
export function MinutasListPage() {
  const nav = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role ? MINUTAS_WRITE.includes(role) : false;

  const state = useAsync(() => listMinutas({ limit: PAGE, offset: 0 }), []);
  const data = state.data;
  const items = data?.items ?? [];

  const pendientesEnPagina = items.reduce((sum, m) => sum + m.acuerdos_pendientes, 0);

  const columns: Column<Minuta>[] = [
    {
      key: "titulo",
      header: "Título",
      sortValue: (m) => m.titulo,
      render: (m) => <span className="font-medium text-ink">{m.titulo}</span>,
    },
    {
      key: "fecha",
      header: "Fecha",
      sortValue: (m) => m.fecha,
      render: (m) => <span className="font-mono text-ink-muted">{m.fecha}</span>,
    },
    {
      key: "lugar",
      header: "Lugar",
      hideOnCard: true,
      render: (m) => <span className="text-ink-muted">{m.lugar ?? "—"}</span>,
    },
    {
      key: "tipo",
      header: "Tipo",
      hideOnCard: true,
      render: (m) => <span className="text-ink-muted">{TIPO_LABEL[m.tipo] ?? m.tipo}</span>,
    },
    {
      key: "estado",
      header: "Estado",
      render: (m) => (
        <span className={`pill ${ESTADO_CLASS[m.estado] ?? "border-line bg-panel-hover text-ink-faint"}`}>
          {ESTADO_LABEL[m.estado] ?? m.estado}
        </span>
      ),
    },
    {
      key: "acuerdos_pendientes",
      header: "Acuerdos",
      align: "right",
      render: (m) =>
        m.acuerdos_pendientes > 0 ? (
          <span className="pill border-amber/30 bg-amber/10 text-amber">{m.acuerdos_pendientes} pendientes</span>
        ) : (
          <span className="text-ink-faint">Al corriente</span>
        ),
    },
  ];

  return (
    <AppLayout title="Minutas" crumb="Ciudadanía">
      <PageHeader
        eyebrow="Ciudadanía"
        title="Minutas"
        accent="& Acuerdos"
        subtitle="Actas de reuniones con asistentes, notas y acuerdos con fecha límite y responsable."
        actions={
          canWrite ? (
            <button type="button" className="btn-primary focus-ring" onClick={() => nav("/minutas/nueva")}>
              Nueva minuta
            </button>
          ) : undefined
        }
      />

      <section className="reveal mt-2 flex flex-col gap-4" style={{ animationDelay: "60ms" }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricCard
            label="Minutas"
            value={String(data?.total ?? 0)}
            countTo={data?.total ?? 0}
            tone="warm"
            context="Registradas en tu campaña"
            delay={0}
          />
          <MetricCard
            label="Acuerdos pendientes"
            value={String(pendientesEnPagina)}
            countTo={pendientesEnPagina}
            tone="warning"
            context="En esta página"
            delay={80}
          />
        </div>
      </section>

      <div className="reveal mt-5" style={{ animationDelay: "140ms" }}>
        <SectionHeading
          eyebrow="Actas"
          title="Minutas"
          note={data && data.total > 0 ? `${items.length} de ${data.total}` : undefined}
        />
        <div className="mt-4">
          <DataState
            loading={state.loading}
            error={state.error}
            onRetry={state.reload}
            isEmpty={!state.loading && !state.error && items.length === 0}
            emptyMessage="Sin minutas registradas todavía."
            skeleton={
              <div className="card-premium p-4">
                <SkeletonRows rows={6} />
              </div>
            }
          >
            <DataTable
              columns={columns}
              rows={items}
              rowKey={(m) => m.id}
              pageSize={PAGE}
              onRowClick={(m) => nav(`/minutas/${m.id}`)}
              emptyMessage="Sin minutas registradas todavía."
            />
          </DataState>
        </div>
      </div>
    </AppLayout>
  );
}

export default MinutasListPage;
