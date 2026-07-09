// frontend/src/modules/minutas/MisAcuerdosPage.tsx
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { StatusPill, type StatusKind } from "@/components/ui/StatusPill";
import { useAsync } from "@/hooks/useAsync";
import { listAcuerdos, type Acuerdo } from "@/api/minutas";

type Bucket = "vencido" | "hoy" | "proximo" | "sin-fecha" | "cerrado";

const TERMINAL = new Set(["CUMPLIDO", "CANCELADO"]);

const ACUERDO_ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  CUMPLIDO: "Cumplido",
  CANCELADO: "Cancelado",
};

/** vencido (fecha_limite < hoy, no terminal) / hoy / próximo (futuro, no terminal) / sin-fecha / cerrado (terminal). */
function bucketOf(a: Acuerdo): Bucket {
  if (TERMINAL.has(a.estado)) return "cerrado";
  if (!a.fecha_limite) return "sin-fecha";
  const hoy = new Date().toISOString().slice(0, 10);
  if (a.fecha_limite < hoy) return "vencido";
  if (a.fecha_limite === hoy) return "hoy";
  return "proximo";
}

// `kind` drives the color-coded StatusPill rendered next to each section
// heading below — vencido=crit, hoy=warn, próximos=ok, cerrado=ok. "sin-fecha"
// has no urgency kind (`null`) since there's nothing to be urgent about, so it
// renders as a neutral/muted pill instead of a StatusPill.
const BUCKET_META: Record<Bucket, { title: string; kind: StatusKind | null; empty: string }> = {
  vencido: { title: "Vencidos", kind: "crit", empty: "Sin acuerdos vencidos." },
  hoy: { title: "Vencen hoy", kind: "warn", empty: "Nada vence hoy." },
  proximo: { title: "Próximos", kind: "ok", empty: "Sin acuerdos próximos." },
  "sin-fecha": { title: "Sin fecha límite", kind: null, empty: "Todos los acuerdos tienen fecha límite." },
  cerrado: { title: "Cerrados", kind: "ok", empty: "Sin acuerdos cerrados." },
};

const BUCKET_ORDER: Bucket[] = ["vencido", "hoy", "proximo", "sin-fecha", "cerrado"];

function AcuerdoRow({ a, onOpenMinuta }: { a: Acuerdo; onOpenMinuta: () => void }) {
  return (
    <li className="card-premium flex items-start justify-between gap-3 p-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{a.texto}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
          <span>{a.responsable_nombre ?? "Sin responsable"}</span>
          <span className="font-mono">{a.fecha_limite ?? "sin fecha"}</span>
          <button type="button" onClick={onOpenMinuta} className="focus-ring text-accent hover:underline">
            Ver minuta
          </button>
        </div>
      </div>
      <span className="pill shrink-0 border-line bg-panel-hover text-ink-muted">
        {ACUERDO_ESTADO_LABEL[a.estado] ?? a.estado}
      </span>
    </li>
  );
}

/**
 * Cross-cutting "mis acuerdos" view — every acuerdo the current user can see
 * (scoped server-side by `GET /acuerdos`), grouped by vencimiento so a
 * lider/coordinador can triage: vencido → hoy → próximo → sin fecha → cerrado.
 */
export function MisAcuerdosPage() {
  const nav = useNavigate();
  const state = useAsync(() => listAcuerdos({ limit: 200, offset: 0 }), []);
  const items = state.data?.items ?? [];

  const grouped = useMemo(() => {
    const g: Record<Bucket, Acuerdo[]> = {
      vencido: [],
      hoy: [],
      proximo: [],
      "sin-fecha": [],
      cerrado: [],
    };
    for (const a of items) g[bucketOf(a)].push(a);
    return g;
  }, [items]);

  const abiertosPendientes = items.length - grouped.cerrado.length;

  return (
    <AppLayout title="Acuerdos" crumb="Ciudadanía">
      <PageHeader
        eyebrow="Ciudadanía"
        title="Seguimiento de"
        accent="acuerdos"
        subtitle="Todos los acuerdos de tus minutas, agrupados por vencimiento — para no perder de vista ningún compromiso."
      />

      <section className="reveal mt-2 flex flex-col gap-4" style={{ animationDelay: "60ms" }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            label="Vencidos"
            value={String(grouped.vencido.length)}
            countTo={grouped.vencido.length}
            tone="critical"
            context="Requieren atención"
            delay={0}
          />
          <MetricCard
            label="Vencen hoy"
            value={String(grouped.hoy.length)}
            countTo={grouped.hoy.length}
            tone="warning"
            context="Cierra hoy"
            delay={60}
          />
          <MetricCard
            label="Abiertos"
            value={String(abiertosPendientes)}
            countTo={abiertosPendientes}
            tone="warm"
            context="Sin contar cerrados"
            delay={120}
          />
        </div>
      </section>

      <div className="reveal mt-5" style={{ animationDelay: "160ms" }}>
        <DataState
          loading={state.loading}
          error={state.error}
          onRetry={state.reload}
          isEmpty={!state.loading && !state.error && items.length === 0}
          emptyMessage="Sin acuerdos registrados todavía."
          skeleton={
            <div className="card-premium p-4">
              <SkeletonRows rows={5} />
            </div>
          }
        >
          <div className="flex flex-col gap-6">
            {BUCKET_ORDER.map((bucket) => {
              const meta = BUCKET_META[bucket];
              const rows = grouped[bucket];
              return (
                <div key={bucket}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <SectionHeading title={meta.title} />
                    {meta.kind ? (
                      <StatusPill kind={meta.kind}>{rows.length}</StatusPill>
                    ) : (
                      <span className="pill border-line bg-panel-hover text-ink-faint">{rows.length}</span>
                    )}
                  </div>
                  {rows.length === 0 ? (
                    <p className="text-sm text-ink-faint">{meta.empty}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {rows.map((a) => (
                        <AcuerdoRow key={a.id} a={a} onOpenMinuta={() => nav(`/minutas/${a.minuta_id}`)} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </DataState>
      </div>
    </AppLayout>
  );
}

export default MisAcuerdosPage;
