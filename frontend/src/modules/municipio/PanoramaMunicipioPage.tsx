import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { AreaTrend } from "@/components/charts/AreaTrend";
import { Bars } from "@/components/charts/Bars";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { DataState } from "@/components/ui/DataState";
import { CellBar } from "@/components/ui/CellBar";
import { useAsync } from "@/hooks/useAsync";
import { getMunicipioPanorama, getRegion, type SeccionRow } from "@/api/municipio";
import { useCampaignStore } from "@/store/campaignStore";
import { pickDefaultCode } from "./regionHelpers";

const nf = new Intl.NumberFormat("es-MX");
const num = (v: number | null | undefined, suffix = "") =>
  v === null || v === undefined ? "—" : `${nf.format(v)}${suffix}`;
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v}%`;

// 4-way section priority → badge tone (StatusPill only covers 3 semantic kinds,
// and priority is a category, not a good/bad state — same call as Promovidos).
const PRIORIDAD_TONE: Record<string, string> = {
  DEFENDER_EXPANDIR: "text-state-ok bg-state-ok/12",
  COMPETITIVA: "text-warm bg-warm/14",
  RECUPERAR_OPOSICION: "text-amber bg-amber/15",
  ALTA_PERSUADIBLE: "text-accent bg-accent/12",
};
const prioridadLabel = (p: string) =>
  p.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function SeccionesTabla({
  secciones,
  bloques,
  onRowClick,
}: {
  secciones: SeccionRow[];
  bloques: { propio: string; rival: string };
  onRowClick: (seccion: string) => void;
}) {
  const maxPart = Math.max(1, ...secciones.map((s) => s.participacion ?? 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-ink-faint">
            <th className="px-3 py-2 font-semibold">Sección</th>
            <th className="px-3 py-2 font-semibold">Participación</th>
            <th className="px-3 py-2 font-semibold text-right">{bloques.propio}</th>
            <th className="px-3 py-2 font-semibold text-right">{bloques.rival}</th>
            <th className="px-3 py-2 font-semibold text-right">Margen</th>
            <th className="px-3 py-2 font-semibold">Prioridad</th>
          </tr>
        </thead>
        <tbody>
          {secciones.map((s) => (
            <tr
              key={s.seccion}
              onClick={() => onRowClick(s.seccion)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowClick(s.seccion);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Ver plan territorial de la sección ${s.seccion}`}
              className="cursor-pointer border-t border-line/70 transition-colors hover:bg-panel-hover focus-ring"
            >
              <td className="px-3 py-2 font-medium tabular-nums">{s.seccion}</td>
              <td className="px-3 py-2" style={{ minWidth: 130 }}>
                <CellBar value={Math.round(((s.participacion ?? 0) / maxPart) * 100)} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{num(s.coalicion)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{num(s.morena)}</td>
              <td
                className="px-3 py-2 text-right tabular-nums font-semibold"
                style={s.margen != null ? { color: s.margen >= 0 ? "rgb(var(--c-accent))" : "rgb(var(--c-warm))" } : undefined}
              >
                {s.margen != null ? `${s.margen >= 0 ? "+" : ""}${nf.format(s.margen)}` : "—"}
              </td>
              <td className="px-3 py-2">
                <span className={`inline-flex rounded-pill px-2 py-0.5 text-[11px] font-semibold ${PRIORIDAD_TONE[s.prioridad] ?? "text-ink-muted bg-line/60"}`}>
                  {prioridadLabel(s.prioridad)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PanoramaMunicipioPage() {
  const activeId = useCampaignStore((s) => s.activeId);
  const campaign = useCampaignStore((s) => s.campaigns.find((c) => c.id === s.activeId));
  const hasMunicipio = !!campaign?.municipio_code;
  const regionState = useAsync(
    () =>
      !activeId
        ? Promise.reject(new Error("Selecciona una campaña"))
        : !hasMunicipio
          ? Promise.reject(new Error("Esta campaña no tiene municipio asignado"))
          : getRegion(),
    [activeId, hasMunicipio],
  );
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    setSelected(null);
  }, [activeId]);
  const code = selected ?? (regionState.data ? pickDefaultCode(regionState.data, campaign?.municipio_code) : null);
  const state = useAsync(() => (code ? getMunicipioPanorama(code) : Promise.resolve(null)), [code]);
  const d = state.data;
  const nav = useNavigate();
  const esCampana = !!code && code === campaign?.municipio_code;
  const nombre = d?.municipio.name ?? "Panorama municipal";
  const region = regionState.data;

  return (
    <AppLayout title={nombre} crumb="Inteligencia municipal">
      <PageHeader
        eyebrow="Inteligencia municipal · IEEM / INEGI"
        title={nombre}
        subtitle="Diagnóstico y lectura electoral 2018–2024 por sección."
      />

      {region && region.municipios.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Municipio">
          {region.municipios.map((m) => (
            <button
              key={m.code}
              role="tab"
              aria-selected={m.code === code}
              onClick={() => setSelected(m.code)}
              className={`rounded-pill px-3 py-1 text-xs font-semibold focus-ring ${m.code === code ? "bg-accent/15 text-accent" : "bg-line/60 text-ink-muted hover:text-ink"}`}
            >
              {m.name}
              {m.es_campana ? " · campaña" : ""}
            </button>
          ))}
        </div>
      )}

      <DataState
        loading={regionState.loading || state.loading}
        error={regionState.error ?? state.error}
        onRetry={regionState.error ? regionState.reload : state.reload}
      >
        {d && (
          <div className="space-y-8">
            {/* Resumen ejecutivo */}
            <section>
              <SectionHeading
                eyebrow="Resumen ejecutivo"
                title="La elección se decide sección por sección"
                note={`${num(d.secciones_resumen.casillas)} casillas · 2024`}
              />
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
                <MetricCard
                  label="Margen 2024"
                  value={num(d.secciones_resumen.margen_2024)}
                  context={`${d.secciones_resumen.margen_pp_2024 ?? "—"} pp sobre válidos`}
                  tone="warm"
                  delay={80}
                />
                <MetricCard label="Secciones" value={num(d.secciones_resumen.total)} context="territorio municipal" tone="accent" delay={120} />
                <MetricCard label="Persuadibles" value={num(d.secciones_resumen.persuadibles)} context="±150 votos · alta prioridad" tone="teal" delay={160} />
                <MetricCard label="Participación 2024" value={pct(d.secciones_resumen.participacion_2024)} context="alta movilización" tone="accent" delay={200} />
                <MetricCard label="Votos totales" value={num(d.secciones_resumen.votos_2024)} context="2024" tone="accent" delay={240} />
              </div>
            </section>

            {/* Radiografía municipal */}
            <section>
              <SectionHeading eyebrow="Diagnóstico" title="Radiografía municipal" note="Censo 2020 · CONEVAL" />
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                <MetricCard label="Población" value={num(d.socio.poblacion)} context={`${pct(d.socio.pct_mujeres)} mujeres`} tone="warm" delay={80} />
                <MetricCard label="Pobreza moderada" value={pct(d.socio.pobreza_moderada_pct)} context={`${pct(d.socio.pobreza_extrema_pct)} extrema`} tone="warning" delay={120} />
                <MetricCard label="Viviendas" value={num(d.socio.viviendas)} context={`${pct(d.socio.pct_jefa_hogar)} con jefa de hogar`} tone="teal" delay={160} />
                <MetricCard label="18 años y más" value={num(d.socio.pob_18_mas)} context={`crecimiento ${pct(d.socio.crecimiento_pct_2010_2020)} 2010–2020`} tone="accent" delay={200} />
              </div>
              <p className="mt-3 text-sm text-ink-muted">
                Grado promedio de escolaridad {num(d.socio.grado_escolaridad)} · {pct(d.socio.pct_sin_derechohabiencia)} sin derechohabiencia · {pct(d.socio.pct_viviendas_internet)} de viviendas con internet.
              </p>
            </section>

            {/* Tendencia electoral */}
            <section>
              <SectionHeading eyebrow="Lectura electoral" title="Tendencia electoral municipal" note="2018–2024" />
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <ChartFrame title="Participación ciudadana" caption="% por elección municipal">
                  <AreaTrend points={d.historico.map((h) => ({ x: String(h.anio), y: h.participacion ?? 0 }))} />
                </ChartFrame>
                <ChartFrame title="Margen de victoria" caption="votos de diferencia por elección">
                  <Bars items={d.historico.map((h) => ({ label: String(h.anio), value: h.margen_votos ?? 0 }))} />
                </ChartFrame>
              </div>
            </section>

            {/* Anatomía del voto 2024 */}
            <section>
              <SectionHeading eyebrow="Resultado 2024" title="Anatomía del voto" note="por partido" />
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <ChartFrame title="Votos por partido · 2024" caption="voto directo por partido">
                    <Bars items={d.voto2024.map((v) => ({ label: v.partido, value: v.votos }))} highlightFirst />
                  </ChartFrame>
                </div>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
                  <MetricCard label="Coalición ganadora" value={num(d.coalicion_ganadora_votos)} context="bloque ganador" tone="accent" />
                  <MetricCard label="Morena (solo)" value={num(d.voto2024.find((v) => v.partido === "MORENA")?.votos ?? null)} context="voto directo del partido" tone="warm" />
                </div>
              </div>
            </section>

            {/* Geografía seccional */}
            <section>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionHeading
                  eyebrow="Territorio"
                  title="Geografía seccional 2024"
                  note={`${num(d.secciones_resumen.coalicion)} ${d.bloques.propio} · ${num(d.secciones_resumen.morena)} ${d.bloques.rival}`}
                />
                {esCampana && (
                  <Link to="/plan-territorial" className="btn-primary focus-ring shrink-0">
                    Ver Plan Territorial
                  </Link>
                )}
              </div>
              <div className="mt-4 card-premium p-2">
                {d.secciones.length > 0 ? (
                  <SeccionesTabla
                    secciones={d.secciones}
                    bloques={d.bloques}
                    onRowClick={esCampana ? () => nav("/plan-territorial") : () => {}}
                  />
                ) : (
                  <p className="p-4 text-sm text-ink-faint">Sin matriz seccional cargada.</p>
                )}
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                Margen = {d.bloques.propio} − {d.bloques.rival} por sección. Positivo = ventaja propia; negativo = ventaja rival.
              </p>
            </section>

            {region && region.municipios.length > 1 && (
              <section>
                <SectionHeading eyebrow="Región" title={region.region} note="IEEM 2024 · Censo 2020" />
                <div className="mt-4 card-premium overflow-x-auto p-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-ink-faint">
                        <th className="px-3 py-2">Municipio</th>
                        <th className="px-3 py-2 text-right">Lista nominal</th>
                        <th className="px-3 py-2 text-right">Participación</th>
                        <th className="px-3 py-2 text-right">Margen 2024</th>
                        <th className="px-3 py-2 text-right">Secciones</th>
                        <th className="px-3 py-2 text-right">Persuadibles</th>
                        <th className="px-3 py-2 text-right">Población</th>
                      </tr>
                    </thead>
                    <tbody>
                      {region.municipios.map((m) => (
                        <tr key={m.code} className={`border-t border-line/70 ${m.es_campana ? "bg-accent/8 font-semibold" : ""}`}>
                          <td className="px-3 py-2">{m.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{num(m.lista_nominal_2024)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{pct(m.participacion_2024)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {m.margen_votos_2024 != null ? `${m.margen_votos_2024 >= 0 ? "+" : ""}${nf.format(m.margen_votos_2024)}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{num(m.secciones_total)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{num(m.secciones_persuadibles)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{num(m.poblacion)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </DataState>
    </AppLayout>
  );
}
