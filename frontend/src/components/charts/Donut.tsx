// frontend/src/components/charts/Donut.tsx
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { CHART_PALETTE, CHART_TOOLTIP_STYLE } from "@/constants/ui";

export interface DonutDatum { name: string; value: number; color?: string; }

const numberFormat = new Intl.NumberFormat("es-MX");

/**
 * Public API is `{ data, height }` and MUST stay that way — this component
 * has existing consumers across the app (Panorama, Demografia, Denue,
 * Economia, Indice, AnalyticsPage) that pass no `centerLabel`. `centerLabel`
 * is additive/optional; everything else here is an internal enhancement
 * (tighter segment gap, center total) layered on the same Recharts pie.
 */
export function Donut({
  data,
  height = 200,
  centerLabel,
}: {
  data: DonutDatum[];
  height?: number;
  /** Optional caption shown under the total in the donut's center hole. */
  centerLabel?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const formattedTotal = numberFormat.format(total);

  return (
    <div
      className="relative"
      style={{ width: "100%", height }}
      role="img"
      aria-label={`Donut${centerLabel ? ` de ${centerLabel}` : ""}, total ${formattedTotal}`}
    >
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={1.5} stroke="none">
            {data.map((d, i) => <Cell key={d.name} fill={d.color ?? CHART_PALETTE[i % CHART_PALETTE.length]} />)}
          </Pie>
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-lg font-bold tabular-nums text-ink">{formattedTotal}</span>
        {centerLabel && <span className="text-[10px] uppercase tracking-wider text-ink-faint">{centerLabel}</span>}
      </div>
    </div>
  );
}
