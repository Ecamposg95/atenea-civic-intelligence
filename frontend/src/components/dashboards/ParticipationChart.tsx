import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TrendPoint } from "@/types/analytics";

interface ParticipationChartProps {
  data: TrendPoint[];
  height?: number;
  /** "number" renders integer counts; "percent" renders 0–1 ratios as %. */
  valueFormat?: "number" | "percent";
  seriesLabel?: string;
}

const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`;
const fmtNum = (v: number) => `${v}`;

export function ParticipationChart({
  data,
  height = 220,
  valueFormat = "number",
  seriesLabel = "Eventos",
}: ParticipationChartProps) {
  const fmt = valueFormat === "percent" ? fmtPct : fmtNum;
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="participationFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.42} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#15242b" vertical={false} />
          <XAxis
            dataKey="period"
            stroke="#52646d"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "#15242b" }}
          />
          <YAxis
            stroke="#52646d"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmt}
            domain={[0, "auto"]}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "#223a44", strokeWidth: 1 }}
            contentStyle={{
              background: "#06090c",
              border: "1px solid #223a44",
              borderRadius: 10,
              color: "#e6f2f5",
              fontSize: 12,
            }}
            labelStyle={{ color: "#8ba0a8" }}
            formatter={(value: number) => [fmt(value), seriesLabel]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#22d3ee"
            strokeWidth={2}
            fill="url(#participationFill)"
            dot={{ r: 3, fill: "#22d3ee", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#f5b53d", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
