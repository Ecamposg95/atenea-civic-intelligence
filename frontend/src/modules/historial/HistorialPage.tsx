import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  listIngestDatasets,
  listIngestRuns,
  uploadIngest,
  type IngestRun,
  type IngestStatus,
} from "@/api/ingest";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { MetricCard } from "@/components/ui/MetricCard";
import { Modal } from "@/components/ui/Modal";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { DatabaseIcon, LayersIcon, ShieldIcon } from "@/components/ui/icons";
import { TONE_BADGE, type Tone } from "@/constants/ui";
import { useAsync } from "@/hooks/useAsync";
import { useAuthStore } from "@/store/authStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusTone(status: IngestStatus): Tone {
  switch (status) {
    case "success":
      return "ok";
    case "partial":
      return "warning";
    case "failed":
      return "critical";
    case "running":
      return "info";
  }
}

function statusLabel(status: IngestStatus): string {
  switch (status) {
    case "success":
      return "Exitoso";
    case "partial":
      return "Parcial";
    case "failed":
      return "Fallido";
    case "running":
      return "En curso";
  }
}

function rowsSummary(run: IngestRun): string {
  const ins = run.rows_inserted ?? 0;
  const skip = run.rows_skipped ?? 0;
  return `${ins}✓ / ${skip}⊘`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

// ─── Table columns ────────────────────────────────────────────────────────────

const HISTORIAL_COLUMNS: Column<IngestRun>[] = [
  {
    key: "dataset",
    header: "Dataset",
    sortValue: (r) => r.dataset,
    render: (r) => (
      <span className="font-mono text-xs font-semibold text-accent">
        {r.dataset}
      </span>
    ),
  },
  {
    key: "file_name",
    header: "Archivo",
    render: (r) => (
      <span className="font-mono text-xs text-ink-muted">{r.file_name}</span>
    ),
    hideOnCard: true,
  },
  {
    key: "status",
    header: "Estado",
    sortValue: (r) => r.status,
    render: (r) => {
      const tone = statusTone(r.status);
      return (
        <span className={`pill font-mono ${TONE_BADGE[tone]}`}>
          {statusLabel(r.status)}
        </span>
      );
    },
  },
  {
    key: "rows",
    header: "Filas",
    render: (r) => (
      <span className="font-mono text-xs tabular-nums text-ink-muted">
        {rowsSummary(r)}
      </span>
    ),
    hideOnCard: true,
  },
  {
    key: "started_at",
    header: "Inicio",
    sortValue: (r) => r.started_at,
    render: (r) => (
      <span className="font-mono text-xs tabular-nums text-ink-muted">
        {fmtDate(r.started_at)}
      </span>
    ),
  },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export function HistorialPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin =
    user?.role === "superadmin" || user?.role === "admin";

  const runs = useAsync(listIngestRuns, []);
  const items = runs.data ?? [];

  const [selected, setSelected] = useState<IngestRun | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const lastIngestLabel = useMemo(() => {
    const sorted = [...items].sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    );
    return sorted[0] ? fmtDate(sorted[0].started_at) : "—";
  }, [items]);

  return (
    <AppLayout title="Historial de ingestas" crumb="Gobernanza">
      <PageHeader
        eyebrow="Gobernanza de datos"
        title="Historial de"
        accent="ingestas"
        subtitle="Trazabilidad de las cargas de datos del pipeline SP0b-1."
        actions={
          isAdmin ? (
            <button
              type="button"
              className="btn-primary shadow-glow-accent"
              onClick={() => setUploadOpen(true)}
            >
              + Subir archivo
            </button>
          ) : undefined
        }
      />

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Ingestas registradas"
          value={runs.loading ? "—" : String(items.length)}
          countTo={!runs.loading && runs.data ? items.length : undefined}
          tone="accent"
          icon={<DatabaseIcon width={18} height={18} />}
          delay={0}
        />
        <MetricCard
          label="Última ingesta"
          value={runs.loading ? "—" : lastIngestLabel}
          tone="teal"
          icon={<LayersIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Trazabilidad"
          value="Inmutable"
          tone="accent"
          icon={<ShieldIcon width={18} height={18} />}
          delay={160}
        />
      </div>

      {/* Table */}
      <div className="reveal mt-5" style={{ animationDelay: "220ms" }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
            <span
              className="h-1.5 w-1.5 rounded-full bg-accent-gradient shadow-glow"
              aria-hidden="true"
            />
            Línea de tiempo · ingestas SP0b-1
          </span>
          <span
            className={`font-mono text-xs text-ink-muted transition-opacity${runs.loading ? " opacity-40" : ""}`}
          >
            {!runs.loading && items.length > 0
              ? `${items.length} ingestas`
              : ""}
          </span>
        </div>

        <DataState
          loading={runs.loading}
          error={runs.error}
          isEmpty={!runs.loading && !runs.error && items.length === 0}
          emptyMessage="Sin ingestas todavía."
          onRetry={runs.reload}
          skeleton={
            <div className="card-premium p-4">
              <SkeletonRows rows={6} />
            </div>
          }
        >
          <DataTable
            columns={HISTORIAL_COLUMNS}
            rows={items}
            rowKey={(r) => r.id}
            pageSize={50}
            emptyMessage="Sin ingestas registradas."
            onRowClick={(r) => setSelected(r)}
            defaultSortKey="started_at"
            defaultSortDir="desc"
          />
        </DataState>
      </div>

      {/* Detail drawer */}
      <IngestDetailDrawer
        run={selected}
        onClose={() => setSelected(null)}
      />

      {/* Upload modal */}
      {isAdmin && (
        <UploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onSuccess={() => {
            setUploadOpen(false);
            runs.reload();
          }}
        />
      )}
    </AppLayout>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

interface IngestDetailDrawerProps {
  run: IngestRun | null;
  onClose: () => void;
}

function IngestDetailDrawer({ run, onClose }: IngestDetailDrawerProps) {
  useEffect(() => {
    if (!run) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [run, onClose]);

  if (!run) return null;

  const tone = statusTone(run.status);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de ingesta"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto bg-bg-raised shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              Ingesta · {run.dataset}
            </p>
            <h2 className="mt-0.5 font-display text-lg font-semibold text-ink">
              {run.file_name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="focus-ring rounded-md p-1.5 text-ink-faint transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 px-6 py-5">
          <section aria-label="Estado y conteos">
            <dl className="space-y-3">
              <DetailField label="Estado">
                <span className={`pill font-mono ${TONE_BADGE[tone]}`}>
                  {statusLabel(run.status)}
                </span>
              </DetailField>
              <DetailField label="Dataset" value={run.dataset} mono />
              <DetailField label="Archivo" value={run.file_name} mono />
              <DetailField label="ID" value={run.id} mono />
            </dl>
          </section>

          <hr className="border-line" />

          <section aria-label="Conteos de filas">
            <h3 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              Conteos
            </h3>
            <dl className="space-y-3">
              <DetailField
                label="Leídas"
                value={run.rows_read != null ? String(run.rows_read) : "—"}
                mono
              />
              <DetailField
                label="Insertadas"
                value={
                  run.rows_inserted != null ? String(run.rows_inserted) : "—"
                }
                mono
              />
              <DetailField
                label="Omitidas"
                value={
                  run.rows_skipped != null ? String(run.rows_skipped) : "—"
                }
                mono
              />
              <DetailField
                label="Fallidas"
                value={
                  run.rows_failed != null ? String(run.rows_failed) : "—"
                }
                mono
              />
            </dl>
          </section>

          <hr className="border-line" />

          <section aria-label="Tiempos">
            <h3 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              Tiempos
            </h3>
            <dl className="space-y-3">
              <DetailField label="Inicio" value={fmtDate(run.started_at)} mono />
              <DetailField
                label="Fin"
                value={run.finished_at ? fmtDate(run.finished_at) : "En curso"}
                mono
              />
            </dl>
          </section>

          {run.error_summary && (
            <>
              <hr className="border-line" />
              <section aria-label="Resumen de errores">
                <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-state-critical">
                  Resumen de errores
                </h3>
                <pre className="max-h-64 overflow-auto rounded-lg border border-state-critical/20 bg-state-critical/5 p-3 font-mono text-[11px] leading-relaxed text-state-critical">
                  {run.error_summary}
                </pre>
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (run: IngestRun) => void;
}

interface UploadForm {
  dataset: string;
  file: File | null;
  anio: string;
}

const EMPTY_UPLOAD: UploadForm = { dataset: "", file: null, anio: "" };

function UploadModal({ open, onClose, onSuccess }: UploadModalProps) {
  const datasets = useAsync(listIngestDatasets, []);
  const available = datasets.data ?? [];

  const [form, setForm] = useState<UploadForm>(EMPTY_UPLOAD);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successRun, setSuccessRun] = useState<IngestRun | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setForm(EMPTY_UPLOAD);
      setModalError(null);
      setSuccessRun(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  // Auto-select first dataset once loaded
  useEffect(() => {
    if (available.length > 0 && !form.dataset) {
      setForm((f) => ({ ...f, dataset: available[0] }));
    }
  }, [available, form.dataset]);

  const isCensus = form.dataset === "census";

  async function handleSubmit() {
    if (!form.dataset) {
      setModalError("Selecciona un dataset.");
      return;
    }
    if (!form.file) {
      setModalError("Selecciona un archivo.");
      return;
    }
    if (isCensus && !form.anio) {
      setModalError("El campo Año es obligatorio para el dataset Census.");
      return;
    }

    setSubmitting(true);
    setModalError(null);
    try {
      const params: { anio?: number } = {};
      if (form.anio) params.anio = Number(form.anio);
      const run = await uploadIngest(form.dataset, form.file, params);
      setSuccessRun(run);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 413) {
        setModalError(
          "Archivo muy grande (límite 25 MB). Usa el CLI para ingestas grandes.",
        );
      } else if (status === 404) {
        setModalError("Dataset desconocido. Verifica el nombre e intenta de nuevo.");
      } else if (status === 422) {
        setModalError(
          e instanceof Error ? e.message : "Datos inválidos. Revisa el archivo.",
        );
      } else {
        setModalError(
          e instanceof Error ? e.message : "No se pudo subir el archivo.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (successRun) {
    const tone = statusTone(successRun.status);
    return (
      <Modal
        open={open}
        title="Ingesta iniciada"
        onClose={() => onSuccess(successRun)}
      >
        <div className="space-y-3 text-sm text-ink-muted">
          <p>
            El archivo{" "}
            <span className="font-mono text-ink">{successRun.file_name}</span>{" "}
            fue recibido correctamente.
          </p>
          <dl className="space-y-2 rounded-lg border border-line bg-bg-sunken p-3 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-ink-faint">Estado</span>
              <span className={`pill ${TONE_BADGE[tone]}`}>
                {statusLabel(successRun.status)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-faint">Insertadas</span>
              <span className="text-ink">
                {successRun.rows_inserted ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-faint">Omitidas</span>
              <span className="text-ink">
                {successRun.rows_skipped ?? "—"}
              </span>
            </div>
            {successRun.error_summary && (
              <div className="mt-1 text-state-critical">
                {successRun.error_summary}
              </div>
            )}
          </dl>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="btn-primary focus-ring"
            onClick={() => onSuccess(successRun)}
          >
            Cerrar
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title="Subir archivo de ingesta"
      onClose={() => {
        if (!submitting) onClose();
      }}
      footer={
        <>
          <button
            type="button"
            className="btn-ghost focus-ring"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary focus-ring"
            onClick={() => void handleSubmit()}
            disabled={submitting || !form.dataset || !form.file}
          >
            {submitting ? "Subiendo…" : "Subir"}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        {/* Dataset select */}
        <div>
          <label className="field-label" htmlFor="upload-dataset">
            Dataset
          </label>
          {datasets.loading ? (
            <div className="h-9 animate-pulse rounded-lg bg-panel-hover" />
          ) : (
            <select
              id="upload-dataset"
              className="field-input focus-ring"
              value={form.dataset}
              onChange={(e) =>
                setForm((f) => ({ ...f, dataset: e.target.value }))
              }
            >
              {available.length === 0 && (
                <option value="">Sin datasets disponibles</option>
              )}
              {available.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* File input */}
        <div>
          <label className="field-label" htmlFor="upload-file">
            Archivo
          </label>
          <input
            ref={fileRef}
            id="upload-file"
            type="file"
            className="field-input focus-ring cursor-pointer"
            onChange={(e) =>
              setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))
            }
          />
          <p className="mt-1.5 text-[11px] text-ink-faint">
            Máximo 25 MB. Para archivos más grandes usa el CLI.
          </p>
        </div>

        {/* Año (census only) */}
        {isCensus && (
          <div>
            <label className="field-label" htmlFor="upload-anio">
              Año
            </label>
            <input
              id="upload-anio"
              type="number"
              className="field-input focus-ring"
              placeholder="2020"
              value={form.anio}
              onChange={(e) =>
                setForm((f) => ({ ...f, anio: e.target.value }))
              }
            />
          </div>
        )}

        {modalError && (
          <p className="text-xs text-state-critical" role="alert">
            {modalError}
          </p>
        )}

        <button type="submit" className="hidden" aria-hidden="true" />
      </form>
    </Modal>
  );
}

// ─── Detail field helper ──────────────────────────────────────────────────────

function DetailField({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
        {label}
      </dt>
      <dd
        className={`min-w-0 break-all text-sm text-ink-muted${mono ? " font-mono text-xs" : ""}`}
      >
        {children ?? value}
      </dd>
    </div>
  );
}
