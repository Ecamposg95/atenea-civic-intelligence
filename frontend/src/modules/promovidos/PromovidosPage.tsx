import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

const PRIORIDAD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todas" },
  { value: "ALTA_PERSUADIBLE", label: "Alta persuadible" },
  { value: "COMPETITIVA", label: "Competitiva" },
  { value: "DEFENDER_EXPANDIR", label: "Defender/Expandir" },
  { value: "RECUPERAR_OPOSICION", label: "Recuperar oposición" },
];

/** Server sort keys — must match the backend's `sort=<...>` allow-list. */
const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "nombre", label: "Nombre" },
  { value: "seccion", label: "Sección" },
  { value: "created_at", label: "Fecha de captura" },
  { value: "edad", label: "Edad" },
];

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

// NOTE: no `sortValue` on these columns — sorting is server-side for this
// page (full 3500+ row dataset), driven by the explicit "Ordenar por"
// control below. Client-side header sort over a single fetched page would
// silently mislead users into thinking they see the globally-sorted top/
// bottom rows, so DataTable's own click-to-sort headers are intentionally
// left disabled here.
const BASE_COLUMNS: Column<Promovido>[] = [
  {
    key: "nombre_completo",
    header: "Nombre",
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
    render: (p) => <span className="tabular-nums text-ink-muted">{p.edad ?? "—"}</span>,
  },
  {
    key: "seccion",
    header: "Sección",
    render: (p) => <span className="font-mono text-ink-muted">{p.seccion ?? "—"}</span>,
  },
  {
    key: "direccion",
    header: "Dirección",
    hideOnCard: true,
    render: (p) => <span className="text-ink-muted">{p.direccion ?? "—"}</span>,
  },
  {
    key: "colonia",
    header: "Colonia",
    hideOnCard: true,
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
    render: (p) => p.promotor ?? "—",
  },
  {
    key: "estructura",
    header: "Estructura",
    hideOnCard: true,
    render: (p) => p.estructura ?? "—",
  },
  {
    key: "created_at",
    header: "Fecha de captura",
    hideOnCard: true,
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
    render: (p) => (
      <span className="font-mono tabular-nums text-ink-muted">{p.margen ?? "—"}</span>
    ),
  },
  {
    key: "prioridad",
    header: "Prioridad",
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
  const canImport = canReveal;

  // Raw inputs (debounced) vs. committed filter values.
  const [qInput, setQInput] = useState("");
  const [seccionInput, setSeccionInput] = useState("");
  const [promotorInput, setPromotorInput] = useState("");

  const [q, setQ] = useState("");
  const [seccion, setSeccion] = useState("");
  const [promotor, setPromotor] = useState("");
  const [prioridad, setPrioridad] = useState("");

  // Server-side sort — reflects the FULL dataset, not just the visible page.
  const [sortKey, setSortKey] = useState<"nombre" | "seccion" | "created_at" | "edad">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Promovido | null>(null);

  // Batch reveal — audited server-side. Local-only state, never persisted.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  // Debounce raw text inputs → committed values, resetting to the first page.
  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      setQ(qInput.trim());
      setSeccion(seccionInput.trim());
      setPromotor(promotorInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [qInput, seccionInput, promotorInput]);

  // Clear revealed claves and errors whenever the visible set can change (PII hygiene).
  useEffect(() => {
    setRevealed({});
    setRevealError(null);
  }, [offset, q, seccion, promotor, prioridad, sortKey, sortDir]);

  const state = useAsync(
    () =>
      listPromovidos({
        q,
        seccion,
        promotor,
        prioridad,
        sort: sortKey,
        order: sortDir,
        limit: PAGE,
        offset,
      }),
    [q, seccion, promotor, prioridad, sortKey, sortDir, offset],
  );
  const data = state.data;
  const items = data?.items ?? [];
  const hasFilters = Boolean(q || seccion || promotor || prioridad);

  const shownRevealedCount = useMemo(
    () => items.filter((p) => Boolean(revealed[p.id])).length,
    [items, revealed],
  );

  const handleRevealBatch = useCallback(async () => {
    const ids = items.map((p) => p.id).filter((id) => !(id in revealed));
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
  }, [items, revealed]);

  const handleClearFilters = useCallback(() => {
    setQInput("");
    setSeccionInput("");
    setPromotorInput("");
    setPrioridad("");
    setOffset(0);
  }, []);

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

  const isEmpty = !state.loading && !state.error && items.length === 0;

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
                context={hasFilters ? "Con filtros aplicados" : "En tu campaña"}
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

              {/* Filters */}
              <div className="mb-3 mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                    Buscar
                  </span>
                  <input className="field-input focus-ring w-full" placeholder="Buscar nombre…"
                    value={qInput} onChange={(e) => setQInput(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                    Sección
                  </span>
                  <input className="field-input focus-ring w-full" placeholder="0001"
                    value={seccionInput} onChange={(e) => setSeccionInput(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                    Promotor
                  </span>
                  <input className="field-input focus-ring w-full" placeholder="Nombre del promotor"
                    value={promotorInput} onChange={(e) => setPromotorInput(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                    Prioridad
                  </span>
                  <select className="field-input focus-ring w-full" value={prioridad}
                    onChange={(e) => { setPrioridad(e.target.value); setOffset(0); }}>
                    {PRIORIDAD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Server-side sort — applies to the full filtered dataset. */}
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                      Ordenar por
                    </span>
                    <select className="field-input focus-ring w-44" value={sortKey}
                      onChange={(e) => { setSortKey(e.target.value as "nombre" | "seccion" | "created_at" | "edad"); setOffset(0); }}>
                      {SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn-ghost focus-ring"
                    onClick={() => {
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      setOffset(0);
                    }}
                    title={sortDir === "asc" ? "Ascendente" : "Descendente"}
                    aria-label={sortDir === "asc" ? "Orden ascendente, cambiar a descendente" : "Orden descendente, cambiar a ascendente"}
                  >
                    {sortDir === "asc" ? "↑ Ascendente" : "↓ Descendente"}
                  </button>
                </div>

                {hasFilters && (
                  <button type="button" className="btn-ghost focus-ring" onClick={handleClearFilters}>
                    Limpiar filtros
                  </button>
                )}
              </div>

              {isEmpty ? (
                <div className="card-premium reveal flex flex-col items-center gap-3 px-5 py-12 text-center">
                  <p className="text-sm text-ink-muted">
                    {hasFilters
                      ? "Ningún promovido coincide con estos filtros."
                      : "Aún no hay promovidos capturados."}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link to="/captura-rapida" className="btn-primary focus-ring">
                      Capturar
                    </Link>
                    {canImport && (
                      <Link to="/promovidos/importar" className="btn-ghost focus-ring">
                        Importar Excel
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <DataTable<Promovido>
                    columns={columns}
                    rows={items}
                    rowKey={(p) => p.id}
                    pageSize={PAGE}
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
                </>
              )}
            </div>
          </div>
        </DataState>
      )}

      {selected && <PromovidoDetail promovido={selected} onClose={() => setSelected(null)} />}
    </AppLayout>
  );
}
