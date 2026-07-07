// frontend/src/modules/atencion/CasosPage.tsx
import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { StatusPill, type StatusKind } from "@/components/ui/StatusPill";
import { AlertIcon, LayersIcon, SearchIcon, UserIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import { listCasos, type Caso } from "@/api/atencion";
import { listUsers } from "@/api/users";

import { CasoDetail } from "./components/CasoDetail";

const PAGE = 20;

const nf = new Intl.NumberFormat("es-MX");

// Estado color semantics (global-constraints): PENDIENTE=neutral, EN_PROCESO=accent/cyan,
// ATENDIDO=success/teal, CERRADO=muted. Mirrors PanoramaAtencionPage's palette so the
// whole Atención Ciudadana module reads as one system.
export const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  ATENDIDO: "Atendido",
  CERRADO: "Cerrado",
};

export const ESTADO_CLASS: Record<string, string> = {
  PENDIENTE: "border-line bg-panel-hover text-ink-faint",
  EN_PROCESO: "border-accent/30 bg-accent/10 text-accent",
  ATENDIDO: "border-teal/30 bg-teal/10 text-teal",
  CERRADO: "border-line bg-panel-hover text-ink-muted",
};

const ESTADO_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "EN_PROCESO", label: "En proceso" },
  { value: "ATENDIDO", label: "Atendido" },
  { value: "CERRADO", label: "Cerrado" },
];

export const TIPO_LABEL: Record<string, string> = {
  PETICION: "Petición",
  QUEJA: "Queja",
  APOYO: "Apoyo",
  OTRO: "Otro",
};

const TIPO_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Todos los tipos" },
  { value: "PETICION", label: "Petición" },
  { value: "QUEJA", label: "Queja" },
  { value: "APOYO", label: "Apoyo" },
  { value: "OTRO", label: "Otro" },
];

// Casos in a terminal estado are done — they never carry an SLA risk badge.
const TERMINAL_ESTADOS = new Set(["ATENDIDO", "CERRADO"]);

export type SlaTone = "critical" | "warning" | "neutral";

export interface SlaInfo {
  tone: SlaTone;
  label: string;
}

/**
 * SLA semáforo shared by the inbox table and the detail header:
 * - `fecha_compromiso` past and the caso isn't ATENDIDO/CERRADO → red "Vencido".
 * - Due within the next 2 days (and not done) → amber "Vence hoy/en Nd".
 * - Anything else (no deadline, done, or still far out) → neutral.
 */
export function slaInfo(caso: Pick<Caso, "fecha_compromiso" | "estado">): SlaInfo {
  if (!caso.fecha_compromiso || TERMINAL_ESTADOS.has(caso.estado)) {
    return { tone: "neutral", label: caso.fecha_compromiso ?? "Sin fecha" };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${caso.fecha_compromiso}T00:00:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) return { tone: "critical", label: "Vencido" };
  if (diffDays <= 2) return { tone: "warning", label: diffDays === 0 ? "Vence hoy" : `Vence en ${diffDays}d` };
  return { tone: "neutral", label: caso.fecha_compromiso };
}

// SLA tone -> StatusPill semantic kind: vencido -> crit, próximo -> warn, ok -> ok.
const SLA_KIND: Record<SlaTone, StatusKind> = {
  critical: "crit",
  warning: "warn",
  neutral: "ok",
};

export function SlaBadge({ caso }: { caso: Pick<Caso, "fecha_compromiso" | "estado"> }) {
  const info = slaInfo(caso);
  return <StatusPill kind={SLA_KIND[info.tone]}>{info.label}</StatusPill>;
}

/**
 * Cases inbox: filters (estado/tipo/colonia/asignado/búsqueda) + server-paginated
 * table with estado pills and the SLA semáforo. Row click opens the detail drawer.
 */
