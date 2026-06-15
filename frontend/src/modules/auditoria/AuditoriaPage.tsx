import { useEffect, useState } from "react";

import { getAudit } from "@/api/audit";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { DatabaseIcon, LayersIcon, SearchIcon, ShieldIcon } from "@/components/ui/icons";
import type { AuditPage } from "@/types/audit";

const PAGE = 20;

export function AuditoriaPage() {
  const [data, setData] = useState<AuditPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [actionInput, setActionInput] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the raw input into the committed filter; reset to first page.
  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      setAction(actionInput.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [actionInput]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    getAudit({ limit: PAGE, offset, action: action || undefined })
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
  }, [offset, action]);

  const items = data?.items ?? [];

  return (
    <AppLayout title="Auditoría & Cumplimiento" crumb="Gobernanza">
      <PageHeader
        eyebrow="Gobernanza de datos"
        title="Auditoría &"
        accent="Cumplimiento"
        subtitle="Bitácora inmutable de acciones sensibles, con alcance por organización."
      />

      {error && (
        <div className="reveal mb-4 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
          {error}
        </div>
      )}

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

      <div className="reveal mt-5" style={{ animationDelay: "200ms" }}>
        <Card
          title="Bitácora"
          accentDot
          className="!p-0 overflow-hidden"
          action={
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={actionInput}
                onChange={(e) => setActionInput(e.target.value)}
                placeholder="Filtrar por acción…"
                className="field-input w-44 pl-9 sm:w-56"
              />
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-bg-sunken/60 text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                  <th className="px-4 py-3 font-medium">Entidad</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-line/60 last:border-0">
                      <td colSpan={4} className="px-4 py-2.5">
                        <div className="h-6 animate-pulse rounded-md bg-panel-hover" />
                      </td>
                    </tr>
                  ))}
                {!loading && items.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-hover/50"
                  >
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-ink-muted">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3"><span className="pill border-accent/30 bg-accent/10 font-mono text-accent">{e.action}</span></td>
                    <td className="px-4 py-3 text-ink-muted">{e.entity_type ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-faint">{e.actor_id ? e.actor_id.slice(0, 8) : "system"}</td>
                  </tr>
                ))}
                {!loading && items.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-ink-faint">Sin eventos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-muted">
            <span className="font-mono text-xs">{data ? `${offset + 1}–${Math.min(offset + PAGE, data.total)} de ${data.total}` : ""}</span>
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
