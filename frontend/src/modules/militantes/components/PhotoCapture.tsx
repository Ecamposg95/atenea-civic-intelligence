import { useState } from "react";
import { compressImage } from "../lib/image";

export function PhotoCapture({ label, onCapture }: { label: string; onCapture: (b: Blob | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const blob = await compressImage(f);
      setError(null);
      setPreview(URL.createObjectURL(blob));
      onCapture(blob);
    } catch {
      setError("No se pudo procesar la foto. Intenta de nuevo o elige otra imagen.");
      onCapture(null);
    } finally {
      // Allow re-selecting the same file (retry) by resetting the input value.
      e.target.value = "";
    }
  };
  return (
    <div className={`card-premium p-4 transition-colors ${preview ? "border-state-ok/30" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-muted">{label}</span>
        {preview && (
          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-state-ok">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Capturada
          </span>
        )}
      </div>

      {preview && (
        <img
          src={preview}
          alt={label}
          className="mt-2.5 h-40 w-full rounded-lg border border-line object-cover"
        />
      )}

      {error && (
        <p className="mt-2.5 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-xs text-state-critical">
          {error}
        </p>
      )}

      {/* Large, thumb-friendly tap target for one-handed field capture. */}
      <label
        className={`mt-2.5 flex min-h-[64px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-4 text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${
          preview
            ? "border-line text-ink-muted hover:border-accent/40 hover:text-ink"
            : "border-accent/40 bg-accent/5 text-accent hover:bg-accent/10"
        }`}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8h2.5l1.2-2h8.6l1.2 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
          <circle cx="12" cy="13.5" r="3.5" />
        </svg>
        {preview ? "Volver a tomar" : "Tomar foto"}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      </label>
    </div>
  );
}
