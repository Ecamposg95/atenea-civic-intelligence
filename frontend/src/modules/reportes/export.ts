// frontend/src/modules/reportes/export.ts
import type { AnalyticsOverview } from "@/types/analytics";

/** A labelled row destined for the CSV briefing. */
interface CsvRow {
  section: string;
  label: string;
  value: string | number;
}

/** RFC-4180-ish escaping: quote fields containing commas, quotes or newlines. */
function escapeCsv(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** YYYY-MM-DD for filenames, derived from a Date. */
export function fileDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Serialize the executive briefing (KPIs + breakdowns) into CSV rows.
 * Pure: only real values from the overview payload and the live state count.
 */
export function briefingToCsvRows(
  overview: AnalyticsOverview,
  stateCount: number | null,
): CsvRow[] {
  const rows: CsvRow[] = [];

  // KPI summary
  rows.push({ section: "Resumen", label: "Áreas electorales", value: overview.summary.electoral_areas });
  rows.push({ section: "Resumen", label: "Organizaciones", value: overview.summary.organizations });
  rows.push({ section: "Resumen", label: "Usuarios", value: overview.summary.users });
  rows.push({ section: "Resumen", label: "Fuentes de datos", value: overview.summary.data_sources });
  if (stateCount !== null) {
    rows.push({ section: "Resumen", label: "Entidades (cartografía estatal)", value: stateCount });
  }

  // Coverage by level
  for (const c of overview.coverage) {
    rows.push({ section: "Cobertura por nivel", label: c.level, value: c.count });
  }

  // Activity trend
  for (const p of overview.trends.activity) {
    rows.push({ section: "Tendencia de actividad", label: p.period, value: p.value });
  }

  // Top actions
  for (const a of overview.by_action) {
    rows.push({ section: "Acciones principales", label: a.action, value: a.count });
  }

  // Top actors
  for (const a of overview.by_actor) {
    rows.push({ section: "Actores principales", label: a.actor_id, value: a.count });
  }

  // Alerts
  for (const al of overview.alerts) {
    rows.push({ section: "Alertas", label: `[${al.level}] ${al.title}`, value: al.detail });
  }

  // Provenance
  rows.push({ section: "Metadatos", label: "Generado por", value: "Ágora Civic Intelligence" });
  rows.push({ section: "Metadatos", label: "Datos generados", value: overview.generated_at });
  rows.push({ section: "Metadatos", label: "Exportado", value: new Date().toISOString() });

  return rows;
}

/** Build the full CSV text (with header) from briefing rows. */
export function rowsToCsv(rows: CsvRow[]): string {
  const header = ["Sección", "Concepto", "Valor"];
  const lines = [header.map(escapeCsv).join(",")];
  for (const r of rows) {
    lines.push([r.section, r.label, r.value].map(escapeCsv).join(","));
  }
  // BOM so Excel reads UTF-8 (accents) correctly.
  return `﻿${lines.join("\r\n")}`;
}

/**
 * Serialize the briefing to CSV and trigger a client-side Blob download.
 * No external dependencies — uses the DOM URL/anchor pattern.
 */
export function downloadCSV(
  overview: AnalyticsOverview,
  stateCount: number | null,
): void {
  const csv = rowsToCsv(briefingToCsvRows(overview, stateCount));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Reporte_Agora_${fileDate()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
