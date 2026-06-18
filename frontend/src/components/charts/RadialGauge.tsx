// frontend/src/components/charts/RadialGauge.tsx
export function RadialGauge({ value, label, size = 132 }: { value: number; label?: string; size?: number }) {
  const v = Math.max(0, Math.min(1, value));
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const off = c * (1 - v);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-grid)" strokeWidth={10} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-1)" strokeWidth={10}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.16,1,.3,1)", filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--chart-1) 50%, transparent))" }} />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-2xl font-bold tabular-nums text-ink">{(v * 100).toFixed(0)}%</div>
        {label && <div className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>}
      </div>
    </div>
  );
}
