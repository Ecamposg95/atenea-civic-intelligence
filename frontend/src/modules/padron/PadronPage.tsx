// frontend/src/modules/padron/PadronPage.tsx
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PreviewBanner } from "@/components/modules/PreviewBanner";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { DatabaseIcon, LayersIcon, UserIcon, VotersIcon } from "@/components/ui/icons";
import { AGE_BANDS, SUMMARY, TOP_ENTITIES } from "./fixtures";

const nf = new Intl.NumberFormat("es-MX");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const maxPadron = Math.max(...TOP_ENTITIES.map((e) => e.padron));

export function PadronPage() {
  return (
    <AppLayout title="Padrón / Lista Nominal" crumb="Inteligencia Electoral">
      <PageHeader
        eyebrow="Inteligencia Electoral"
        title="Padrón &"
        accent="Lista Nominal"
        subtitle="Composición demográfica del electorado y cobertura por entidad para planeación territorial."
      />
      <PreviewBanner />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Padrón electoral"
          value={nf.format(SUMMARY.padron)}
          tone="accent"
          icon={<VotersIcon width={18} height={18} />}
          delay={0}
        />
        <MetricCard
          label="Lista nominal"
          value={nf.format(SUMMARY.listaNominal)}
          tone="teal"
          icon={<UserIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Cobertura"
          value={pct(SUMMARY.cobertura)}
          tone="accent"
          icon={<LayersIcon width={18} height={18} />}
          delay={160}
        />
        <MetricCard
          label="Edad mediana"
          value={`${SUMMARY.edadMediana} años`}
          tone="teal"
          icon={<DatabaseIcon width={18} height={18} />}
          delay={240}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
          <Card
            title="Distribución por edad y sexo (%)"
            accentDot
            className="h-full"
            action={
              <div className="flex items-center gap-3 text-xs text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#22d3ee" }} />
                  Hombres
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#2dd4bf" }} />
                  Mujeres
                </span>
              </div>
            }
          >
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={AGE_BANDS} margin={{ left: -16 }}>
                  <XAxis dataKey="band" stroke="#52646d" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#52646d" tick={{ fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: "rgba(34,211,238,0.06)" }}
                    contentStyle={{ background: "#06090c", border: "1px solid #223a44", borderRadius: 10 }}
                  />
                  <Bar dataKey="hombres" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="mujeres" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "200ms" }}>
          <Card title="Padrón por entidad (top 5)" accentDot className="h-full">
            <div className="space-y-2.5">
              {TOP_ENTITIES.map((e, i) => (
                <div
                  key={e.entity}
                  className="reveal group relative overflow-hidden rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:bg-panel-hover"
                  style={{ animationDelay: `${260 + i * 60}ms` }}
                >
                  {/* Proportional fill bar */}
                  <span
                    className="pointer-events-none absolute inset-y-0 left-0 bg-accent/10"
                    style={{ width: `${(e.padron / maxPadron) * 100}%` }}
                    aria-hidden="true"
                  />
                  <div className="relative flex items-center justify-between gap-3">
                    <span className="text-sm text-ink">{e.entity}</span>
                    <span className="font-mono text-sm tabular-nums text-ink-muted">
                      {nf.format(e.padron)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
