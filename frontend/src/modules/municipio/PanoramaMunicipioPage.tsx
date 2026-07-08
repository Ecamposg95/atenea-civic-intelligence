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
import { getMunicipioPanorama, type SeccionRow } from "@/api/municipio";

const CODE = "15076";

const nf = new Intl.NumberFormat("es-MX");
const num = (v: number | null | undefined, suffix = "") =>
  v === null || v === undefined ? "—" : `${nf.format(v)}${suffix}`;
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v}%`;

// 4-way section priority → badge tone (StatusPill only covers 3 semantic kinds,
// and priority is a category, not a good/bad state — same call as Promovidos).
const PRIORIDAD_TONE: Record<string, string> = {
  DEFENDER_EXPANDIR: "text-ok bg-ok/12",
  COMPETITIVA: "text-warm bg-warm/14",
  RECUPERAR_OPOSICION: "text-amber bg-amber/15",
  ALTA_PERSUADIBLE: "text-accent bg-accent/12",
};
const prioridadLabel = (p: string) =>
  p.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function SeccionesTabla({ secciones }: { secciones: SeccionRow[] }) {
  const maxPart = Math.max(1, ...secciones.map((s) => s.participacion));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-ink-faint">
            <th className="px-3 py-2 font-semibold">Sección</th>
            <th className="px-3 py-2 font-semibold">Participación</th>
            <th className="px-3 py-2 font-semibold text-right">Coalición</th>
            <th className="px-3 py-2 font-semibold text-right">Morena</th>
            <th className="px-3 py-2 font-semibold text-right">Margen</th>
            <th className="px-3 py-2 font-semibold">Prioridad</th>
          </tr>
        </thead>
        <tbody>
          {secciones.map((s) => (
            <tr key={s.seccion} className="border-t border-line/70 hover:bg-panel-hover">
              <td className="px-3 py-2 font-medium tabular-nums">{s.seccion}</td>
              <td className="px-3 py-2" style={{ minWidth: 130 }}>
                <CellBar value={Math.round((s.participacion / maxPart) * 100)} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{nf.format(s.coalicion)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{nf.format(s.morena)}</td>
              <td
                className="px-3 py-2 text-right tabular-nums font-semibold"
                style={{ color: s.margen >= 0 ? "rgb(var(--c-accent))" : "rgb(var(--c-warm))" }}
              >
                {s.margen >= 0 ? "+" : ""}{nf.format(s.margen)}
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
  const state = useAsync(() => getMunicipioPanorama(CODE), []);
  const d = state.data;

  return (
    <AppLayout title="San Mateo Atenco" crumb="Inteligencia municipal">
      <PageHeader
        eyebrow="Inteligencia municipal · Estudio VG"
        title="San Mateo Atenco"
        subtitle="Elección operable: margen corto, territorio compacto y voto volátil. Diagnóstico y lectura electoral 2015–2024."
      />

      <DataState loading={state.loading} error={state.error} onRetry={state.reload}>
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
                <MetricCard label="Población 5–19" value={pct(d.socio.pct_pob_5_19)} context={`crecimiento ${pct(d.socio.crecimiento_pct_2010_2020)} 2010–2020`} tone="accent" delay={200} />
              </div>
              <p className="mt-3 text-sm text-ink-muted">
                Municipio compacto, joven y familiar; el <strong>calzado</strong> concentra identidad, empleo y comercio.
                Traslado promedio al trabajo {num(d.socio.traslado_trabajo_min)} min · {pct(d.socio.pct_estudiantes_transporte_publico)} de estudiantes en transporte público.
              </p>
            </section>

            {/* Tendencia electoral */}
            <section>
              <SectionHeading eyebrow="Lectura electoral" title="Volatilidad real, no dominio absoluto" note="2015–2024" />
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <ChartFrame title="Participación ciudadana" caption="% por elección municipal">
                  <AreaTrend points={d.historico.map((h) => ({ x: String(h.anio), y: h.participacion ?? 0 }))} />
                </ChartFrame>
                <ChartFrame title="Margen de victoria" caption="votos de diferencia — la ventaja se comprimió a 874 en 2024">
                  <Bars items={d.historico.map((h) => ({ label: String(h.anio), value: h.margen_votos ?? 0 }))} />
                </ChartFrame>
              </div>
            </section>

            {/* Anatomía del voto 2024 */}
            <section>
              <SectionHeading eyebrow="Resultado 2024" title="Anatomía del voto" note="por partido" />
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <ChartFrame title="Votos por partido · 2024" caption="MC (voto bisagra) obtuvo 4.4× el margen de victoria">
                    <Bars items={d.voto2024.map((v) => ({ label: v.partido, value: v.votos }))} highlightFirst />
                  </ChartFrame>
                </div>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
                  <MetricCard label="Coalición ganadora" value={num(d.coalicion_ganadora_votos)} context="PAN·PRI·PRD·NAEM" tone="accent" />
                  <MetricCard label="Morena (solo)" value={num(d.voto2024.find((v) => v.partido === "MORENA")?.votos ?? null)} context="a 874 votos de la coalición" tone="warm" />
                </div>
              </div>
            </section>

            {/* Geografía seccional */}
            <section>
              <SectionHeading
                eyebrow="Territorio"
                title="Geografía seccional 2024"
                note={`${num(d.secciones_resumen.morena)} Morena · ${num(d.secciones_resumen.coalicion)} coalición`}
              />
              <div className="mt-4 card-premium p-2">
                {d.secciones.length > 0 ? (
                  <SeccionesTabla secciones={d.secciones} />
                ) : (
                  <p className="p-4 text-sm text-ink-faint">Sin matriz seccional cargada.</p>
                )}
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                Margen = coalición − Morena por sección. Positivo (cian) = ventaja coalición; negativo (coral) = ventaja Morena.
              </p>
            </section>
          </div>
        )}
      </DataState>
    </AppLayout>
  );
}
