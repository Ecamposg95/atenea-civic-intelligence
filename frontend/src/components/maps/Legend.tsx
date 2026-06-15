const STOPS = [
  { c: "#0d3b66", v: "0.45" },
  { c: "#1d6fb8", v: "" },
  { c: "#4f9cff", v: "0.68" },
  { c: "#9ecbff", v: "" },
  { c: "#dcedff", v: "0.90" },
];

export function Legend({ label }: { label: string }) {
  return (
    <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-line bg-panel/90 px-3 py-2 backdrop-blur">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-faint">{label} · muestra</div>
      <div className="flex items-center gap-1">
        {STOPS.map((s, i) => <span key={i} className="h-3 w-7" style={{ background: s.c }} />)}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-faint"><span>0.45</span><span>0.90</span></div>
    </div>
  );
}
