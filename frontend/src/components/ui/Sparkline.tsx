import { useId } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fillFrom?: string;
  className?: string;
}

export function Sparkline({
  data,
  width = 120,
  height = 36,
  stroke = "var(--chart-1)",
  fillFrom = "color-mix(in srgb, var(--chart-1) 35%, transparent)",
  className,
}: SparklineProps) {
  const rawId = useId();
  const gradId = `spark-${rawId.replace(/[:]/g, "")}`;

  if (data.length === 0) {
    return null;
  }

  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (d - min) / span) * (height - pad * 2);
    return { x, y };
  });

  // Smooth line via Catmull-Rom -> cubic Bézier conversion.
  const linePath = points.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    const p0 = arr[i - 1];
    const c1x = p0.x + stepX / 3;
    const c1y = p0.y;
    const c2x = p.x - stepX / 3;
    const c2y = p.y;
    return `${acc} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(
      2,
    )} ${c2y.toFixed(2)}, ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }, "");

  const last = points[points.length - 1];
  const areaPath = `${linePath} L ${last.x.toFixed(2)} ${(
    height - pad
  ).toFixed(2)} L ${points[0].x.toFixed(2)} ${(height - pad).toFixed(2)} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillFrom} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="animate-fade-in"
        style={{
          strokeDasharray: 600,
          strokeDashoffset: 600,
          animation: "spark-draw 1.4s cubic-bezier(.16,1,.3,1) forwards",
        }}
      />
      <circle cx={last.x} cy={last.y} r={2.4} fill={stroke} />
      <style>{`@keyframes spark-draw { to { stroke-dashoffset: 0; } }`}</style>
    </svg>
  );
}
