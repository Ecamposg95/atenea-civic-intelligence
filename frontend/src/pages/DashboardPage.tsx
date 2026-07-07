import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getOverview } from "@/api/analytics";
import { getAreas } from "@/api/maps";
import { getSources } from "@/api/sources";
import { useThemeStore } from "@/store/themeStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { CountdownElectoral } from "@/components/CountdownElectoral";
import { Heatmap } from "@/components/charts/Heatmap";
import { RadialGauge } from "@/components/charts/RadialGauge";
import { AreaTrend } from "@/components/charts/AreaTrend";
import { Bars } from "@/components/charts/Bars";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { MapCanvas } from "@/components/maps/MapCanvas";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Sparkline } from "@/components/ui/Sparkline";
import { StatusPill } from "@/components/ui/StatusPill";
import { useAsync } from "@/hooks/useAsync";
import { PANEL_HEIGHTS } from "@/constants/ui";
import {
  AlertIcon,
  DatabaseIcon,
  LayersIcon,
  MapIcon,
  ShieldIcon,
  UserIcon,
} from "@/components/ui/icons";
import type { AnalyticsAlert, AnalyticsOverview } from "@/types/analytics";
import type { AreasResponse } from "@/types/maps";
import type { SourceInfo } from "@/types/sources";

const nf = new Intl.NumberFormat("en-US");

/** Tone-driven presentation for alert rows (left border + icon color). */
const ALERT_TONE: Record<
  AnalyticsAlert["level"],
  { border: string; icon: string; pill: string }
> = {
  info: {
    border: "border-l-accent",
    icon: "text-accent",
    pill: "border-accent/30 bg-accent/10 text-accent",
  },
  warning: {
    border: "border-l-state-warning",
    icon: "text-state-warning",
    pill: "border-state-warning/30 bg-state-warning/10 text-state-warning",
  },
  critical: {
    border: "border-l-state-critical",
    icon: "text-state-critical",
    pill: "border-state-critical/30 bg-state-critical/10 text-state-critical",
  },
};

/** Alert level -> StatusPill semantic kind (dot + label, never color-only). */
const ALERT_KIND: Record<AnalyticsAlert["level"], "ok" | "warn" | "crit"> = {
  info: "ok",
  warning: "warn",
  critical: "crit",
};

const KIND_BADGE: Record<string, string> = {
  api: "border-accent/30 bg-accent/10 text-accent",
  wms: "border-teal/30 bg-teal/10 text-teal",
  download: "border-state-warning/30 bg-state-warning/10 text-state-warning",
  portal: "border-line text-ink-muted",
};

/** Compact Spanish relative time from an ISO timestamp. */
function relativeTime(iso: string | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "hace unos segundos";
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  return `hace ${days} d`;
}

