// frontend/src/modules/resultados/ResultadosPage.tsx
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PreviewBanner } from "@/components/modules/PreviewBanner";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { AnalyticsIcon, ShieldIcon, VotersIcon } from "@/components/ui/icons";
import { ENTITY_RESULTS, NATIONAL, PARTY_RESULTS } from "./fixtures";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Color chip keyed by the leading party/coalition (matches fixture palette). */
const PARTY_COLOR: Record<string, string> = Object.fromEntries(
  PARTY_RESULTS.map((p) => [p.party, p.color]),
);

export function ResultadosPage() {
  return (
    <AppLayout title="Resultados Electorales" crumb="Inteligencia Electoral">
      <PageHeader
        eyebrow="Inteligencia Electoral"
        title="Resultados"
        accent="Electorales"
        subtitle="Cómputo nacional, distribución del voto y desempeño por entidad en una sola vista institucional."
      />
      <PreviewBanner />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Participación nacional"
          value={pct(NATIONAL.turnout)}
          tone="accent"
          icon={<VotersIcon width={18} height={18} />}
          delay={0}
        />
        <MetricCard
          label="Casillas computadas"
          value={pct(NATIONAL.counted)}
          tone="teal"
          icon={<ShieldIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Fuerza líder"
          value={NATIONAL.leader}
          tone="accent"
          icon={<AnalyticsIcon width={18} height={18} />}
          delay={160}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
          <Card
            title="Distribución del voto"
            accentDot
            className="h-full"
            action={<span className="pill border-line text-ink-muted">Cómputo nacional</span>}
          >
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={PARTY_RESULTS} layout="vertical" margin={{ left: 24 }}>
                  <XAxis type="number" tickFormatter={pct} stroke="#52646d" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="party" stroke="#52646d" tick={{ fontSize: 12 }} width={110} />
                  <Tooltip
                    cursor={{ fill: "rgba(34,211,238,0.06)" }}
                    formatter={(v: number) => pct(v)}
                    contentStyle={{ background: "#06090c", border: "1px solid #223a44", borderRadius: 10 }}
                  />
                  <Bar dataKey="share" radius={[0, 6, 6, 0]}>
                    {PARTY_RESULTS.map((p) => <Cell key={p.party} fill={p.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Legend with party color chips + mono shares */}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {PARTY_RESULTS.map((p) => (
                <span key={p.party} className="inline-flex items-center gap-2 text-xs text-ink-muted">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.party}
                  <span className="font-mono text-ink-faint">{pct(p.share)}</span>
                </span>
              ))}
            </div>
          </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "200ms" }}>
          <Card
            title="Resultados por entidad"
            accentDot
            className="h-full !p-0 overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-sunken/60 text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                    <th className="px-4 py-3 font-medium">Entidad</th>
                    <th className="px-4 py-3 text-right font-medium">Participación</th>
                    <th className="px-4 py-3 font-medium">Ganador</th>
                    <th className="px-4 py-3 text-right font-medium">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {ENTITY_RESULTS.map((e) => (
                    <tr
                      key={e.entity}
                      className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-hover/50"
                    >
                      <td className="px-4 py-3 text-ink">{e.entity}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-muted">
                        {pct(e.turnout)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: PARTY_COLOR[e.winner] ?? "#7c8aa5" }}
                          />
                          <span className="text-ink">{e.winner}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-muted">
                        {pct(e.margin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
