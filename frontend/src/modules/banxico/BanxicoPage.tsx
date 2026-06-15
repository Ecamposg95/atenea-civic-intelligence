// frontend/src/modules/banxico/BanxicoPage.tsx
import { useEffect, useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PreviewBanner } from "@/components/modules/PreviewBanner";
import { ParticipationChart } from "@/components/dashboards/ParticipationChart";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { AnalyticsIcon } from "@/components/ui/icons";
import { getSeries } from "./client";
import { SERIES_ORDER, type SerieDef } from "./fixtures";

const TONES = ["accent", "teal", "warning", "accent"] as const;

const fmtValue = (s: SerieDef, v: number): string => {
  if (s.valueFormat === "percent") return `${(v * 100).toFixed(2)}%`;
  return `${v.toFixed(s.code === "SP68257" ? 3 : 2)}${s.suffix ?? ""}`;
};

const delta = (s: SerieDef): { text: string; up: boolean } | null => {
  const pts = s.points;
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1].value;
  const prev = pts[pts.length - 2].value;
  const diff = last - prev;
  if (diff === 0) return null;
  const text =
    s.valueFormat === "percent"
      ? `${diff > 0 ? "+" : ""}${(diff * 100).toFixed(2)} pp m/m`
      : `${diff > 0 ? "+" : ""}${diff.toFixed(3)} m/m`;
  return { text, up: diff > 0 };
};

export function BanxicoPage() {
  const [series, setSeries] = useState<SerieDef[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all(SERIES_ORDER.map((code) => getSeries(code))).then((res) => {
      if (active) setSeries(res.filter((s): s is SerieDef => s !== null));
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppLayout title="Indicadores Banxico" crumb="Macro-financiero">
      <PageHeader
        eyebrow="Macro-financiero"
        title="Indicadores"
        accent="Banxico"
        subtitle="Tipo de cambio, inflación, tasa objetivo y UDIS — contexto macro para la lectura territorial."
        actions={<span className="pill border-line text-ink-muted">Fuente futura · Banxico SIE</span>}
      />
      <PreviewBanner note="Datos de muestra (Banxico SIE) · Preview. Las series son ilustrativas y se conectarán a la fuente real." />

      {series.length === 0 && <LoadingState />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {series.map((s, i) => {
          const latest = s.points[s.points.length - 1];
          const d = delta(s);
          return (
            <MetricCard
              key={s.code}
              label={s.label}
              value={latest ? fmtValue(s, latest.value) : "—"}
              tone={TONES[i % TONES.length]}
              delta={d?.up ? d.text : undefined}
              icon={<AnalyticsIcon width={18} height={18} />}
              delay={i * 80}
            />
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {series.map((s, i) => (
          <div key={s.code} className="reveal" style={{ animationDelay: `${120 + i * 80}ms` }}>
            <Card
              title={s.label}
              accentDot
              className="h-full"
              action={
                <span className="pill border-line font-mono text-ink-muted">{s.code} · muestra</span>
              }
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-display text-2xl font-bold tabular-nums text-ink">
                  {s.points.length > 0 ? fmtValue(s, s.points[s.points.length - 1].value) : "—"}
                </span>
                <span className="text-xs text-ink-faint">{s.unit}</span>
              </div>
              <ParticipationChart
                data={s.points}
                height={180}
                valueFormat={s.valueFormat}
                seriesLabel={s.label}
              />
              <p className="mt-3 text-[11px] text-ink-faint">
                Fuente: Banxico SIE ({s.code}) · serie de muestra
              </p>
            </Card>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}

function LoadingState() {
  return (
    <div className="reveal grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card-premium h-28 animate-pulse p-5" />
      ))}
    </div>
  );
}