export function DashboardPage() {
  const theme = useThemeStore((s) => s.theme);
  const {
    data,
    loading: overviewLoading,
    error: overviewError,
    reload: reloadOverview,
  } = useAsync<AnalyticsOverview>(() => getOverview(), []);
  const [areas, setAreas] = useState<AreasResponse | null>(null);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [fitKey, setFitKey] = useState(0);

  useEffect(() => {
    // State level only — light payload for the mini-map/coverage (municipality
    // level is ~1854 features / ~29MB and is loaded on demand in Map Explorer).
    getAreas("state")
      .then((fc) => {
        setAreas(fc);
        if (fc.features.length > 0) setFitKey((k) => k + 1);
      })
      .catch(() => setAreas({ type: "FeatureCollection", features: [] }));
    getSources()
      .then(setSources)
      .catch(() => setSources([]));
  }, []);

  const s = data?.summary;
  const activity = data?.trends.activity ?? [];
  const activitySeries = useMemo(() => activity.map((p) => p.value), [activity]);

  // Real audit-activity figures (no fabricated values).
  const totalEvents = useMemo(
    () => activity.reduce((acc, p) => acc + p.value, 0),
    [activity],
  );
  const peakEvents = useMemo(
    () => activity.reduce((m, p) => Math.max(m, p.value), 0),
    [activity],
  );
  // Today's events relative to the busiest day in the 14d window.
  const todayEvents = activity.length > 0 ? activity[activity.length - 1].value : 0;
  const activityRatio = peakEvents > 0 ? todayEvents / peakEvents : 0;
  const distinctActions = data?.by_action.length ?? 0;
  const heatData = useMemo(
    () => activity.map((p) => ({ label: p.period, value: p.value })),
    [activity],
  );
  // AreaTrend's {x,y} point shape — same activity series, no new data.
  const areaTrendPoints = useMemo(
    () => activity.map((p) => ({ x: p.period, y: p.value })),
    [activity],
  );

  const coverage: { level: string; count: number }[] = useMemo(() => {
    if (!areas) return [];
    const counts = new Map<string, number>();
    for (const f of areas.features) {
      const level = f.properties?.level ?? "desconocido";
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([level, count]) => ({ level, count }))
      .sort((a, b) => b.count - a.count);
  }, [areas]);

  const hasAreas = !!areas && areas.features.length > 0;

  return (
    <AppLayout title="Centro de Mando" crumb="Civic Intelligence Overview">
      {/* ---- Hero ---- */}
      <PageHeader
        eyebrow="Executive briefing"
        title="Centro de Mando"
        accent="Civic Intelligence"
        subtitle="Vista institucional en tiempo real de cobertura electoral, participación y gobernanza de datos territoriales."
        actions={
          <>
            <CountdownElectoral date={data?.election_date ?? null} />
            {activitySeries.length > 0 && (
              <div className="card-premium px-4 py-3">
                <div className="eyebrow mb-1.5">Actividad 14d</div>
                <Sparkline
                  data={activitySeries}
                  width={150}
                  height={40}
                  className="w-[150px]"
                />
              </div>
            )}
            <Button variant="primary" className="shadow-glow-accent">
              Exportar briefing
            </Button>
          </>
        }
      >
        {/* Live status chips */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="pill border-line-strong font-mono uppercase tracking-wider text-ink-muted">
            Producción
          </span>
          <span className="pill border-teal/30 bg-teal/10 text-teal">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-glow rounded-full bg-teal" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
            </span>
            Sistemas operativos
          </span>
          <span className="pill border-line text-ink-muted">
            Actualizado {relativeTime(data?.generated_at)}
          </span>
        </div>
      </PageHeader>

      {/* ---- KPI row (animated counters, real values, no fabricated trends) ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Áreas electorales"
          value={s ? nf.format(s.electoral_areas) : "—"}
          countTo={s ? s.electoral_areas : undefined}
          tone="accent"
          icon={<LayersIcon width={18} height={18} />}
          delay={0}
        />
        <MetricCard
          label="Instituciones"
          value={s ? nf.format(s.organizations) : "—"}
          countTo={s ? s.organizations : undefined}
          tone="teal"
          icon={<ShieldIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Usuarios activos"
          value={s ? nf.format(s.users) : "—"}
          countTo={s ? s.users : undefined}
          tone="warm"
          context={
            data
              ? `${nf.format(data.by_actor.length)} activos en el audit log (14d)`
              : undefined
          }
          icon={<UserIcon width={18} height={18} />}
          delay={160}
        />
        <MetricCard
          label="Fuentes de datos"
          value={s ? nf.format(s.data_sources) : "—"}
          countTo={s ? s.data_sources : undefined}
          tone="teal"
          icon={<DatabaseIcon width={18} height={18} />}
          delay={240}
        />
      </div>

      {/* ---- Real audit pulse: gauge + extra KPIs + activity heatmap ---- */}
      <div className="reveal mt-8">
        <SectionHeading eyebrow="Tiempo real" title="Pulso operativo" note="Últimos 14 días" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
          <ChartFrame title="Actividad hoy" caption="vs. pico de los últimos 14 días">
            <DataState
              loading={overviewLoading}
              error={overviewError}
              onRetry={reloadOverview}
              skeleton={
                <div className="h-[150px] animate-pulse rounded-lg bg-panel-hover" />
              }
            >
              {data && (
                <div className="space-y-4">
                  <div className="flex items-center gap-5">
                    <RadialGauge value={activityRatio} label="vs. pico 14d" />
                    <div className="space-y-1.5">
                      <div className="eyebrow">Eventos hoy</div>
                      <div className="font-display text-2xl font-bold tabular-nums text-ink">
                        {nf.format(todayEvents)}
                      </div>
                      <div className="text-xs text-ink-faint">
                        Pico diario: {nf.format(peakEvents)}
                      </div>
                    </div>
                  </div>
                  {activitySeries.length > 0 && (
                    <Sparkline data={activitySeries} width={280} height={36} className="w-full" />
                  )}
                </div>
              )}
            </DataState>
          </ChartFrame>
        </div>

        <div className="reveal lg:col-span-2" style={{ animationDelay: "180ms" }}>
          <ChartFrame title="Resumen del audit trail" caption="Últimos 14 días">
            <DataState
              loading={overviewLoading}
              error={overviewError}
              onRetry={reloadOverview}
              skeleton={
                <div className="h-[150px] animate-pulse rounded-lg bg-panel-hover" />
              }
            >
              {data && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-line bg-bg-sunken px-3 py-3">
                      <div className="eyebrow mb-1">Eventos 14d</div>
                      <div className="font-display text-2xl font-bold tabular-nums text-accent">
                        {nf.format(totalEvents)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-line bg-bg-sunken px-3 py-3">
                      <div className="eyebrow mb-1">Tipos de acción</div>
                      <div className="font-display text-2xl font-bold tabular-nums text-teal">
                        {nf.format(distinctActions)}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="eyebrow mb-2">Actividad diaria</div>
                    {heatData.length > 0 ? (
                      <Heatmap data={heatData} columns={7} />
                    ) : (
                      <p className="text-sm text-ink-faint">
                        Sin actividad en la ventana.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </DataState>
          </ChartFrame>
        </div>
      </div>

      {/* ---- Activity chart + governance ---- */}
      <div className="reveal mt-8" style={{ animationDelay: "40ms" }}>
        <SectionHeading eyebrow="Auditoría" title="Actividad y gobernanza" note="Audit log · 14 días" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="reveal lg:col-span-2" style={{ animationDelay: "120ms" }}>
          <ChartFrame title="Actividad de la plataforma" caption="Audit log · últimos 14 días">
            <DataState
              loading={overviewLoading}
              error={overviewError}
              onRetry={reloadOverview}
              skeleton={
                <div className="h-[260px] animate-pulse rounded-lg bg-panel-hover" />
              }
            >
              {data && <AreaTrend points={areaTrendPoints} />}
            </DataState>
          </ChartFrame>
        </div>

        <div className="reveal" style={{ animationDelay: "200ms" }}>
          <Card title="Gobernanza y alertas" accentDot className="h-full">
            <DataState
              loading={overviewLoading}
              error={overviewError}
              onRetry={reloadOverview}
              skeleton={
                <div className="h-[180px] animate-pulse rounded-lg bg-panel-hover" />
              }
            >
            <div className="space-y-2.5">
              {data?.alerts.map((a, i) => {
                const tone = ALERT_TONE[a.level];
                return (
                  <div
                    key={i}
                    className={`reveal flex items-start justify-between gap-3 rounded-lg border border-l-2 border-line ${tone.border} bg-bg-sunken px-3 py-2.5 transition-colors hover:bg-panel-hover`}
                    style={{ animationDelay: `${260 + i * 70}ms` }}
                  >
                    <div className="flex items-start gap-2.5">
                      {a.level === "critical" || a.level === "warning" ? (
                        <AlertIcon
                          width={16}
                          height={16}
                          className={`mt-0.5 shrink-0 ${tone.icon}`}
                        />
                      ) : (
                        <ShieldIcon
                          width={16}
                          height={16}
                          className={`mt-0.5 shrink-0 ${tone.icon}`}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm text-ink">{a.title}</div>
                        <div className="text-xs text-ink-faint">{a.detail}</div>
                      </div>
                    </div>
                    <StatusPill kind={ALERT_KIND[a.level]}>{a.level}</StatusPill>
                  </div>
                );
              })}
              {data && data.alerts.length === 0 && (
                <div className="flex items-center gap-2.5 rounded-lg border border-l-2 border-line border-l-teal bg-bg-sunken px-3 py-2.5">
                  <ShieldIcon width={16} height={16} className="text-teal" />
                  <p className="text-sm text-ink-muted">Sin alertas activas.</p>
                </div>
              )}
            </div>
            </DataState>
          </Card>
        </div>
      </div>

      {/* ---- Territorial coverage (mini-map) + data sources ---- */}
      <div className="reveal mt-8" style={{ animationDelay: "40ms" }}>
        <SectionHeading eyebrow="Territorio" title="Cobertura y fuentes" note="Cartografía y catálogo de datos" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="reveal" style={{ animationDelay: "160ms" }}>
          <Card
            title="Cobertura territorial"
            accentDot
            className="h-full"
            action={
              <Link
                to="/maps"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent-strong"
              >
                <MapIcon width={14} height={14} /> Ver mapa
              </Link>
            }
          >
            {!areas ? (
              <div className={`${PANEL_HEIGHTS.mapMini} animate-pulse rounded-lg bg-panel-hover`} />
            ) : hasAreas ? (
              <div className="space-y-4">
                <div className={`relative ${PANEL_HEIGHTS.mapMini} overflow-hidden rounded-card`}>
                  <MapCanvas
                    key={theme}
                    areas={areas}
                    showAreas
                    choropleth
                    basemap="dark"
                    fitKey={fitKey}
                    onSelect={() => {}}
                  />
                  {/* Soften interaction cues to keep it a non-interactive briefing view */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-bg/80 to-transparent" />
                </div>
                {coverage.length > 0 && (
                  <Bars
                    items={coverage.map((c) => ({ label: c.level, value: c.count }))}
                    highlightFirst
                  />
                )}
              </div>
            ) : (
              <div className={`grid ${PANEL_HEIGHTS.mapMini} place-items-center text-center text-sm text-ink-faint`}>
                <div>
                  Sin cartografía cargada todavía.
                  <br />
                  Ingesta el Marco Geográfico Electoral del INE para poblar este panel.
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "240ms" }}>
          <Card
            title="Fuentes de datos"
            accentDot
            className="h-full"
            action={
              <Link
                to="/sources"
                className="text-xs font-medium text-accent transition-colors hover:text-accent-strong"
              >
                Ver todas
              </Link>
            }
          >
            <div className="space-y-2.5">
              {sources.slice(0, 5).map((src, i) => (
                <div
                  key={src.id}
                  className="reveal group flex items-center justify-between gap-3 rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:bg-panel-hover"
                  style={{ animationDelay: `${300 + i * 60}ms` }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="metric-chip h-8 w-8 shrink-0 text-accent transition-colors group-hover:text-teal">
                      <DatabaseIcon width={15} height={15} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm text-ink">{src.name}</div>
                      {src.formats.length > 0 && (
                        <div className="truncate font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                          {src.formats.slice(0, 4).join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`pill shrink-0 ${KIND_BADGE[src.kind] ?? "border-line"}`}>
                    {src.kind}
                  </span>
                </div>
              ))}
              {sources.length === 0 && (
                <div className="h-[180px] animate-pulse rounded-lg bg-panel-hover" />
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
