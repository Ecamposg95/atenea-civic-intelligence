import { useEffect, useState } from "react";

import { getAudit } from "@/api/audit";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { ShieldIcon } from "@/components/ui/icons";
import type { AuditPage } from "@/types/audit";

const PAGE = 20;

export function AuditoriaPage() {
  const [data, setData] = useState<AuditPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAudit({ limit: PAGE, offset, action: action || undefined })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [offset, action]);

  const items = data?.items ?? [];

  return (
    <AppLayout title="Auditoría & Cumplimiento" crumb="Gobernanza">
      <div className="mb-6">
        <div className="eyebrow">Gobernanza de datos</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
          Auditoría & Cumplimiento
        </h1>
        <p className="mt-1 max-w-xl text-sm text-ink-muted">
          Bitácora inmutable de acciones sensibles, con alcance por organización.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
          {error}
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Eventos totales" value={data ? String(data.total) : "—"} icon={<ShieldIcon width={18} height={18} />} />
        <MetricCard label="Trazabilidad" value="Inmutable" />
        <MetricCard label="Alcance" value="Tenant-scoped" />
      </div>

      <Card
        title="Bitácora"
        action={
          <input
            value={action}
            onChange={(e) => { setOffset(0); setAction(e.target.value); }}
            placeholder="Filtrar por acción…"
            className="rounded-lg border border-line bg-bg-sunken px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint"
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2">Acción</th>
                <th className="px-2 py-2">Entidad</th>
                <th className="px-2 py-2">Actor</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="px-2 py-2 text-ink-muted">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-2 py-2"><span className="pill border-accent/30 bg-accent/10 text-accent">{e.action}</span></td>
                  <td className="px-2 py-2 text-ink-muted">{e.entity_type ?? "—"}</td>
                  <td className="px-2 py-2 text-ink-faint">{e.actor_id ? e.actor_id.slice(0, 8) : "system"}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={4} className="px-2 py-6 text-center text-ink-faint">Sin eventos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
          <span>{data ? `${offset + 1}–${Math.min(offset + PAGE, data.total)} de ${data.total}` : ""}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="pill border-line disabled:opacity-40">Anterior</button>
            <button disabled={!data || offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)} className="pill border-line disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      </Card>
    </AppLayout>
  );
}
