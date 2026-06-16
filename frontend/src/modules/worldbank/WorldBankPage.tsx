import { getWbIndicator } from "@/api/intel";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { ParticipationChart } from "@/components/dashboards/ParticipationChart";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { useAsync } from "@/hooks/useAsync";

const CODES = [
  { code: "NY.GDP.MKTP.CD", label: "PIB (USD)" },
  { code: "NY.GDP.PCAP.CD", label: "PIB per cápita (USD)" },
  { code: "SP.POP.TOTL", label: "Población" },
  { code: "SP.URB.TOTL.IN.ZS", label: "Población urbana (%)" },
  { code: "SP.DYN.LE00.IN", label: "Esperanza de vida (años)" },
  { code: "FP.CPI.TOTL.ZG", label: "Inflación (%)" },
  { code: "SL.UEM.TOTL.ZS", label: "Desempleo (%)" },
  { code: "IT.NET.USER.ZS", label: "Usuarios de internet (%)" },
];

const compact = new Intl.NumberFormat("es-MX", { notation: "compact" });
const pct = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

function IndicatorCard({ code, label }: { code: string; label: string }) {
  const { data, loading, error, reload } = useAsync(
    () => getWbIndicator(code),
    [code],
  );
  const points = data?.points ?? [];
  const series = points.map((p) => ({
    period: String(p.year),
    value: p.value,
  }));

  // Latest vs previous: percentage change between the two most recent points.
  const latest = points.at(-1);
  const previous = points.at(-2);
  const deltaPct =
    latest && previous && previous.value !== 0
      ? ((latest.value - previous.value) / Math.abs(previous.value)) * 100
      : null;

  return (
    <Card
      title={label}
      accentDot
      className="card-premium hud-corners h-full"
      action={
        data?.latest && (
          <span className="pill border-line font-mono text-ink-muted">
            {data.latest.year}
          </span>
        )
      }
    >
      <DataState
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={!!data && series.length === 0}
        emptyMessage="Sin serie disponible para este indicador."
        skeleton={
          <div className="h-[190px] animate-pulse rounded-lg bg-panel-hover" />
        }
      >
        {data && (
          <>
            <div className="mb-2 flex items-end gap-2">
              <span className="font-display text-3xl font-bold tabular-nums tracking-tight text-ink">
                {data.latest ? compact.format(data.latest.value) : "—"}
              </span>
              {deltaPct !== null && (
                <span
                  className={`pill mb-1 font-mono text-[11px] ${
                    deltaPct >= 0
                      ? "border-emerald-500/30 text-emerald-400"
                      : "border-rose-500/30 text-rose-400"
                  }`}
                  title={`Variación vs ${previous?.year}`}
                >
                  {deltaPct >= 0 ? "▲" : "▼"} {pct.format(deltaPct)}%
                </span>
              )}
            </div>
            <ParticipationChart
              data={series}
              height={160}
              valueFormat="number"
              seriesLabel={label}
            />
            <p className="mt-3 text-[11px] text-ink-faint">
              Fuente: {data.source}
            </p>
          </>
        )}
      </DataState>
    </Card>
  );
}

export function WorldBankPage() {
  return (
    <AppLayout title="Indicadores Nacionales" crumb="World Bank · Macro">
      <PageHeader
        eyebrow="Contexto macro"
        title="Indicadores"
        accent="Nacionales"
        subtitle="Series macroeconómicas de México (Banco Mundial). Datos reales."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {CODES.map((c, i) => (
          <div
            key={c.code}
            className="reveal"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <IndicatorCard {...c} />
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