export function CasosPage() {
  const [offset, setOffset] = useState(0);

  // Raw inputs (debounced) vs. committed filter values — same pattern as MilitantesListPage.
  const [qInput, setQInput] = useState("");
  const [colonInput, setColonInput] = useState("");
  const [estadoInput, setEstadoInput] = useState("");
  const [tipoInput, setTipoInput] = useState("");
  const [asignadoInput, setAsignadoInput] = useState("");

  const [q, setQ] = useState("");
  const [colonia, setColonia] = useState("");
  const [estado, setEstado] = useState("");
  const [tipo, setTipo] = useState("");
  const [asignado, setAsignado] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      setQ(qInput.trim());
      setColonia(colonInput.trim());
      setEstado(estadoInput);
      setTipo(tipoInput);
      setAsignado(asignadoInput);
    }, 350);
    return () => clearTimeout(t);
  }, [qInput, colonInput, estadoInput, tipoInput, asignadoInput]);

  const state = useAsync(
    () =>
      listCasos({
        limit: PAGE,
        offset,
        q: q || undefined,
        colonia: colonia || undefined,
        estado: estado || undefined,
        tipo: tipo || undefined,
        asignado: asignado || undefined,
      }),
    [offset, q, colonia, estado, tipo, asignado],
  );

  // Assignable staff for the "Asignado" filter — best-effort; the filter still
  // works with an empty list, it just falls back to "Todos".
  const usersState = useAsync(() => listUsers({ limit: 200, is_active: true }), []);
  const assignableUsers = useMemo(
    () =>
      [...(usersState.data?.items ?? [])].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [usersState.data],
  );

  const data = state.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const hasFilters = Boolean(qInput || colonInput || estadoInput || tipoInput || asignadoInput);

  // Summary KPI strip — derived from the already-fetched page (no extra endpoint).
  // "Vencido"/"Por vencer"/"Sin asignar" reflect the current page only, since the
  // list endpoint doesn't return filtered-wide aggregates.
  const kpiCounts = useMemo(() => {
    let vencidos = 0;
    let porVencer = 0;
    let sinAsignar = 0;
    for (const item of items) {
      const tone = slaInfo(item).tone;
      if (tone === "critical") vencidos += 1;
      else if (tone === "warning") porVencer += 1;
      if (!item.asignado_nombre) sinAsignar += 1;
    }
    return { vencidos, porVencer, sinAsignar };
  }, [items]);

  const columns = useMemo<Column<Caso>[]>(
    () => [
      {
        key: "folio",
        header: "Folio",
        render: (r) => <span className="font-mono text-xs text-ink-muted">{r.folio}</span>,
      },
      {
        key: "titulo",
        header: "Título",
        render: (r) => (
          <div className="max-w-xs">
            <div className="truncate font-medium text-ink">{r.titulo}</div>
            {r.ciudadano_nombre && (
              <div className="truncate text-xs text-ink-faint">{r.ciudadano_nombre}</div>
            )}
          </div>
        ),
      },
      {
        key: "tipo",
        header: "Tipo",
        render: (r) => <span className="text-sm text-ink-muted">{TIPO_LABEL[r.tipo] ?? r.tipo}</span>,
        hideOnCard: true,
      },
      {
        key: "seccion_colonia",
        header: "Sección / Colonia",
        render: (r) => (
          <div className="text-sm">
            <span className="font-mono text-ink-muted">{r.seccion ?? "—"}</span>
            <span className="ml-1.5 text-ink-faint">{r.colonia ?? ""}</span>
          </div>
        ),
        hideOnCard: true,
      },
      {
        key: "asignado_nombre",
        header: "Asignado",
        render: (r) => <span className="text-sm text-ink-muted">{r.asignado_nombre ?? "Sin asignar"}</span>,
        hideOnCard: true,
      },
      {
        key: "estado",
        header: "Estado",
        render: (r) => (
          <span className={`pill ${ESTADO_CLASS[r.estado] ?? ""}`}>{ESTADO_LABEL[r.estado] ?? r.estado}</span>
        ),
      },
      {
        key: "sla",
        header: "SLA",
        render: (r) => <SlaBadge caso={r} />,
      },
    ],
    [],
  );

  return (
    <AppLayout title="Casos" crumb="Atención Ciudadana">
      <PageHeader
        eyebrow="Atención Ciudadana"
        title="Bandeja de"
        accent="Casos"
        subtitle="Peticiones, quejas y apoyos ciudadanos: estado, cumplimiento de SLA y bitácora por caso."
      />

      {/* Resumen: KPI strip derived from the already-fetched page */}
      <section className="reveal mt-6 flex flex-col gap-4" style={{ animationDelay: "60ms" }}>
        <SectionHeading eyebrow="Vista general" title="Resumen" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Casos"
            value={data ? nf.format(data.total) : "—"}
            countTo={data?.total ?? 0}
            tone="warm"
            context="Con los filtros aplicados"
            icon={<LayersIcon width={16} height={16} />}
            delay={0}
          />
          <MetricCard
            label="SLA vencido"
            value={nf.format(kpiCounts.vencidos)}
            countTo={kpiCounts.vencidos}
            tone="critical"
            context="En esta página"
            icon={<AlertIcon width={16} height={16} />}
            delay={60}
          />
          <MetricCard
            label="Por vencer"
            value={nf.format(kpiCounts.porVencer)}
            countTo={kpiCounts.porVencer}
            tone="warning"
            context="Próximos 2 días · esta página"
            delay={120}
          />
          <MetricCard
            label="Sin asignar"
            value={nf.format(kpiCounts.sinAsignar)}
            countTo={kpiCounts.sinAsignar}
            tone="accent"
            context="En esta página"
            icon={<UserIcon width={16} height={16} />}
            delay={180}
          />
        </div>
      </section>

      {/* Filters */}
      <div className="reveal mt-5" style={{ animationDelay: "220ms" }}>
        <Card title="Filtros" accentDot>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <label className="flex flex-col gap-1.5 xl:col-span-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Búsqueda</span>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Folio, título…"
                  className="field-input focus-ring w-full pl-9"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Colonia</span>
              <input
                value={colonInput}
                onChange={(e) => setColonInput(e.target.value)}
                placeholder="Colonia"
                className="field-input focus-ring w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Estado</span>
              <select
                value={estadoInput}
                onChange={(e) => setEstadoInput(e.target.value)}
                className="field-input focus-ring w-full"
              >
                {ESTADO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Tipo</span>
              <select
                value={tipoInput}
                onChange={(e) => setTipoInput(e.target.value)}
                className="field-input focus-ring w-full"
              >
                {TIPO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Asignado</span>
              <select
                value={asignadoInput}
                onChange={(e) => setAsignadoInput(e.target.value)}
                className="field-input focus-ring w-full"
              >
                <option value="">Todos</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setQInput("");
                setColonInput("");
                setEstadoInput("");
                setTipoInput("");
                setAsignadoInput("");
              }}
              disabled={!hasFilters}
              className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              Limpiar filtros
            </button>
          </div>
        </Card>
      </div>

      {/* Table */}
      <div className="reveal mt-5" style={{ animationDelay: "280ms" }}>
        <SectionHeading
          title="Casos"
          note={
            data && data.total > 0
              ? `${offset + 1}–${Math.min(offset + PAGE, data.total)} de ${data.total} casos`
              : undefined
          }
        />

        <div className="mt-4">
          {data && !data.has_territory ? (
            <div className="card-premium px-5 py-12 text-center text-ink-muted">
              Pídele a tu administrador que te asigne un territorio.
            </div>
          ) : (
            <>
              <DataState
                loading={state.loading}
                error={state.error}
                isEmpty={!state.loading && !state.error && items.length === 0}
                emptyMessage="Sin casos para los filtros seleccionados."
                onRetry={state.reload}
                skeleton={
                  <div className="card-premium p-4">
                    <SkeletonRows rows={8} />
                  </div>
                }
              >
                <DataTable
                  columns={columns}
                  rows={items}
                  rowKey={(r) => r.id}
                  pageSize={PAGE}
                  onRowClick={(r) => setSelectedId(r.id)}
                  emptyMessage="Sin casos para los filtros seleccionados."
                />
              </DataState>

              {/* Server-side pagination */}
              {!state.loading && !state.error && (data?.total ?? 0) > PAGE && (
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={state.loading || offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE))}
                    className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={state.loading || !data || offset + PAGE >= data.total}
                    onClick={() => setOffset(offset + PAGE)}
                    className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedId && (
        <CasoDetail id={selectedId} onClose={() => setSelectedId(null)} onChanged={state.reload} />
      )}
    </AppLayout>
  );
}

export default CasosPage;
