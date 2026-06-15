const STOPS = ["#0d3b66", "#1d6fb8", "#4f9cff", "#9ecbff", "#dcedff"];

export function Legend({ label }: { label: string }) {
  return (
    <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-line bg-panel/90 px-3 py-2 backdrop-blur">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-faint">{label} · muestra</div>
      <div className="flex items-center gap-1">
        {STOPS.map((c, i) => <span key={i} className="h-3 w-7" style={{ background: c }} />)}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-faint"><span>0.45</span><span>0.90</span></div>
    </div>
  );
}
