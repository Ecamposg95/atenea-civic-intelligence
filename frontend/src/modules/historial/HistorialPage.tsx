import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { getAudit } from "@/api/audit";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { MetricCard } from "@/components/ui/MetricCard";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { DatabaseIcon, LayersIcon, ShieldIcon } from "@/components/ui/icons";
import { TONE_BADGE } from "@/constants/ui";
import type { AuditEntry, AuditPage } from "@/types/audit";

const INGEST_ACTION = "ine.ingest.cartografia";
const LIMIT = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function metaSummary(meta: Record<string, unknown> | null): string {
  if (!meta) return "—";
  const entries = Object.entries(meta);
  if (entries.length === 0) return "—";
  // Show first 2 key=value pairs as a compact summary
  return entries
    .slice(0, 2)
    .map(([k, v]) => {
      const val = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
      return `${k}: ${val.length > 24 ? val.slice(0, 24) + "…" : val}`;
    })
    .join(" · ");
}

// ─── Table columns (WITH sortValue — client-side full set) ────────────────────
// sortValue on created_at enables DataTable client-side sort.
// defaultSortKey="created_at" + defaultSortDir="desc" → most recent first.

const HISTORIAL_COLUMNS: Column<AuditEntry>[] = [
  {
    key: "created_at",
    header: "Fecha",
    render: (e) => (
      <span className="font-mono text-xs tabular-nums text-ink-muted">
        {new Date(e.created_at).toLocaleString()}
      </span>
    ),
    sortValue: (e) => e.created_at,
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
  {
    key: "meta",
    header: "Detalles",
    render: (e) => (
      <span className="font-mono text-[11px] text-ink-faint">
        {metaSummary(e.meta)}
      </span>
    ),
    hideOnCard: true,
  },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export function HistorialPage() {
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const reload = useCallback(() => setRetryTick((n) => n + 1), []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    getAudit({ action: INGEST_ACTION, limit: LIMIT })
      .then((res) => {
        if (!ignore) setData(res);
      })
      .catch((e: unknown) => {
        if (!ignore)
          setError(e instanceof Error ? e.message : "Error al cargar el historial de ingestas");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [retryTick]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;

  // Derive the most recent ingest date from the loaded items (sorted desc already by server)
  const lastIngestLabel = useMemo(() => {
    const latest = items[0];
    if (!latest) return "—";
    return new Date(latest.created_at).toLocaleDateString();
  }, [items]);

  return (
    <AppLayout title="Historial de ingestas" crumb="Gobernanza">
      {/* P-1 Header — real admin module, no PreviewBanner */}
      <PageHeader
        eyebrow="Gobernanza de datos"
        title="Historial de"
        accent="ingestas"
        subtitle="Trazabilidad real de las cargas de cartografía electoral (INE) registradas en la bitácora de auditoría."
      />

      {/* P-6 Metric cards — responsive grid, no hardcoded heights */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Ingestas registradas"
          value={loading ? "—" : String(total)}
          countTo={!loading && data ? total : undefined}
          tone="accent"
          icon={<DatabaseIcon width={18} height={18} />}
          delay={0}
        />
        <MetricCard
          label="Última ingesta"
          value={loading ? "—" : lastIngestLabel}
          tone="teal"
          icon={<LayersIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Trazabilidad"
          value="Inmutable"
          tone="accent"
          icon={<ShieldIcon width={18} height={18} />}
          delay={160}
        />
      </div>

      {/* P-4 Ingest history table — P-2 DataState wraps; DataTable renders its own card-premium */}
      <div className="reveal mt-5" style={{ animationDelay: "220ms" }}>
        {/* Section header outside DataTable card */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
            <span
              className="h-1.5 w-1.5 rounded-full bg-accent-gradient shadow-glow"
              aria-hidden="true"
            />
            Línea de tiempo · cartografía INE
          </span>
          <span
            className={`font-mono text-xs text-ink-muted transition-opacity${loading ? " opacity-40" : ""}`}
          >
            {!loading && data && total > 0
              ? `${Math.min(LIMIT, total)} de ${total} ingestas`
              : ""}
          </span>
        </div>

        {/* P-2 DataState: loading → SkeletonRows, error → retry card, empty → honest message */}
        <DataState
          loading={loading}
          error={error}
          isEmpty={!loading && !error && items.length === 0}
          emptyMessage="Sin ingestas registradas."
          onRetry={reload}
          skeleton={
            <div className="card-premium p-4">
              <SkeletonRows rows={6} />
            </div>
          }
        >
          {/* P-4 DataTable — WITH sortValue (client-side full set), sort desc by timestamp */}
          <DataTable
            columns={HISTORIAL_COLUMNS}
            rows={items}
            rowKey={(e) => e.id}
            pageSize={LIMIT}
            emptyMessage="Sin ingestas registradas."
            onRowClick={(e) => setSelected(e)}
            defaultSortKey="created_at"
            defaultSortDir="desc"
          />
        </DataState>
      </div>

      {/* P-4 Detail drawer — opens on row click */}
      <IngestDetailDrawer entry={selected} onClose={() => setSelected(null)} />
    </AppLayout>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

interface IngestDetailDrawerProps {
  entry: AuditEntry | null;
  onClose: () => void;
}

function IngestDetailDrawer({ entry, onClose }: IngestDetailDrawerProps) {
  // P-7 A11y: close on Escape
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
        aria-label="Detalle de ingesta"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto bg-bg-raised shadow-2xl"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              Ingesta de cartografía
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
              <DetailField
                label="Fecha"
                value={new Date(entry.created_at).toLocaleString()}
                mono
              />
              <DetailField label="Acción">
                <span className={`pill font-mono ${TONE_BADGE.info}`}>
                  {entry.action}
                </span>
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
              <DetailField
                label="Organización"
                value={entry.organization_id ?? "—"}
                mono
              />
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
      <dd
        className={`min-w-0 break-all text-sm text-ink-muted${mono ? " font-mono text-xs" : ""}`}
      >
        {children ?? value}
      </dd>
    </div>
  );
}
