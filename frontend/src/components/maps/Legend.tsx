// Gradient stops mirror the CHORO_FILL ramp in MapCanvas (deep cyan → bright cyan → amber).
const RAMP = "linear-gradient(90deg, #062a30 0%, #0e7490 28%, #22d3ee 64%, #67e8f9 84%, #f5b53d 100%)";

export function Legend({ label }: { label: string }) {
  return (
    <div className="animate-fade-up absolute bottom-3 left-3 z-10 w-44 rounded-xl border border-line-strong/70 bg-panel/70 px-3 py-2.5 shadow-glow backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow !tracking-[0.16em] text-ink-muted">{label}</span>
        <span className="pill border-teal/30 bg-teal/10 !px-1.5 !py-0.5 text-[9px] text-teal">
          muestra
        </span>
      </div>
      <div
        className="h-2.5 w-full rounded-pill ring-1 ring-inset ring-white/10"
        style={{ background: RAMP }}
      />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-faint">
        <span>0.45</span>
        <span>0.90</span>
      </div>
    </div>
  );
}
