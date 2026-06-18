import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_PALETTE, CHART_TOOLTIP_STYLE } from "@/constants/ui";

export interface CoverageDatum {
  level: string;
  count: number;
}


export function CoverageBars({ data, height = 200 }: { data: CoverageDatum[]; height?: number }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="level"
            stroke="var(--chart-axis)"
            tick={{ fontSize: 12, fill: "var(--chart-5)" }}
            tickLine={false}
            axisLine={false}
            width={96}
          />
          <Tooltip
            cursor={{ fill: "color-mix(in srgb, var(--chart-1) 8%, transparent)" }}
            contentStyle={CHART_TOOLTIP_STYLE}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={16}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
