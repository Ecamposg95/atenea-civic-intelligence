// frontend/src/components/charts/Heatmap.tsx
export interface HeatCell { label: string; value: number; }
export function Heatmap({ data, columns = 7 }: { data: HeatCell[]; columns?: number }) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}>
      {data.map((d, i) => {
        const t = d.value / max;
        return (
          <div key={i} title={`${d.label}: ${d.value}`}
            className="aspect-square rounded-[3px] border border-line/60"
            style={{ background: `color-mix(in srgb, var(--chart-1) ${Math.round((0.08 + t * 0.8) * 100)}%, transparent)` }} />
        );
      })}
    </div>
  );
}
