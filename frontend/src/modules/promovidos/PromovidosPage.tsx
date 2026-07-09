import { useCallback, useEffect, useMemo, useState } from "react";
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
import { revelarClaves } from "@/api/admin";
import { listPromovidos, type Promovido } from "@/api/promovidos";
import { useAuthStore } from "@/store/authStore";
import { PromovidoDetail } from "./components/PromovidoDetail";

const PAGE = 50;

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

/** es-MX short date, null-safe against missing/invalid values. */
const formatFecha = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-MX");
};

const BASE_COLUMNS: Column<Promovido>[] = [
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
    key: "direccion",
    header: "Dirección",
    hideOnCard: true,
    sortValue: (p) => p.direccion ?? "",
    render: (p) => <span className="text-ink-muted">{p.direccion ?? "—"}</span>,
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
    key: "created_at",
    header: "Fecha de captura",
    hideOnCard: true,
    sortValue: (p) => (p.created_at ? new Date(p.created_at).getTime() : -Infinity),
    render: (p) => (
      <span className="font-mono text-xs tabular-nums text-ink-muted">
        {formatFecha(p.created_at)}
      </span>
    ),
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
  const role = useAuthStore((s) => s.user?.role);
  const canReveal = role === "superadmin" || role === "admin" || role === "coordinador";

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Promovido | null>(null);

  // Batch reveal — audited server-side. Local-only state, never persisted.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  // Debounce raw search input → committed value, resetting to the first page.
  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      setQ(qInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const state = useAsync(() => listPromovidos({ q, limit: PAGE, offset }), [q, offset]);
  const data = state.data;
  const items = data?.items ?? [];

  const shownRevealedCount = useMemo(
    () => items.filter((p) => Boolean(revealed[p.id])).length,
    [items, revealed],
  );

  const handleRevealBatch = useCallback(async () => {
    const ids = items.map((p) => p.id);
    if (ids.length === 0) return;
    const confirmed = window.confirm(
      `¿Confirma revelar la clave de elector de los ${ids.length} promovidos en pantalla?\nEsta acción queda registrada en la bitácora de auditoría.`,
    );
    if (!confirmed) return;

    setRevealing(true);
    setRevealError(null);
    try {
      const claves = await revelarClaves(ids);
      setRevealed((prev) => ({ ...prev, ...claves }));
    } catch (e) {
      setRevealError(e instanceof Error ? e.message : "No se pudieron revelar las claves.");
    } finally {
      setRevealing(false);
    }
  }, [items]);

  const columns = useMemo<Column<Promovido>[]>(() => {
    if (!canReveal) return BASE_COLUMNS;
    return [
      ...BASE_COLUMNS,
      {
        key: "clave_elector",
        header: "Clave de elector",
        hideOnCard: true,
        render: (p) =>
          revealed[p.id] ? (
            <span className="font-mono text-xs tabular-nums text-ink">{revealed[p.id]}</span>
          ) : (
            <span className="font-mono text-xs tabular-nums text-ink-faint">
              {p.clave_masked ?? "—"}
            </span>
          ),
      },
    ];
  }, [canReveal, revealed]);

  return (
    <AppLayout title="Promovidos" crumb="Ciudadanía">
      <PageHeader eyebrow="Ciudadanía" title="Tabla de" accent="Promovidos"
        subtitle="Ciudadanos promovidos de tu campaña, con contexto electoral por sección. Clic en una fila para ver todo el detalle."
        actions={
          canReveal ? (
            <div className="flex flex-col items-end gap-1.5">
              <button
                type="button"
                disabled={revealing || items.length === 0}
                onClick={() => void handleRevealBatch()}
                className="btn-primary focus-ring disabled:cursor-not-allowed disabled:opacity-40"
              >
                {revealing ? "Revelando…" : "Revelar claves"}
              </button>
              {revealError ? (
                <span className="font-mono text-[11px] text-state-critical">{revealError}</span>
              ) : shownRevealedCount > 0 ? (
                <span className="font-mono text-[11px] text-ink-faint">
                  {shownRevealedCount} de {items.length} reveladas (auditado)
                </span>
              ) : null}
            </div>
          ) : undefined
        } />

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
                context="En tu campaña"
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
                  value={qInput} onChange={(e) => setQInput(e.target.value)} />
              </div>
              <DataTable<Promovido>
                columns={columns}
                rows={items}
                rowKey={(p) => p.id}
                pageSize={PAGE}
                defaultSortKey="nombre_completo"
                defaultSortDir="asc"
                emptyMessage="Sin promovidos…"
                onRowClick={(p) => setSelected(p)}
              />

              {/* Server-side pagination — the table above only ever holds one page. */}
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
            </div>
          </div>
        </DataState>
      )}

      {selected && <PromovidoDetail promovido={selected} onClose={() => setSelected(null)} />}
    </AppLayout>
  );
}
