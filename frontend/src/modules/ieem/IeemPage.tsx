import { useMemo, useState } from "react";

import { getIeemDataset, getIeemDatasets } from "@/api/intel";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SearchIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";

export function IeemPage() {
  const [key, setKey] = useState("municipios");
  const [q, setQ] = useState("");
  const datasets = useAsync(() => getIeemDatasets(), []).data ?? [];
  const { data, loading, error, reload } = useAsync(
    () => getIeemDataset(key),
    [key],
  );

  const rows = useMemo(() => {
    if (!data) return [];
    if (!q.trim()) return data.rows;
    const needle = q.toLowerCase();
    return data.rows.filter((r) =>
      Object.values(r).some((v) => v.toLowerCase().includes(needle)),
    );
  }, [data, q]);

  return (
    <AppLayout
      title="Estado de México — Electoral"
      crumb="IEEM · Inteligencia Electoral"
    >
      <PageHeader
        eyebrow="Inteligencia Electoral"
        title="Estado de México"
        accent="(IEEM)"
        subtitle="Estadística electoral oficial del Instituto Electoral del Estado de México (Registro Federal de Electores). Datos reales."
        actions={
          data && (
            <MetricCard label={data.label} value={String(data.count)} tone="accent" />
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {datasets.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => {
              setKey(d.key);
              setQ("");
            }}
            aria-pressed={key === d.key}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
              key === d.key
                ? "border-accent/40 bg-accent/10 text-accent shadow-glow-accent"
                : "border-line bg-bg-sunken text-ink-muted hover:text-ink"
            }`}
          >
            {d.label}
          </button>
        ))}
        <div className="relative ml-auto max-w-xs flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="field-input !py-2 pl-9"
          />
        </div>
      </div>

      <Card
        title={data?.label ?? "Dataset"}
        accentDot
        className="card-premium hud-corners"
      >
        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          isEmpty={!!data && data.rows.length === 0}
          emptyMessage="El dataset no devolvió filas."
          skeleton={
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-9 animate-pulse rounded-lg bg-panel-hover"
                />
              ))}
            </div>
          }
        >
          {data && (
            <>
              <div className="max-h-[460px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-panel">
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-faint">
                      {data.columns.map((c) => (
                        <th key={c} className="px-2 py-2">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={data.columns.length}
                          className="px-2 py-8 text-center text-sm text-ink-faint"
                        >
                          Ninguna fila coincide con “{q}”.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r, i) => (
                        <tr
                          key={i}
                          className="border-t border-line transition-colors hover:bg-panel-hover"
                        >
                          {data.columns.map((c) => (
                            <td
                              key={c}
                              className="px-2 py-2 font-mono text-ink-muted"
                            >
                              {r[c]}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] text-ink-faint">
                Fuente: {data.source} · {rows.length} de {data.count} filas
              </p>
            </>
          )}
        </DataState>
      </Card>
    </AppLayout>
  );
}
