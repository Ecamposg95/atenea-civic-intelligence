import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getAlertas, type Alerta } from "@/api/alertas";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StatusPill } from "@/components/ui/StatusPill";
import { useAsync } from "@/hooks/useAsync";
import { useCampaignStore } from "@/store/campaignStore";
import { SEVERIDAD, filtrarAlertas, haceCuanto, type FiltroCategoria } from "./logic";
import { SeccionGrid } from "./SeccionGrid";

const FILTROS: { key: FiltroCategoria; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "territorial", label: "Territoriales" },
  { key: "operativa", label: "Operativas" },
];

function FilaAlerta({ a }: { a: Alerta }) {
  const sev = SEVERIDAD[a.severidad];
  return (
    <li
      className="flex flex-col gap-2 rounded-lg border border-l-2 border-line bg-bg-sunken px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderLeftColor: sev.color }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusPill kind={sev.pill}>{sev.label}</StatusPill>
        <span className="font-mono text-xs text-ink-faint" title={a.detalle}>{a.regla}</span>
        <span className="text-sm text-ink">{a.titulo}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-ink-muted">
        {a.valor !== null && a.umbral !== null && (
          <span className="tabular-nums">{a.valor} · umbral {a.umbral}</span>
        )}
        <Link to={a.enlace} className="font-semibold text-accent focus-ring">Ir →</Link>
      </div>
    </li>
  );
}

export default function AlertasPage() {
  const activeId = useCampaignStore((s) => s.activeId);
  const campaignName = useCampaignStore(
    (s) => s.campaigns.find((c) => c.id === s.activeId)?.name ?? null,
  );
  const state = useAsync(() => (activeId ? getAlertas() : Promise.resolve(null)), [activeId]);
  const [categoria, setCategoria] = useState<FiltroCategoria>("todas");
  const [seccion, setSeccion] = useState<string | null>(null);
  useEffect(() => {
    setSeccion(null);
    setCategoria("todas");
  }, [activeId]);
  const d =state.data;
  const visibles = useMemo(
    () => (d ? filtrarAlertas(d.items, categoria, seccion) : []),
    [d, categoria, seccion],
  );

  return (
    <AppLayout title="Alertas" crumb="Centro de riesgo">
      <PageHeader
        eyebrow="Operación · Riesgo"
        title={campaignName ? `Alertas · ${campaignName}` : "Alertas"}
        subtitle="Riesgos territoriales y operativos de la campaña, calculados en vivo. Cada alerta lleva al módulo donde se atiende."
        actions={
          activeId ? (
            <button
              type="button"
              onClick={state.reload}
              aria-label="Volver a evaluar alertas"
              className="btn-ghost focus-ring"
            >
              ⟳ {d ? haceCuanto(d.evaluado_en) : "Evaluar"}
            </button>
          ) : undefined
        }
      />

      {!activeId ? (
        <div className="card-premium p-6 text-sm text-ink-muted">
          Selecciona una campaña en la barra superior para ver sus alertas.
        </div>
      ) : (
        <DataState loading={state.loading} error={state.error} onRetry={state.reload}>
          {d && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <MetricCard label="Críticas" value={String(d.resumen.critica)} tone="critical" delay={80} />
                <MetricCard label="Altas" value={String(d.resumen.alta)} tone="warm" delay={120} />
                <MetricCard label="Medias" value={String(d.resumen.media)} tone="warning" delay={160} />
                <MetricCard
                  label="Secciones afectadas"
                  value={`${d.resumen.secciones_afectadas}/${d.resumen.secciones_total}`}
                  tone="accent"
                  delay={200}
                />
              </div>

              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
                {FILTROS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setCategoria(f.key)}
                    aria-pressed={categoria === f.key}
                    className={`focus-ring rounded-pill border px-3 py-1 text-sm ${
                      categoria === f.key ? "border-ink bg-panel-hover font-semibold" : "border-line"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {d.secciones.length > 0 && (
                <section>
                  <SectionHeading
                    eyebrow="Territorio"
                    title="Secciones"
                    note={seccion ? `filtrando sección ${seccion} · clic de nuevo para quitar` : "clic en una sección para filtrar"}
                  />
                  <div className="mt-4">
                    <SeccionGrid
                      secciones={d.secciones}
                      seleccion={seccion}
                      onSelect={(s) => setSeccion((prev) => (prev === s ? null : s))}
                    />
                  </div>
                </section>
              )}

              <section>
                <SectionHeading eyebrow="Bandeja" title="Alertas" note={`${visibles.length} de ${d.items.length}`} />
                {visibles.length > 0 ? (
                  <ul className="mt-4 space-y-2.5">
                    {visibles.map((a) => <FilaAlerta key={a.clave} a={a} />)}
                  </ul>
                ) : (
                  <p className="mt-4 rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-sm text-ink-muted">
                    {d.items.length === 0 ? "Sin alertas: todo en verde." : "Ninguna alerta con este filtro."}
                  </p>
                )}
              </section>
            </div>
          )}
        </DataState>
      )}
    </AppLayout>
  );
}
