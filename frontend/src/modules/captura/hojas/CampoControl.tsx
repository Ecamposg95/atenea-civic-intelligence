import type { KeyboardEvent, Ref } from "react";

import type { SeccionCatalogo } from "@/api/capturaHojas";

import { META_POR_CAMPO } from "./campos";
import { CLAVE_LEN, CLAVE_RE, CURP_RE, normalizarEntrada, type CampoPersona } from "./validation";

export const BARRIOS_LIST_ID = "captura-hojas-barrios";

interface Props {
  campo: CampoPersona;
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => void;
  secciones: SeccionCatalogo[];
  invalid?: boolean;
  describedBy?: string;
  /** "celda" = dense grid cell; "campo" = large stacked field (cards/forms). */
  variante: "celda" | "campo";
  /** Accessible name when there is no visible <label for>. */
  ariaLabel?: string;
  dataCell?: string;
  inputRef?: Ref<HTMLInputElement & HTMLSelectElement>;
  className?: string;
}

/** One paper column as a control. Upper-cases while typing, opens the numeric
 * keypad for número/teléfono, and turns sección into a select of the 22 SMA
 * secciones (falls back to a text box if the catalog did not load). */
export function CampoControl({
  campo, id, value, onChange, onBlur, onKeyDown, secciones, invalid, describedBy,
  variante, ariaLabel, dataCell, inputRef, className = "",
}: Props) {
  const meta = META_POR_CAMPO[campo];
  const base =
    variante === "celda"
      ? "h-11 w-full rounded-md border bg-transparent px-2 text-[15px] text-ink placeholder:text-ink-muted/70 focus:bg-panel focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-accent"
      : "h-12 w-full rounded-xl border bg-bg-sunken px-3.5 text-base text-ink placeholder:text-ink-muted/70 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent";
  const borde = invalid
    ? "border-state-critical/80"
    : variante === "celda"
      ? "border-transparent hover:border-line-strong"
      : "border-line-strong";
  const cls = `${base} ${borde} ${meta.mono ? "font-mono tracking-wide" : ""} transition-colors ${className}`;

  const comunes = {
    id,
    "aria-invalid": invalid || undefined,
    "aria-describedby": describedBy || undefined,
    "aria-label": ariaLabel,
    "data-cell": dataCell,
    onBlur,
    onKeyDown,
  };

  if (campo === "seccion" && secciones.length > 0) {
    const conocida = !value || secciones.some((s) => s.seccion === value);
    return (
      <select
        {...comunes}
        ref={inputRef}
        className={`${cls} ${value ? "" : "text-ink-muted"} cursor-pointer pr-7`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{variante === "celda" ? "Elegir" : "Elige la sección"}</option>
        {!conocida && <option value={value}>{value} (no es de SMA)</option>}
        {secciones.map((s) => (
          <option key={s.seccion} value={s.seccion}>
            {s.seccion} {s.barrio}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      {...comunes}
      ref={inputRef}
      type="text"
      className={`${cls} uppercase`}
      value={value}
      onChange={(e) => {
        // Normalizing (upper-case, stripping spaces) replaces the DOM value;
        // keep the caret where the person was typing instead of jumping to the end.
        const el = e.target;
        const raw = el.value;
        const pos = el.selectionStart;
        const next = normalizarEntrada(campo, raw);
        onChange(next);
        if (pos != null && pos < raw.length) {
          const caret = Math.min(normalizarEntrada(campo, raw.slice(0, pos)).length, next.length);
          requestAnimationFrame(() => {
            if (document.activeElement === el) el.setSelectionRange(caret, caret);
          });
        }
      }}
      inputMode={campo === "seccion" ? "numeric" : meta.inputMode}
      autoCapitalize="characters"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      maxLength={meta.maxLength}
      placeholder={variante === "campo" ? meta.placeholder : undefined}
      list={campo === "colonia" ? BARRIOS_LIST_ID : undefined}
      enterKeyHint="next"
    />
  );
}

export type EstadoFormato = { texto: string; tono: "neutro" | "ok" | "error" };

/** Live helper for clave/CURP: "12/18", "Clave completa", "Formato no válido". */
export function formatoEnVivo(campo: CampoPersona, value: string): EstadoFormato | null {
  if (campo === "clave_elector") {
    if (!value) return { texto: `0/${CLAVE_LEN}`, tono: "neutro" };
    if (CLAVE_RE.test(value)) return { texto: `${CLAVE_LEN}/${CLAVE_LEN} completa`, tono: "ok" };
    return { texto: `${value.length}/${CLAVE_LEN}`, tono: value.length > CLAVE_LEN ? "error" : "neutro" };
  }
  if (campo === "curp") {
    if (!value) return { texto: "Opcional", tono: "neutro" };
    if (value.length < CLAVE_LEN) return { texto: `${value.length}/${CLAVE_LEN}`, tono: "neutro" };
    return CURP_RE.test(value)
      ? { texto: "Formato válido", tono: "ok" }
      : { texto: "Formato no válido", tono: "error" };
  }
  if (campo === "telefono" && value) {
    return value.length === 10
      ? { texto: "10/10", tono: "ok" }
      : { texto: `${value.length}/10`, tono: value.length > 10 ? "error" : "neutro" };
  }
  return null;
}

export const TONO_CLASE: Record<EstadoFormato["tono"], string> = {
  neutro: "text-ink-muted",
  ok: "text-ink",
  error: "text-state-critical",
};
