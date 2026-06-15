import { useEffect, useState } from "react";

import { getOverview } from "@/api/analytics";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { ParticipationChart } from "@/components/dashboards/ParticipationChart";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card } from "@/components/ui/Card";
import { AnalyticsIcon } from "@/components/ui/icons";
import type { AnalyticsOverview } from "@/types/analytics";

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOverview()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const activity = data?.trends.activity ?? [];
  const totalEvents = activity.reduce((acc, p) => acc + p.value, 0);
  const peakEvents = activity.reduce((max, p) => Math.max(max, p.value), 0);

  return (
    <AppLayout title="Activity Analytics" crumb="Operational Intelligence">
      <PageHeader
        eyebrow="Operational intelligence"
        title="Activity"
        accent="Analytics"
        subtitle="Tenant-scoped platform activity from the audit trail. Civic participation series will appear here as padrón and PREP pipelines are onboarded."
        actions={
          data && (
            <>
              <div className="card-premium px-4 py-3">
                <div className="eyebrow mb-1.5">Eventos 14d</div>
                <div className="flex items-center gap-2">
                  <AnalyticsIcon className="h-5 w-5 text-accent" />
                  <AnimatedNumber
                    value={totalEvents}
                    className="font-display text-2xl font-bold tabular-nums text-ink"
                  />
                </div>
              </div>
              <div className="card-premium px-4 py-3">
                <div className="eyebrow mb-1.5">Pico diario</div>
                <AnimatedNumber
                  value={peakEvents}
                  className="font-display text-2xl font-bold tabular-nums text-teal"
                />
              </div>
            </>
          )
        }
      />

      {error && (
        <div className="reveal mb-4 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
        <Card title="Eventos por día (últimos 14 días)" accentDot className="h-full">
          {data ? (
            <ParticipationChart
              data={data.trends.activity}
              height={260}
              valueFormat="number"
              seriesLabel="Eventos"
            />
          ) : (
            <div className="h-[260px] animate-pulse rounded-lg bg-panel-hover" />
          )}
        </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "200ms" }}>
        <Card title="Methodology & governance" accentDot className="h-full">
          <p className="text-sm leading-relaxed text-ink-muted">
            Metrics are aggregated live from the database and are tenant-scoped.
            Individual records are never exposed; all access is audit-logged. The
            activity series is built from the audit trail.
          </p>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-panel-hover">
              <span className="text-sm text-ink">Aggregation</span>
              <span className="pill border-accent/30 bg-accent/10 text-accent">
                Tenant-scoped
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-panel-hover">
              <span className="text-sm text-ink">Privacy</span>
              <span className="pill border-teal/30 bg-teal/10 text-teal">
                By design
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-panel-hover">
              <span className="text-sm text-ink">Auditability</span>
              <span className="pill border-state-warning/30 bg-state-warning/10 text-state-warning">
                Full trail
              </span>
            </div>
          </div>
        </Card>
        </div>
      </div>
    </AppLayout>
  );
}
