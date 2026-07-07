// frontend/src/modules/reportes/ReportesPage.tsx
import { useMemo, type ReactNode } from "react";

import { getOverview } from "@/api/analytics";
import { getAreas } from "@/api/maps";
import { AreaTrend } from "@/components/charts/AreaTrend";
import { Bars } from "@/components/charts/Bars";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import {
  AnalyticsIcon,
  DatabaseIcon,
  LayersIcon,
  UserIcon,
  VotersIcon,
} from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import type { AnalyticsOverview } from "@/types/analytics";

import { downloadCSV } from "./export";

const intFmt = new Intl.NumberFormat("es-MX");

/** Display-only capitalization for level labels (e.g. "municipio" → "Municipio"). */
function cap(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Localized, human-readable timestamp for the briefing provenance line. */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(d);
}

const ALERT_TONE: Record<string, string> = {
  info: "border-accent/40 text-accent",
  warning: "border-state-warning/40 text-state-warning",
  critical: "border-state-critical/40 text-state-critical",
};

export function ReportesPage() {
  // Primary briefing payload (real platform analytics).
  const overviewState = useAsync(() => getOverview(), []);
  // Secondary, light call: real state-level cartography count.
  const statesState = useAsync(() => getAreas("state"), []);

  const overview = overviewState.data;
  const stateCount = useMemo<number | null>(() => {
    if (!statesState.data) return null;
    return statesState.data.features.length;
  }, [statesState.data]);

  const isEmpty =
    !overviewState.loading &&
    !overviewState.error &&
    overview === null;

  const handleCSV = () => {
    if (overview) downloadCSV(overview, stateCount);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <AppLayout title="Reportes Ejecutivos" crumb="Gobernanza">
      <PageHeader
        eyebrow="Gobernanza"
        title="Reportes"
        accent="Ejecutivos"
        subtitle="Briefing institucional compuesto de datos reales de la plataforma."
        actions={
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <button
              type="button"
              onClick={handleCSV}
              disabled={!overview}
              className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
            >
              <DatabaseIcon width={16} height={16} />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!overview}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <AnalyticsIcon width={16} height={16} />
              Imprimir / PDF
            </button>
          </div>
        }
      />

      <DataState
        loading={overviewState.loading}
        error={overviewState.error}
        isEmpty={isEmpty}
        onRetry={overviewState.reload}
        emptyMessage="Sin datos de plataforma todavía — analítica pendiente."
        skeleton={
          <div className="space-y-4">
            {/* P-2: SkeletonCard replaces raw animate-pulse divs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} lines={2} />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
              <SkeletonCard lines={5} />
              <SkeletonCard lines={1} className="min-h-[340px]" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SkeletonCard lines={4} />
              <SkeletonCard lines={4} />
            </div>
          </div>
        }
      >
        {overview && <Briefing overview={overview} stateCount={stateCount} />}
      </DataState>
    </AppLayout>
  );
}

interface BriefingProps {
  overview: AnalyticsOverview;
  stateCount: number | null;
}

/**
 * The printable briefing region. The `print:` utilities flip this block to a
 * clean white/black document and hide chrome so the PDF/print output reads as
 * an institutional report. Only real values are shown; all are labelled with
 * their source and generation timestamp.
 */
function Briefing({ overview, stateCount }: BriefingProps) {
  // P-8: reveal wraps the primary content block for entrance animation
  return (
    <div className="reveal space-y-6 print:space-y-3 print:bg-white print:p-0 print:text-black">
      {/* Print-only header (hidden on screen — screen uses PageHeader). */}
      <div className="hidden print:mb-4 print:block print:border-b print:border-black/20 print:pb-3">
        <h1 className="text-2xl font-bold">Atenea · Reporte Ejecutivo</h1>
        <p className="text-sm">
          Briefing institucional compuesto de datos reales de la plataforma.
        </p>
        <p className="mt-1 text-xs">
          Datos generados: {formatTimestamp(overview.generated_at)}
        </p>
      </div>

      {/* KPI summary */}
      <div className="space-y-4 print:space-y-2">
        <SectionHeading eyebrow="Panorama" title="Indicadores clave" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
          <KpiCard
            label="Áreas electorales"
            value={overview.summary.electoral_areas}
            icon={<LayersIcon />}
            tone="accent"
            delay={60}
          />
          <KpiCard
            label="Organizaciones"
            value={overview.summary.organizations}
            icon={<UserIcon />}
            tone="teal"
            delay={120}
          />
          {/* Warm/coral is the featured KPI accent — never tied to a semantic
              meaning, so it no longer borrows the "warning" tone here. */}
          <KpiCard
            label="Usuarios"
            value={overview.summary.users}
            icon={<VotersIcon />}
            tone="warm"
            delay={180}
          />
          <KpiCard
            label="Fuentes de datos"
            value={overview.summary.data_sources}
            icon={<DatabaseIcon />}
            tone="accent"
            delay={240}
          />
        </div>
      </div>

      {/* Coverage by level + activity trend */}
      <div className="space-y-4 print:space-y-2">
        <SectionHeading eyebrow="Detalle" title="Cobertura y tendencia" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr] print:grid-cols-2 print:gap-3">
          <ChartFrame
            title="Cobertura por nivel"
            caption={
              stateCount !== null
                ? `${intFmt.format(stateCount)} entidades cartografiadas`
                : undefined
            }
            empty={overview.coverage.length === 0}
          >
            <Bars
              items={overview.coverage.map((c) => ({
                label: cap(c.level),
                value: c.count,
              }))}
            />
            <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
              Fuente: cobertura territorial registrada en la plataforma.
            </p>
          </ChartFrame>

          <ChartFrame
            title="Tendencia de actividad"
            caption="Eventos por periodo"
            empty={overview.trends.activity.length === 0}
          >
            <AreaTrend
              points={overview.trends.activity.map((p) => ({
                x: p.period,
                y: p.value,
              }))}
            />
          </ChartFrame>
        </div>
      </div>

      {/* Top actions + top actors */}
      <div className="space-y-4 print:space-y-2">
        <SectionHeading
          eyebrow="Detalle"
          title="Acciones y actores"
          note={`Top ${overview.by_action.length} · Top ${overview.by_actor.length}`}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-2 print:gap-3">
          <ChartFrame
            title="Acciones principales"
            empty={overview.by_action.length === 0}
          >
            <Bars
              items={overview.by_action.map((a) => ({
                label: a.action,
                value: a.count,
              }))}
              highlightFirst
            />
          </ChartFrame>

          <ChartFrame
            title="Actores principales"
            empty={overview.by_actor.length === 0}
          >
            <Bars
              items={overview.by_actor.map((a) => ({
                label: a.actor_id,
                value: a.count,
              }))}
              highlightFirst
            />
          </ChartFrame>
        </div>
      </div>

      {/* Alerts (only if present) */}
      {overview.alerts.length > 0 && (
        <Card
          title="Alertas"
          accentDot
          className="reveal print:border print:border-black/20 print:bg-white print:text-black"
        >
          <ul className="space-y-2">
            {overview.alerts.map((a, i) => (
              <li
                key={`${a.title}-${i}`}
                className={`rounded-card border px-3 py-2 text-sm ${
                  ALERT_TONE[a.level] ?? "border-line text-ink-muted"
                } print:border-black/30 print:text-black`}
              >
                <span className="font-semibold">{a.title}</span>
                <span className="ml-2 text-ink-muted print:text-black/70">
                  {a.detail}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Provenance footer */}
      <div className="card-premium hud-corners reveal flex flex-col gap-2 px-5 py-4 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between print:border print:border-black/20 print:bg-white print:text-black/70">
        <span>
          Datos generados:{" "}
          <span className="font-mono text-ink-muted print:text-black">
            {formatTimestamp(overview.generated_at)}
          </span>
        </span>
        <span className="font-mono uppercase tracking-wide">
          Generado por Atenea
        </span>
      </div>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: number;
  icon: ReactNode;
  tone: "accent" | "teal" | "warm";
  delay: number;
}

function KpiCard({ label, value, icon, tone, delay }: KpiCardProps) {
  return (
    <MetricCard
      label={label}
      value={intFmt.format(value)}
      countTo={value}
      format={(n) => intFmt.format(Math.round(n))}
      icon={icon}
      tone={tone}
      delay={delay}
    />
  );
}
