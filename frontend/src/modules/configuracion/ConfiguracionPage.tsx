// frontend/src/modules/configuracion/ConfiguracionPage.tsx
// Configuración / Integraciones — honest data-sources status board + export hub.
// We do NOT store secrets in the browser: token-gated sources only document the
// server-side env var (Railway) that activates them.
import { useMemo, useState, type ReactNode } from "react";

import { getAreas } from "@/api/maps";
import { getIeemDataset } from "@/api/intel";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { DatabaseIcon, LayersIcon, SettingsIcon } from "@/components/ui/icons";
import {
  INTEGRATIONS,
  STATUS_META,
  STATUS_ORDER,
  type IntegrationSource,
  type IntegrationStatus,
} from "./sources";

// ── Client-side download helpers ─────────────────────────────────────────────
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Serialize an array of flat string-record rows to RFC-4180-ish CSV. */
function rowsToCsv(columns: string[], rows: Record<string, string>[]): string {
  const escape = (v: string): string => {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const header = columns.map(escape).join(",");
  const body = rows
    .map((row) => columns.map((c) => escape(row[c] ?? "")).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

type ExportState = {
  loading: boolean;
  message: string | null;
  tone: "ok" | "error" | null;
};

const IDLE: ExportState = { loading: false, message: null, tone: null };

// ── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: IntegrationStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`pill border-line ${meta.tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

// ── Integration row ──────────────────────────────────────────────────────────
function IntegrationRow({ source }: { source: IntegrationSource }) {
  return (
    <div className="card-premium hud-corners p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold tracking-tight text-ink">
              {source.name}
            </span>
            <span className="pill border-line font-mono text-[10px] text-ink-faint">
              {source.format}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            {source.powers}
          </p>
        </div>
        <StatusPill status={source.status} />
      </div>

      {(source.envVar || source.howTo) && (
        <div className="mt-3 border-t border-line pt-3">
          {source.envVar && (
            <div className="mb-2 flex items-center gap-2">
              <span className="eyebrow">Variable</span>
              <code className="rounded border border-line bg-bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-accent">
                {source.envVar}
              </code>
              <span className="text-[10px] text-ink-faint">Railway · servidor</span>
            </div>
          )}
          {source.howTo && (
            <p className="text-[11px] leading-relaxed text-ink-faint">
              <span className="font-semibold text-ink-muted">Cómo activar: </span>
              {source.howTo}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Export action card ───────────────────────────────────────────────────────
function ExportAction({
  title,
  description,
  buttonLabel,
  icon,
  state,
  onRun,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  icon: ReactNode;
  state: ExportState;
  onRun: () => void;
}) {
  return (
    <Card className="card-premium hud-corners h-full" accentDot title={title}>
      <div className="flex h-full flex-col">
        <p className="text-xs leading-relaxed text-ink-muted">{description}</p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            className="btn-ghost gap-2"
            onClick={onRun}
            disabled={state.loading}
          >
            <span className="text-accent">{icon}</span>
            {state.loading ? "Generando…" : buttonLabel}
          </button>
          {state.message && (
            <span
              className={`text-[11px] ${
                state.tone === "error"
                  ? "text-state-critical"
                  : "text-state-ok"
              }`}
            >
              {state.message}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

export function ConfiguracionPage() {
  const [geoState, setGeoState] = useState<ExportState>(IDLE);
  const [ieemState, setIeemState] = useState<ExportState>(IDLE);

  const counts = useMemo(() => {
    const c: Record<IntegrationStatus, number> = {
      activa: 0,
      preview: 0,
      bloqueada: 0,
    };
    for (const s of INTEGRATIONS) c[s.status] += 1;
    return c;
  }, []);

  const grouped = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        items: INTEGRATIONS.filter((s) => s.status === status),
      })),
    [],
  );

  async function exportAreas(): Promise<void> {
    setGeoState({ loading: true, message: null, tone: null });
    try {
      const fc = await getAreas("state");
      const count = fc.features.length;
      triggerDownload(
        new Blob([JSON.stringify(fc, null, 2)], {
          type: "application/geo+json",
        }),
        "estados.geojson",
      );
      setGeoState({
        loading: false,
        tone: "ok",
        message: `Descargado · ${count} estados`,
      });
    } catch (e: unknown) {
      setGeoState({
        loading: false,
        tone: "error",
        message: e instanceof Error ? e.message : "No se pudo exportar",
      });
    }
  }

  async function exportIeem(): Promise<void> {
    setIeemState({ loading: true, message: null, tone: null });
    try {
      const ds = await getIeemDataset("municipios");
      const csv = rowsToCsv(ds.columns, ds.rows);
      triggerDownload(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
        "ieem_municipios.csv",
      );
      setIeemState({
        loading: false,
        tone: "ok",
        message: `Descargado · ${ds.rows.length} filas`,
      });
    } catch (e: unknown) {
      setIeemState({
        loading: false,
        tone: "error",
        message: e instanceof Error ? e.message : "No se pudo exportar",
      });
    }
  }

  return (
    <AppLayout title="Configuración" crumb="Plataforma · Integraciones">
      <PageHeader
        eyebrow="Plataforma"
        title="Configuración"
        accent="& Integraciones"
        subtitle="Estado de las fuentes de datos y descargas."
      />

      {/* Status summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Fuentes activas"
          value={String(counts.activa)}
          tone="teal"
          icon={<DatabaseIcon width={18} height={18} />}
          delay={0}
        />
        <MetricCard
          label="En preview"
          value={String(counts.preview)}
          tone="warning"
          icon={<LayersIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Bloqueadas"
          value={String(counts.bloqueada)}
          tone="critical"
          icon={<SettingsIcon width={18} height={18} />}
          delay={160}
        />
      </div>

      {/* Integraciones status board */}
      <section className="mt-8">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-gradient shadow-glow" />
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            Integraciones
          </h2>
          <span className="pill border-line text-ink-faint">
            {INTEGRATIONS.length} fuentes
          </span>
        </div>
        <p className="mb-4 max-w-2xl text-xs leading-relaxed text-ink-faint">
          Tablero honesto del estado real de cada fuente. Los tokens se
          configuran como variables de entorno en el servidor (Railway); el
          navegador nunca almacena secretos.
        </p>

        <div className="flex flex-col gap-6">
          {grouped.map(({ status, items }) => (
            <div key={status}>
              <div className="eyebrow mb-2 flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${STATUS_META[status].dot}`}
                  aria-hidden="true"
                />
                {STATUS_META[status].label} · {items.length}
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {items.map((source) => (
                  <div
                    key={source.key}
                    className="reveal"
                    style={{ animationDelay: "60ms" }}
                  >
                    <IntegrationRow source={source} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Export hub */}
      <section className="mt-8">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-gradient shadow-glow" />
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            Exportaciones
          </h2>
        </div>
        <p className="mb-4 max-w-2xl text-xs leading-relaxed text-ink-faint">
          Descargas generadas en el navegador a partir de datos reales de la
          plataforma. No salen del cliente hacia terceros.
        </p>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ExportAction
            title="Geometría de estados (GeoJSON)"
            description="Exporta los polígonos de los estados (nivel 'state') tal como los sirve el backend de mapas, en formato GeoJSON estándar."
            buttonLabel="Descargar estados.geojson"
            icon={<LayersIcon width={16} height={16} />}
            state={geoState}
            onRun={() => void exportAreas()}
          />
          <ExportAction
            title="IEEM · municipios (CSV)"
            description="Exporta el dataset de municipios de la numeralia IEEM (Estado de México) serializado a CSV listo para hoja de cálculo."
            buttonLabel="Descargar ieem_municipios.csv"
            icon={<DatabaseIcon width={16} height={16} />}
            state={ieemState}
            onRun={() => void exportIeem()}
          />
        </div>
      </section>
    </AppLayout>
  );
}
