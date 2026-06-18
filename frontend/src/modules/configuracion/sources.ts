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
  /** What this source powers in Ágora. */
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
    powers: "Map Explorer · estados y municipios",
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

  // ── Preview (muestra, conectable) ──────────────────────────────────────
  {
    key: "datamexico",
    name: "DataMéxico",
    powers: "Economía Territorial",
    status: "preview",
    format: "API · economía",
    howTo:
      "El cliente está integrado con datos de muestra. Se conecta a la fuente real sin tokens; pendiente de cablear el feed en producción.",
  },
  {
    key: "inegi",
    name: "INEGI",
    powers: "Demografía & Censo",
    status: "preview",
    format: "API · demografía",
    envVar: "INEGI_TOKEN",
    howTo:
      "Solicita un token en el portal de INEGI y configúralo como variable de entorno en Railway. El navegador no almacena el token.",
  },
  {
    key: "denue",
    name: "DENUE",
    powers: "Unidades Económicas",
    status: "preview",
    format: "API · unidades económicas",
    envVar: "INEGI_TOKEN",
    howTo:
      "DENUE usa el mismo token de INEGI. Una vez definido INEGI_TOKEN en Railway, la fuente queda disponible.",
  },
  {
    key: "banxico",
    name: "Banxico",
    powers: "Macro-financiero (Banxico)",
    status: "preview",
    format: "API · SIE",
    envVar: "BANXICO_TOKEN",
    howTo:
      "Genera un token en el SIE de Banxico y configúralo como BANXICO_TOKEN en Railway (servidor). No se introduce en el navegador.",
  },

  // ── Bloqueadas (externo caído) ─────────────────────────────────────────
  {
    key: "apielectoral",
    name: "apielectoral.mx",
    powers: "Candidaturas",
    status: "bloqueada",
    format: "API externa · candidaturas",
    howTo:
      "El proveedor externo está fuera de servicio. El módulo se reactivará automáticamente cuando la API vuelva a responder.",
  },
  {
    key: "ckan",
    name: "datos.gob.mx (CKAN)",
    powers: "Datasets abiertos · catálogo",
    status: "bloqueada",
    format: "CKAN · SSL",
    howTo:
      "El portal presenta un error de certificado SSL del lado del proveedor. No es configurable desde Ágora; depende de que datos.gob.mx corrija su TLS.",
  },
];
