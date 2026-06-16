import { useEffect, useMemo, useState } from "react";

import { getAudit } from "@/api/audit";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { DatabaseIcon, LayersIcon, SearchIcon, ShieldIcon } from "@/components/ui/icons";
import type { AuditEntry, AuditPage } from "@/types/audit";

const PAGE = 20;

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

  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the raw inputs into the committed filters; reset to first page.
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

  return (
    <AppLayout title="Auditoría & Cumplimiento" crumb="Gobernanza">
      <PageHeader
        eyebrow="Gobernanza de datos"
        title="Auditoría &"
        accent="Cumplimiento"
        subtitle="Bitácora inmutable de acciones sensibles, con alcance por organización."
      />

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

      {/* Filter row */}
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
                  className="field-input w-full pl-9"
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
                className="field-input w-full"
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
                className="field-input w-full"
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
                className="field-input w-full"
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
                disabled={!actionInput && !entityInput && !sinceInput && !untilInput}
                className="btn-ghost w-full disabled:cursor-not-allowed disabled:opacity-40"
              >
                Limpiar
              </button>
            </div>
          </div>
        </Card>
      </div>

      <div className="reveal mt-5" style={{ animationDelay: "220ms" }}>
        <Card
          title="Bitácora"
          accentDot
          className="!p-0 overflow-hidden"
          action={
            <button
              type="button"
              onClick={() => exportCsv(items)}
              disabled={loading || items.length === 0}
              className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
            >
              Exportar CSV
            </button>
          }
        >
          <DataState
            loading={loading}
            error={error}
            isEmpty={items.length === 0}
            emptyMessage="Sin eventos para los filtros seleccionados."
            onRetry={() => {
              // Re-trigger the effect by nudging the committed action filter.
              setAction((a) => a);
              setOffset((o) => o);
            }}
            skeleton={
              <div className="space-y-2 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-md bg-panel-hover" />
                ))}
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-sunken/60 text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                    <th className="w-8 px-4 py-3 font-medium" />
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Acción</th>
                    <th className="px-4 py-3 font-medium">Entidad</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => {
                    const isOpen = expanded === e.id;
                    return (
                      <FragmentRow
                        key={e.id}
                        entry={e}
                        isOpen={isOpen}
                        onToggle={() => setExpanded(isOpen ? null : e.id)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DataState>

          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-muted">
            <span className="font-mono text-xs">
              {data && data.total > 0
                ? `${offset + 1}–${Math.min(offset + PAGE, data.total)} de ${data.total}`
                : ""}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading || offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
                className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={loading || !data || offset + PAGE >= data.total}
                onClick={() => setOffset(offset + PAGE)}
                className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}

interface FragmentRowProps {
  entry: AuditEntry;
  isOpen: boolean;
  onToggle: () => void;
}

function FragmentRow({ entry, isOpen, onToggle }: FragmentRowProps) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-panel-hover/50"
      >
        <td className="px-4 py-3 text-ink-faint">
          <span
            className="inline-block transition-transform"
            style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
            aria-hidden
          >
            ›
          </span>
        </td>
        <td className="px-4 py-3 font-mono text-xs tabular-nums text-ink-muted">
          {new Date(entry.created_at).toLocaleString()}
        </td>
        <td className="px-4 py-3">
          <span className="pill border-accent/30 bg-accent/10 font-mono text-accent">
            {entry.action}
          </span>
        </td>
        <td className="px-4 py-3 text-ink-muted">{entry.entity_type ?? "—"}</td>
        <td className="px-4 py-3 font-mono text-xs text-ink-faint">
          {entry.actor_id ? entry.actor_id.slice(0, 8) : "system"}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-line/60 bg-bg-sunken/40 last:border-0">
          <td colSpan={5} className="px-4 py-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <dl className="space-y-1.5 text-xs">
                <DetailRow label="ID" value={entry.id} mono />
                <DetailRow label="Entidad ID" value={entry.entity_id ?? "—"} mono />
                <DetailRow label="Actor ID" value={entry.actor_id ?? "system"} mono />
                <DetailRow
                  label="Organización"
                  value={entry.organization_id ?? "—"}
                  mono
                />
              </dl>
              <div>
                <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                  Meta
                </div>
                <pre className="max-h-64 overflow-auto rounded-md border border-line bg-bg-sunken/80 p-3 font-mono text-[11px] leading-relaxed text-ink-muted">
                  {entry.meta ? JSON.stringify(entry.meta, null, 2) : "—"}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-24 shrink-0 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
        {label}
      </dt>
      <dd className={`break-all text-ink-muted${mono ? " font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
