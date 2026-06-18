import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_PALETTE, CHART_TOOLTIP_STYLE } from "@/constants/ui";
import type { TrendPoint } from "@/types/analytics";

interface ParticipationChartProps {
  data: TrendPoint[];
  /**
   * Explicit pixel height. Pass `undefined` (with a sized parent wrapper) to
   * fill the parent's height via 100%/100%.
   */
  height?: number;
  /** "number" renders integer counts; "percent" renders 0–1 ratios as %. */
  valueFormat?: "number" | "percent";
  seriesLabel?: string;
  /** Override series color (defaults to CHART_PALETTE[0]). */
  color?: string;
}

const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`;
const fmtNum = (v: number) => `${v}`;

export function ParticipationChart({
  data,
  height = 220,
  valueFormat = "number",
  seriesLabel = "Eventos",
  color = CHART_PALETTE[0],
}: ParticipationChartProps) {
  const fmt = valueFormat === "percent" ? fmtPct : fmtNum;
  return (
    <div style={{ width: "100%", height: height ?? "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="participationFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.42} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
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
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={{ color: "#8ba0a8" }}
            formatter={(value: number) => [fmt(value), seriesLabel]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill="url(#participationFill)"
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: CHART_PALETTE[1], strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
