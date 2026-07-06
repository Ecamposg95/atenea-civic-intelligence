import { useEffect, useRef } from "react";

export function SignaturePad({ onChange }: { onChange: (b: Blob | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    c.width = c.offsetWidth; c.height = 200;
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#e8faff";
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => { drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: PointerEvent) => { if (!drawing.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const up = () => { if (!drawing.current) return; drawing.current = false; c.toBlob((b) => onChange(b), "image/png"); };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [onChange]);
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); onChange(null); };
  return (
    <div>
      <div className="hud-corners relative overflow-hidden rounded-lg border border-line bg-bg-sunken">
        {/* Baseline guide + hint — purely decorative, sit behind the canvas */}
        <div
          className="pointer-events-none absolute inset-x-4 bottom-9 border-t border-dashed border-line-strong"
          aria-hidden="true"
        />
        <span className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          Firma aquí
        </span>
        <canvas ref={ref} className="h-[200px] w-full touch-none" />
      </div>
      <button
        type="button"
        onClick={clear}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-muted transition-all duration-150 hover:border-state-critical/40 hover:text-state-critical active:scale-[0.97]"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        </svg>
        Limpiar firma
      </button>
    </div>
  );
}
