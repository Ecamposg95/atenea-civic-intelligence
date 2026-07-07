export interface AnalyticsSummary {
  electoral_areas: number;
  organizations: number;
  users: number;
  data_sources: number;
}

export interface TrendPoint {
  period: string;
  value: number;
}

export interface AnalyticsAlert {
  level: "info" | "warning" | "critical";
  title: string;
  detail: string;
}

export interface AnalyticsOverview {
  summary: AnalyticsSummary;
  coverage: { level: string; count: number }[];
  trends: {
    activity: TrendPoint[];
  };
  by_action: { action: string; count: number }[];
  by_actor: { actor_id: string; count: number }[];
  by_entity_type: { entity_type: string; count: number }[];
  by_hour: { hour: number; count: number }[];
  alerts: AnalyticsAlert[];
  generated_at: string;
  election_date: string | null;
}
