/** Column metadata (paper order) + shared class strings for the sheet UI. */

import type { CampoPersona } from "./validation";

export interface CampoMeta {
  campo: CampoPersona;
  /** Full label (cards, forms, screen readers). */
  label: string;
  /** Column header as printed on the paper. */
  corto: string;
  inputMode?: "numeric" | "text";
  mono?: boolean;
  maxLength?: number;
  /** Desktop grid column width. */
  ancho: string;
  /** Mobile/form layout: takes the full row. */
  ancha?: boolean;
  placeholder?: string;
}

export const CAMPOS_META: CampoMeta[] = [
  { campo: "apellido_paterno", label: "Apellido paterno", corto: "Ap. paterno", ancho: "w-[9.5rem]", maxLength: 120 },
  { campo: "apellido_materno", label: "Apellido materno", corto: "Ap. materno", ancho: "w-[9.5rem]", maxLength: 120 },
  { campo: "nombres", label: "Nombre(s)", corto: "Nombre(s)", ancho: "w-[10.5rem]", ancha: true, maxLength: 120 },
  { campo: "seccion", label: "Sección", corto: "Sección", ancho: "w-[8.5rem]", ancha: true },
  { campo: "calle", label: "Calle", corto: "Calle", ancho: "w-[10rem]", ancha: true, maxLength: 255 },
  { campo: "numero", label: "Número", corto: "#", ancho: "w-[4.75rem]", inputMode: "numeric", maxLength: 20 },
  { campo: "colonia", label: "Barrio o colonia", corto: "Bo./Col.", ancho: "w-[10rem]", maxLength: 255 },
  {
    campo: "clave_elector", label: "Clave de elector", corto: "Clave de elector", ancho: "w-[13.5rem]",
    mono: true, maxLength: 18, ancha: true,
  },
  { campo: "curp", label: "CURP", corto: "CURP", ancho: "w-[13.5rem]", mono: true, maxLength: 18, ancha: true },
  {
    campo: "telefono", label: "Teléfono", corto: "Teléfono", ancho: "w-[8.5rem]", inputMode: "numeric",
    maxLength: 14, ancha: true, placeholder: "10 dígitos",
  },
];

export const META_POR_CAMPO = Object.fromEntries(CAMPOS_META.map((m) => [m.campo, m])) as Record<
  CampoPersona,
  CampoMeta
>;

/** Strong, always-visible keyboard focus (2px accent outline). */
export const FOCO =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Primary action: AA contrast in both themes. */
export const BTN_PRIMARIO =
  `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent-strong px-5 text-[15px] font-semibold text-white dark:text-bg transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${FOCO}`;

export const BTN_SECUNDARIO =
  `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-line-strong bg-panel px-4 text-[15px] font-semibold text-ink transition-colors hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-60 ${FOCO}`;

export const BTN_TEXTO =
  `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline ${FOCO}`;
