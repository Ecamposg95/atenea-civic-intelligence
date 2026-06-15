import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getOverview } from "@/api/analytics";
import { getAreas } from "@/api/maps";
import { getSources } from "@/api/sources";
import { AppLayout } from "@/components/layout/AppLayout";
import { CoverageBars, type CoverageDatum } from "@/components/dashboards/CoverageBars";
import { ParticipationChart } from "@/components/dashboards/ParticipationChart";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import {
  AlertIcon,
  DatabaseIcon,
  LayersIcon,
  ShieldIcon,
  UserIcon,
} from "@/components/ui/icons";
import type { AnalyticsAlert, AnalyticsOverview } from "@/types/analytics";
import type { AreasResponse } from "@/types/maps";
import type { SourceInfo } from "@/types/sources";

const nf = new Intl.NumberFormat("en-US");

const ALERT_STYLE: Record<AnalyticsAlert["level"], string> = {
  info: "border-accent/30 bg-accent/10 text-accent",
  warning: "border-state-warning/30 bg-state-warning/10 text-state-warning",
  critical: "border-state-critical/30 bg-state-critical/10 text-state-critical",
};

const KIND_BADGE: Record<string, string> = {
  api: "border-accent/30 bg-accent/10 text-accent",
  wms: "border-teal/30 bg-teal/10 text-teal",
  download: "border-state-warning/30 bg-state-warning/10 text-state-warning",
  portal: "border-line text-ink-muted",
};

export function DashboardPage() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [areas, setAreas] = useState<AreasResponse | null>(null);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOverview()
      .then(setData)
      .catch((e) => setError(e.message));
    getAreas()
      .then(setAreas)
      .catch(() => setAreas({ type: "FeatureCollection", features: [] }));
    getSources()
      .then(setSources)
      .catch(() => setSources([]));
  }, []);

  const s = data?.summary;

  const coverage: CoverageDatum[] = useMemo(() => {
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

  return (
    <AppLayout title="Command Center" crumb="Civic Intelligence Overview">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Executive briefing</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            Civic Intelligence Dashboard
          </h1>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            A real-time institutional view across electoral coverage,
            participation and territorial data governance.
          </p>
        </div>
        <Button>Export briefing</Button>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Áreas electorales"
          value={s ? nf.format(s.electoral_areas) : "—"}
          icon={<LayersIcon width={18} height={18} />}
        />
        <MetricCard
          label="Instituciones"
          value={s ? nf.format(s.organizations) : "—"}
          icon={<ShieldIcon width={18} height={18} />}
        />
        <MetricCard
          label="Usuarios activos"
          value={s ? nf.format(s.users) : "—"}
          icon={<UserIcon width={18} height={18} />}
        />
        <MetricCard
          label="Fuentes de datos"
          value={s ? nf.format(s.data_sources) : "—"}
          icon={<DatabaseIcon width={18} height={18} />}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Actividad de la plataforma"
          className="lg:col-span-2"
          action={<span className="pill border-line text-ink-muted">Últimos 14 días</span>}
        >
          {data ? (
            <ParticipationChart
              data={data.trends.activity}
              valueFormat="number"
              seriesLabel="Eventos"
            />
          ) : (
            <div className="h-[220px] animate-pulse rounded-lg bg-panel-hover" />
          )}
        </Card>

        <Card title="Governance & alerts">
          <div className="space-y-2">
            {data?.alerts.map((a, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 rounded-lg border border-line bg-bg-sunken px-3 py-2.5"
              >
                <div className="flex items-start gap-2.5">
                  {a.level === "critical" ? (
                    <AlertIcon width={16} height={16} className="mt-0.5 text-state-critical" />
                  ) : (
                    <ShieldIcon width={16} height={16} className="mt-0.5 text-teal" />
                  )}
                  <div>
                    <div className="text-sm text-ink">{a.title}</div>
                    <div className="text-xs text-ink-faint">{a.detail}</div>
                  </div>
                </div>
                <span className={`pill ${ALERT_STYLE[a.level]}`}>{a.level}</span>
              </div>
            ))}
            {data && data.alerts.length === 0 && (
              <p className="text-sm text-ink-faint">No active alerts.</p>
            )}
            {!data && <div className="h-[120px] animate-pulse rounded-lg bg-panel-hover" />}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Territorial coverage"
          action={<Link to="/maps" className="text-xs text-accent hover:underline">Ver mapa</Link>}
        >
          {!areas ? (
            <div className="h-[200px] animate-pulse rounded-lg bg-panel-hover" />
          ) : coverage.length > 0 ? (
            <CoverageBars data={coverage} />
          ) : (
            <div className="grid h-[200px] place-items-center text-center text-sm text-ink-faint">
              <div>
                Sin cartografía cargada todavía.
                <br />
                Ingesta el Marco Geográfico Electoral del INE para poblar este panel.
              </div>
            </div>
          )}
        </Card>

        <Card
          title="Data sources"
          action={<Link to="/sources" className="text-xs text-accent hover:underline">Ver todas</Link>}
        >
          <div className="space-y-2">
            {sources.slice(0, 5).map((src) => (
              <div
                key={src.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg-sunken px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <DatabaseIcon width={16} height={16} className="text-accent" />
                  <span className="text-sm text-ink">{src.name}</span>
                </div>
                <span className={`pill ${KIND_BADGE[src.kind] ?? "border-line"}`}>
                  {src.kind}
                </span>
              </div>
            ))}
            {sources.length === 0 && (
              <div className="h-[120px] animate-pulse rounded-lg bg-panel-hover" />
            )}
          </div>
        </Card>
      </div>

    </AppLayout>
  );
}
