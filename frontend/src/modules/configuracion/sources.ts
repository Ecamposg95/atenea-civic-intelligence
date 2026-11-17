// Honest, static catalogue of the platform's data sources for the
// Configuración / Integraciones status board. Status reflects reality:
//   - "activa":    real, reachable in production today.
//   - "preview":   sample/pluggable data; wiring exists, real feed pending.
//   - "bloqueada": external source currently unavailable (down / SSL).
// No secrets are stored here — token-gated sources only document the env
// var to set on the server (Railway), never a value to type in the browser.

import type { Tone } from "@/constants/ui";

export type IntegrationStatus = "activa" | "preview" | "bloqueada";

export interface IntegrationSource {
  /** Stable key. */
  key: string;
  /** Display name of the source. */
  name: string;
  /** What this source powers in Atenea. */
  powers: string;
  /** Current, honest status. */
  status: IntegrationStatus;
  /** Short data-format / provenance note (e.g. "CSV · EdoMex"). */
  format: string;
  /**
   * Server-side env var that activates / authenticates this source, when the
   * source is token-gated. Configured via Railway env vars — never in-browser.
   */
  envVar?: string;
  /** Short "cómo activar" note shown for token-gated / blocked sources. */
  howTo?: string;
}

export const STATUS_META: Record<
  IntegrationStatus,
  { label: string; toneKey: Tone; dot: string }
> = {
  activa: {
    label: "Activa",
    toneKey: "ok",
    dot: "bg-teal",
  },
  preview: {
    label: "Preview",
    toneKey: "warning",
    dot: "bg-state-warning",
  },
  bloqueada: {
    label: "Bloqueada",
    toneKey: "critical",
    dot: "bg-state-critical",
  },
};

export const STATUS_ORDER: IntegrationStatus[] = [
  "activa",
  "preview",
  "bloqueada",
];

export const INTEGRATIONS: IntegrationSource[] = [
  // ── Activas (reales, alcanzables) ──────────────────────────────────────
  {
    key: "ieem",
    name: "IEEM Numeralia",
    powers: "Estado de México (IEEM) · numeralia electoral",
    status: "activa",
    format: "CSV · EdoMex",
  },
  {
    key: "worldbank",
    name: "World Bank",
    powers: "Indicadores Nacionales · series macroeconómicas",
    status: "activa",
    format: "API pública · indicadores",
  },
  {
    key: "gadm",
    name: "Geometría GADM",
    powers: "Cartografía · estados y municipios",
    status: "activa",
    format: "GeoJSON · estados/municipios",
  },
  {
    key: "analytics",
    name: "Auditoría / Analytics",
    powers: "Activity Analytics · Auditoría & Cumplimiento",
    status: "activa",
    format: "DB interna",
  },

  // ── Bloqueadas (externo caído) ─────────────────────────────────────────
  {
    key: "ckan",
    name: "datos.gob.mx (CKAN)",
    powers: "Datasets abiertos · catálogo",
    status: "bloqueada",
    format: "CKAN · SSL",
    howTo:
      "El portal presenta un error de certificado SSL del lado del proveedor. No es configurable desde Atenea; depende de que datos.gob.mx corrija su TLS.",
  },
];
