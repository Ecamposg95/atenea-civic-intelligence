import { useState } from "react";
import { Link } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import {
  previewImport,
  commitImport,
  type ImportPreview,
  type ImportResult,
} from "@/api/promovidos";

export function ImportarPromovidosPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function onPick(f: File | null) {
    reset();
    if (!f) return;
    setFile(f);
    setBusy(true);
    try {
      setPreview(await previewImport(f));
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "No se pudo leer el archivo.");
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await commitImport(file));
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "No se pudo importar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout title="Importar promovidos" crumb="Ciudadanía">
      <PageHeader
        eyebrow="Ciudadanía"
        title="Importar"
        accent="promovidos"
        subtitle="Sube el Excel con la plantilla estándar de captura. Previsualiza y confirma; volver a subir el mismo archivo no duplica registros."
      />

      <div className="flex flex-col gap-5">
        {/* uploader */}
        <div className="card-premium reveal p-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line px-6 py-10 text-center transition hover:border-accent hover:bg-panel-hover">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-accent">
              <path d="M12 16V4m0 0 4 4m-4-4L8 8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
            </svg>
            <span className="text-sm font-medium text-ink">
              {file ? file.name : "Haz clic para elegir un archivo Excel"}
            </span>
            <span className="text-xs text-ink-faint">.xlsx o .xls · plantilla estándar</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
          </label>
          {busy && !result && <p className="mt-3 text-sm text-ink-muted">Procesando…</p>}
          {error && (
            <div className="mt-3 rounded-card bg-state-critical/10 px-3.5 py-2.5 text-sm text-state-critical">{error}</div>
          )}
        </div>

        {/* result */}
        {result && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard label="Leídas" value={String(result.leidas)} countTo={result.leidas} tone="teal" delay={0} />
              <MetricCard label="Importadas" value={String(result.importadas)} countTo={result.importadas} tone="warm" context="Nuevos promovidos" delay={80} />
              <MetricCard label="Duplicadas" value={String(result.duplicadas)} countTo={result.duplicadas} tone="accent" context="Ya existían (omitidas)" delay={160} />
            </div>
            <div className="card-premium reveal flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-ink-muted">
                ✓ Importación terminada. <span className="font-medium text-ink">{result.importadas}</span> registros nuevos.
              </p>
              <div className="flex gap-2">
                <button onClick={reset} className="btn-ghost focus-ring">Importar otro</button>
                <Link to="/promovidos" className="btn-primary focus-ring">Ver promovidos</Link>
              </div>
            </div>
          </div>
        )}

        {/* preview (only before commit) */}
        {preview && !result && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MetricCard label="Registros en el archivo" value={String(preview.leidas)} countTo={preview.leidas} tone="warm" context="Listos para importar" delay={0} />
              <div className="card-premium reveal flex flex-col justify-center gap-2 p-4">
                <button onClick={onImport} disabled={busy || preview.leidas === 0} className="btn-primary focus-ring h-11 disabled:opacity-40">
                  {busy ? "Importando…" : `Importar ${preview.leidas} registros`}
                </button>
                <p className="text-center text-xs text-ink-faint">Revisa la muestra antes de confirmar.</p>
              </div>
            </div>

            <div className="reveal">
              <SectionHeading eyebrow="Vista previa" title="Muestra" note={`primeros ${preview.muestra.length}`} />
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-faint">
                      <th className="py-2 pr-4">Nombre</th>
                      <th className="py-2 pr-4">Sección</th>
                      <th className="py-2 pr-4">Colonia</th>
                      <th className="py-2">Promotor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.muestra.map((m, i) => (
                      <tr key={i} className="border-b border-line/60">
                        <td className="py-2 pr-4 font-medium text-ink">{m.nombre_completo}</td>
                        <td className="py-2 pr-4 font-mono text-ink-muted">{m.seccion ?? "—"}</td>
                        <td className="py-2 pr-4 text-ink-muted">{m.colonia ?? "—"}</td>
                        <td className="py-2 text-ink-muted">{m.promotor ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
