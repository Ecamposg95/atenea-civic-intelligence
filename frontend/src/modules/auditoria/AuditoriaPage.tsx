import { useEffect, useMemo, useState, type ReactNode } from "react";

import { getAudit } from "@/api/audit";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { MetricCard } from "@/components/ui/MetricCard";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { DatabaseIcon, LayersIcon, SearchIcon, ShieldIcon } from "@/components/ui/icons";
import { TONE_BADGE } from "@/constants/ui";
import type { AuditEntry, AuditPage } from "@/types/audit";

const PAGE = 20;

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Convert a datetime-local value (no tz) into an ISO UTC string for the API. */
function localToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Escape a value for a CSV cell (RFC-4180 quoting). */
function csvCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(rows: AuditEntry[]): void {
  const header = [
    "id",
    "created_at",
    "action",
    "entity_type",
    "entity_id",
    "actor_id",
    "organization_id",
    "meta",
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.created_at,
        r.action,
        r.entity_type,
        r.entity_id,
        r.actor_id,
        r.organization_id,
        r.meta,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `auditoria-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Table columns (NO sortValue — server-paginated) ─────────────────────────

const AUDIT_COLUMNS: Column<AuditEntry>[] = [
  {
    key: "created_at",
    header: "Fecha",
    render: (e) => (
      <span className="font-mono text-xs tabular-nums text-ink-muted">
        {new Date(e.created_at).toLocaleString()}
      </span>
    ),
  },
  {
    key: "action",
    header: "Acción",
    render: (e) => (
      <span className={`pill font-mono ${TONE_BADGE.info}`}>{e.action}</span>
    ),
  },
  {
    key: "entity_type",
    header: "Entidad",
    render: (e) => (
      <span className="text-ink-muted">{e.entity_type ?? "—"}</span>
    ),
    hideOnCard: true,
  },
  {
    key: "actor_id",
    header: "Actor",
    render: (e) => (
      <span className="font-mono text-xs text-ink-faint">
        {e.actor_id ? e.actor_id.slice(0, 8) : "system"}
      </span>
    ),
    hideOnCard: true,
  },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export function AuditoriaPage() {
  const [data, setData] = useState<AuditPage | null>(null);
  const [offset, setOffset] = useState(0);

  // Raw inputs (debounced) vs committed filter values.
  const [actionInput, setActionInput] = useState("");
  const [entityInput, setEntityInput] = useState("");
  const [sinceInput, setSinceInput] = useState("");
  const [untilInput, setUntilInput] = useState("");

  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");

  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce raw inputs → committed filters; reset to first page.
  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      setAction(actionInput.trim());
      setEntityType(entityInput.trim());
      setSince(sinceInput);
      setUntil(untilInput);
    }, 350);
    return () => clearTimeout(t);
  }, [actionInput, entityInput, sinceInput, untilInput]);

  const reload = () => {
    setAction((a) => a);
    setOffset((o) => o);
  };

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    getAudit({
      limit: PAGE,
      offset,
      action: action || undefined,
      entity_type: entityType || undefined,
      since: localToIso(since),
      until: localToIso(until),
    })
      .then((res) => {
        if (!ignore) setData(res);
      })
      .catch((e) => {
        if (!ignore) setError(e instanceof Error ? e.message : "Error al cargar la bitácora");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [offset, action, entityType, since, until]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const hasFilters = Boolean(actionInput || entityInput || sinceInput || untilInput);

  return (
    <AppLayout title="Auditoría & Cumplimiento" crumb="Gobernanza">
      {/* P-1 Header — with CSV export in actions */}
      <PageHeader
        eyebrow="Gobernanza de datos"
        title="Auditoría &"
        accent="Cumplimiento"
        subtitle="Bitácora inmutable de acciones sensibles, con alcance por organización."
        actions={
          <button
            type="button"
            onClick={() => exportCsv(items)}
            disabled={loading || items.length === 0}
            className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
          >
            Exportar CSV
          </button>
        }
      />

      {/* Metric chips */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Eventos totales"
          value={data ? String(data.total) : "—"}
          countTo={data ? data.total : undefined}
          tone="accent"
          icon={<ShieldIcon width={18} height={18} />}
          delay={0}
        />
        <MetricCard
          label="Trazabilidad"
          value="Inmutable"
          tone="teal"
          icon={<LayersIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Alcance"
          value="Tenant-scoped"
          tone="accent"
          icon={<DatabaseIcon width={18} height={18} />}
          delay={160}
        />
      </div>

      {/* P-3 Filters */}
      <div className="reveal mt-5" style={{ animationDelay: "180ms" }}>
        <Card title="Filtros" accentDot>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Acción
              </span>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  value={actionInput}
                  onChange={(e) => setActionInput(e.target.value)}
                  placeholder="auth.login…"
                  className="field-input focus-ring w-full pl-9"
                  aria-label="Filtrar por acción"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Tipo de entidad
              </span>
              <input
                value={entityInput}
                onChange={(e) => setEntityInput(e.target.value)}
                placeholder="document, report…"
                className="field-input focus-ring w-full"
                aria-label="Filtrar por tipo de entidad"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Desde
              </span>
              <input
                type="datetime-local"
                value={sinceInput}
                onChange={(e) => setSinceInput(e.target.value)}
                className="field-input focus-ring w-full"
                aria-label="Fecha inicial"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Hasta
              </span>
              <input
                type="datetime-local"
                value={untilInput}
                onChange={(e) => setUntilInput(e.target.value)}
                className="field-input focus-ring w-full"
                aria-label="Fecha final"
              />
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setActionInput("");
                  setEntityInput("");
                  setSinceInput("");
                  setUntilInput("");
                }}
                disabled={!hasFilters}
                className="btn-ghost focus-ring w-full disabled:cursor-not-allowed disabled:opacity-40"
              >
                Limpiar
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* P-4 Bitácora table — P-2 DataState wraps; DataTable renders its own card-premium */}
      <div className="reveal mt-5" style={{ animationDelay: "220ms" }}>
        {/* Section header row (title + pagination info) outside the DataTable card */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-gradient shadow-glow" aria-hidden="true" />
            Bitácora
          </span>
          <span className="font-mono text-xs text-ink-muted">
            {data && data.total > 0
              ? `${offset + 1}–${Math.min(offset + PAGE, data.total)} de ${data.total} eventos`
              : ""}
          </span>
        </div>

        {/* P-2 DataState: loading → SkeletonRows, error → retry card, empty → honest message */}
        <DataState
          loading={loading}
          error={error}
          isEmpty={!loading && !error && items.length === 0}
          emptyMessage="Sin eventos para los filtros seleccionados."
          onRetry={reload}
          skeleton={
            <div className="card-premium p-4">
              <SkeletonRows rows={8} />
            </div>
          }
        >
          {/* P-4 DataTable — NO sortValue on any column (server-paginated) */}
          <DataTable
            columns={AUDIT_COLUMNS}
            rows={items}
            rowKey={(e) => e.id}
            pageSize={PAGE}
            emptyMessage="Sin eventos para los filtros seleccionados."
            onRowClick={(e) => setSelected(e)}
          />
        </DataState>

        {/* Server-side pagination controls — outside DataTable so DataTable's internal pager stays hidden */}
        {!loading && !error && (data?.total ?? 0) > PAGE && (
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
              className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={loading || !data || offset + PAGE >= data.total}
              onClick={() => setOffset(offset + PAGE)}
              className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {/* P-4 Detail drawer — opens on row click */}
      <AuditDetailDrawer entry={selected} onClose={() => setSelected(null)} />
    </AppLayout>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

interface AuditDetailDrawerProps {
  entry: AuditEntry | null;
  onClose: () => void;
}

function AuditDetailDrawer({ entry, onClose }: AuditDetailDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    if (!entry) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [entry, onClose]);

  if (!entry) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del evento de auditoría"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto bg-bg-raised shadow-2xl"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              Evento de auditoría
            </p>
            <h2 className="mt-0.5 font-display text-lg font-semibold text-ink">
              {entry.action}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="focus-ring rounded-md p-1.5 text-ink-faint transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 space-y-5 px-6 py-5">
          {/* Primary fields */}
          <section aria-label="Campos principales">
            <dl className="space-y-3">
              <DetailField label="Fecha" value={new Date(entry.created_at).toLocaleString()} mono />
              <DetailField label="Acción">
                <span className={`pill font-mono ${TONE_BADGE.info}`}>{entry.action}</span>
              </DetailField>
              <DetailField label="ID" value={entry.id} mono />
              <DetailField label="Entidad tipo" value={entry.entity_type ?? "—"} />
              <DetailField label="Entidad ID" value={entry.entity_id ?? "—"} mono />
            </dl>
          </section>

          <hr className="border-line" />

          {/* Actor / org */}
          <section aria-label="Actor y organización">
            <h3 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              Trazabilidad
            </h3>
            <dl className="space-y-3">
              <DetailField label="Actor ID" value={entry.actor_id ?? "system"} mono />
              <DetailField label="Organización" value={entry.organization_id ?? "—"} mono />
            </dl>
          </section>

          <hr className="border-line" />

          {/* Meta JSON */}
          <section aria-label="Metadatos">
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              Meta
            </h3>
            <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-bg-sunken/80 p-3 font-mono text-[11px] leading-relaxed text-ink-muted">
              {entry.meta ? JSON.stringify(entry.meta, null, 2) : "—"}
            </pre>
          </section>
        </div>
      </aside>
    </>
  );
}

// ─── Detail field helper ──────────────────────────────────────────────────────

function DetailField({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
        {label}
      </dt>
      <dd className={`min-w-0 break-all text-sm text-ink-muted${mono ? " font-mono text-xs" : ""}`}>
        {children ?? value}
      </dd>
    </div>
  );
}
