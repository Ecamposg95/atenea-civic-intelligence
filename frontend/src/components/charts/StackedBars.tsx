// frontend/src/components/charts/StackedBars.tsx
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CHART_TOOLTIP_STYLE } from "@/constants/ui";

export interface StackSeries { key: string; color: string; }
export function StackedBars({ data, series, xKey, height = 240 }: {
  data: Record<string, number | string>[]; series: StackSeries[]; xKey: string; height?: number | string;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: -16, top: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={xKey} stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} />
          <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          {series.map((s) => <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} radius={[2, 2, 0, 0]} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
