import { useMemo } from "react";

import { getAudit } from "@/api/audit";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { DatabaseIcon, LayersIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import type { AuditEntry, AuditPage } from "@/types/audit";

const INGEST_ACTION = "ine.ingest.cartografia";

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function metaEntries(meta: Record<string, unknown> | null): [string, string][] {
  if (!meta) return [];
  return Object.entries(meta).map(([k, v]) => [k, formatMetaValue(v)]);
}

function IngestRow({ entry, index }: { entry: AuditEntry; index: number }) {
  const entries = metaEntries(entry.meta);
  return (
    <li
      className="reveal relative pl-8"
      style={{ animationDelay: `${Math.min(index * 50, 400)}ms` }}
    >
      {/* timeline rail + node */}
      <span
        className="absolute left-[7px] top-2 bottom-0 w-px bg-line"
        aria-hidden="true"
      />
      <span
        className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-accent bg-bg shadow-glow"
        aria-hidden="true"
      />
      <div className="card-premium p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="pill border-accent/30 bg-accent/10 font-mono text-accent">
            {entry.action}
          </span>
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {new Date(entry.created_at).toLocaleString()}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
          <span className="text-ink-faint">
            Actor:{" "}
            <span className="font-mono text-ink-muted">
              {entry.actor_id ? entry.actor_id.slice(0, 8) : "system"}
            </span>
          </span>
          {entry.entity_type && (
            <span className="text-ink-faint">
              Entidad:{" "}
              <span className="font-mono text-ink-muted">
                {entry.entity_type}
              </span>
            </span>
          )}
        </div>
        {entries.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {entries.map(([k, v]) => (
              <span
                key={k}
                className="pill border-line bg-bg-sunken/60 font-mono text-[11px] text-ink-muted"
              >
                <span className="text-ink-faint">{k}:</span>&nbsp;{v}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export function HistorialPage() {
  const { data, loading, error, reload } = useAsync<AuditPage>(
    () => getAudit({ action: INGEST_ACTION, limit: 50 }),
    [],
  );

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;

  return (
    <AppLayout title="Historial de ingestas" crumb="Gobernanza">
      <PageHeader
        eyebrow="Gobernanza de datos"
        title="Historial de"
        accent="ingestas"
        subtitle="Trazabilidad real de las cargas de cartografía electoral (INE) registradas en la bitácora de auditoría."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <span className="metric-chip h-11 w-11 text-accent">
              <DatabaseIcon width={20} height={20} />
            </span>
            <div>
              <div className="font-display text-2xl font-bold text-ink">
                <AnimatedNumber value={total} />
              </div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Ingestas registradas
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <span className="metric-chip h-11 w-11 text-teal">
              <LayersIcon width={20} height={20} />
            </span>
            <div>
              <div className="font-display text-2xl font-bold text-ink">
                Inmutable
              </div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Trazabilidad
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <span className="metric-chip h-11 w-11 text-accent">
              <DatabaseIcon width={20} height={20} />
            </span>
            <div>
              <div className="font-display text-2xl font-bold text-ink">
                INE
              </div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Fuente · cartografía
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="reveal mt-5" style={{ animationDelay: "200ms" }}>
        <Card title="Línea de tiempo de ingestas" accentDot>
          <DataState
            loading={loading}
            error={error}
            isEmpty={items.length === 0}
            onRetry={reload}
            emptyMessage="Aún no se han registrado ingestas de cartografía electoral."
            skeleton={
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-lg bg-panel-hover"
                  />
                ))}
              </div>
            }
          >
            <ol className="space-y-3">
              {items.map((entry, i) => (
                <IngestRow key={entry.id} entry={entry} index={i} />
              ))}
            </ol>
          </DataState>
        </Card>
      </div>
    </AppLayout>
  );
}
