/** Pure helpers for the paper-sheet capture (spec 2026-11-17 §4).
 *
 * The rules mirror `backend/app/services/captura_sma_service.py`, so a sheet
 * that passes here passes the server's local checks too (the server adds the
 * database checks: claves/CURP already captured, possible duplicates, valores
 * viejos). No React, no DOM — fully unit-tested. */

import type { PersonaIn, TipoHoja } from "@/api/capturaHojas";

export type CampoPersona = keyof PersonaIn;
export type PersonaForm = PersonaIn;

export const CAMPOS: CampoPersona[] = [
  "apellido_paterno",
  "apellido_materno",
  "nombres",
  "seccion",
  "calle",
  "numero",
  "colonia",
  "clave_elector",
  "curp",
  "telefono",
];

/** Fields the paper rules require (spec §4: errores). */
export const OBLIGATORIOS: ReadonlySet<CampoPersona> = new Set<CampoPersona>([
  "apellido_paterno",
  "nombres",
  "seccion",
  "clave_elector",
]);

export const MAX_FILAS:Record<TipoHoja, number> = { LIDER: 10, FAMILIA: 7 };

export const CLAVE_LEN = 18;
export const TELEFONO_LEN = 10;
export const CLAVE_RE = /^[A-Z0-9]{18}$/;
export const CURP_RE = /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;

export function personaVacia(): PersonaForm {
  return {
    apellido_paterno: "",
    apellido_materno: "",
    nombres: "",
    seccion: "",
    calle: "",
    numero: "",
    colonia: "",
    clave_elector: "",
    curp: "",
    telefono: "",
  };
}

export function filasVacias(n: number): PersonaForm[] {
  return Array.from({ length: n }, personaVacia);
}

// ── Normalization ────────────────────────────────────────────────────────────

/** Transform applied on every keystroke: everything upper-case; clave/CURP
 * without spaces (capped at 18); teléfono digits only; no leading or doubled
 * spaces elsewhere (a single trailing space is kept so typing still works). */
export function normalizarEntrada(campo: CampoPersona, raw: string): string {
  const v = (raw ?? "").toUpperCase();
  switch (campo) {
    case "clave_elector":
    case "curp":
      return v.replace(/[^A-Z0-9Ñ]/g, "").slice(0, CLAVE_LEN);
    case "telefono":
      return v.replace(/\D/g, "");
    case "seccion":
      return v.replace(/\s/g, "");
    default:
      return v.replace(/^\s+/, "").replace(/\s{2,}/g, " ");
  }
}

/** Final form sent to the server: trimmed, single spaces, upper-case. */
export function limpiarPersona(p: PersonaForm): PersonaForm {
  const out = personaVacia();
  for (const c of CAMPOS) {
    const v = normalizarEntrada(c, p[c] ?? "");
    out[c] = c === "telefono" || c === "clave_elector" || c === "curp" || c === "seccion"
      ? v
      : v.trim();
  }
  return out;
}

export function esFilaVacia(p: Partial<PersonaForm> | null | undefined): boolean {
  if (!p) return true;
  return CAMPOS.every((c) => !(p[c] ?? "").trim());
}

export function nombreCompleto(p: Partial<PersonaForm>): string {
  return [p.nombres, p.apellido_paterno, p.apellido_materno]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface Problema {
  campo: CampoPersona | null;
  mensaje: string;
}

export interface RevisionFila {
  vacia: boolean;
  errores: Problema[];
  avisos: Problema[];
}

/** Local (single-row) rules. `secciones` = the catalog; when it is empty
 * (catalog not loaded) the "sección de SMA" rule is skipped — the server
 * still enforces it. */
export function validarPersona(p: PersonaForm, secciones?: ReadonlySet<string> | null): RevisionFila {
  const x = limpiarPersona(p);
  if (esFilaVacia(x)) return { vacia: true, errores: [], avisos: [] };
  const errores: Problema[] = [];
  const avisos: Problema[] = [];

  if (!x.apellido_paterno) errores.push({ campo: "apellido_paterno", mensaje: "Falta el apellido paterno" });
  if (!x.nombres) errores.push({ campo: "nombres", mensaje: "Faltan los nombres" });

  if (!x.seccion) errores.push({ campo: "seccion", mensaje: "Falta la sección" });
  else if (secciones && secciones.size > 0 && !secciones.has(x.seccion))
    errores.push({ campo: "seccion", mensaje: `La sección ${x.seccion} no es de San Mateo Atenco` });

  if (!x.clave_elector) errores.push({ campo: "clave_elector", mensaje: "Falta la clave de elector" });
  else if (!CLAVE_RE.test(x.clave_elector))
    errores.push({
      campo: "clave_elector",
      mensaje: `La clave de elector debe tener 18 caracteres (lleva ${x.clave_elector.length})`,
    });

  if (!x.curp) avisos.push({ campo: "curp", mensaje: "Falta la CURP" });
  else if (!CURP_RE.test(x.curp)) errores.push({ campo: "curp", mensaje: "La CURP no tiene un formato válido" });

  if (!x.telefono) avisos.push({ campo: "telefono", mensaje: "Falta el teléfono" });
  else if (x.telefono.length !== TELEFONO_LEN)
    errores.push({
      campo: "telefono",
      mensaje: `El teléfono debe tener 10 dígitos (lleva ${x.telefono.length})`,
    });

  return { vacia: false, errores, avisos };
}

/** Repeats inside the same sheet (titular included). Clave/CURP repeats are
 * errors (the server rejects them); a repeated name is only an aviso
 * (regla "sin nombres duplicados"). Returns one list per input position. */
export function duplicadosEnHoja(personas: PersonaForm[]): { errores: Problema[]; avisos: Problema[] }[] {
  const limpias = personas.map(limpiarPersona);
  const contar = (key: (p: PersonaForm) => string | null) => {
    const m = new Map<string, number>();
    for (const p of limpias) {
      if (esFilaVacia(p)) continue;
      const k = key(p);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const claveKey = (p: PersonaForm) => (CLAVE_RE.test(p.clave_elector) ? p.clave_elector : null);
  const curpKey = (p: PersonaForm) => (CURP_RE.test(p.curp) ? p.curp : null);
  const nombreKey = (p: PersonaForm) => {
    const n = nombreCompleto(p);
    return p.apellido_paterno && p.nombres ? n : null;
  };
  const claves = contar(claveKey);
  const curps = contar(curpKey);
  const nombres = contar(nombreKey);

  return limpias.map((p) => {
    const errores: Problema[] = [];
    const avisos: Problema[] = [];
    if (esFilaVacia(p)) return { errores, avisos };
    const c = claveKey(p);
    if (c && (claves.get(c) ?? 0) > 1)
      errores.push({ campo: "clave_elector", mensaje: "La clave de elector está repetida en la hoja" });
    const cu = curpKey(p);
    if (cu && (curps.get(cu) ?? 0) > 1)
      errores.push({ campo: "curp", mensaje: "La CURP está repetida en la hoja" });
    const n = nombreKey(p);
    if (n && (nombres.get(n) ?? 0) > 1)
      avisos.push({ campo: "nombres", mensaje: "El nombre está repetido en la hoja" });
    return { errores, avisos };
  });
}

export interface RevisionHoja {
  /** null when the titular is an existing person (nothing to validate here). */
  titular: RevisionFila | null;
  filas: RevisionFila[];
  totalErrores: number;
  filasConDatos: number;
}

/** Whole-sheet local check: per-row rules + in-sheet duplicates. */
export function revisarHoja(
  titularNuevo: PersonaForm | null,
  filas: PersonaForm[],
  secciones?: ReadonlySet<string> | null,
): RevisionHoja {
  const todas = titularNuevo ? [titularNuevo, ...filas] : filas;
  const locales = todas.map((p) => validarPersona(p, secciones));
  const dups = duplicadosEnHoja(todas);
  const merged = locales.map((r, i) => ({
    vacia: r.vacia,
    errores: [...r.errores, ...dups[i].errores],
    avisos: [...r.avisos, ...dups[i].avisos],
  }));
  const titular = titularNuevo ? merged[0] : null;
  const filasRev = titularNuevo ? merged.slice(1) : merged;
  const totalErrores = merged.reduce((acc, r) => acc + r.errores.length, 0);
  return {
    titular,
    filas: filasRev,
    totalErrores,
    filasConDatos: filasRev.filter((r) => !r.vacia).length,
  };
}

export type EstadoLocal = "vacia" | "incompleta" | "lista";

export function estadoLocal(r: RevisionFila): EstadoLocal {
  if (r.vacia) return "vacia";
  return r.errores.length > 0 ? "incompleta" : "lista";
}

// ── Payload + copy ───────────────────────────────────────────────────────────

/** Rows for the API: cleaned, empty strings dropped. Empty rows are kept in
 * place (the server ignores them but keeps the original `index`). */
export function filaPayload(p: PersonaForm): Partial<PersonaForm> {
  const x = limpiarPersona(p);
  const out: Partial<PersonaForm> = {};
  for (const c of CAMPOS) if (x[c]) out[c] = x[c];
  return out;
}

const NOMBRES: Record<TipoHoja, { titular: [string, string]; fila: [string, string] }> = {
  LIDER: { titular: ["líder", "líderes"], fila: ["activista", "activistas"] },
  FAMILIA: { titular: ["activista", "activistas"], fila: ["promovido", "promovidos"] },
};

export function etiquetaPersonas(tipo: TipoHoja, rol: "titular" | "fila", n: number): string {
  const [uno, varios] = NOMBRES[tipo][rol];
  return `${n} ${n === 1 ? uno : varios}`;
}

/** "Hoja guardada: 1 líder + 8 activistas" (titular nuevo) or
 * "Hoja guardada: 8 activistas" (titular existente). */
export function resumenGuardado(tipo: TipoHoja, titularNuevo: boolean, filas: number): string {
  const partes: string[] = [];
  if (titularNuevo) partes.push(etiquetaPersonas(tipo, "titular", 1));
  if (filas > 0 || !titularNuevo) partes.push(etiquetaPersonas(tipo, "fila", filas));
  return `Hoja guardada: ${partes.join(" + ")}`;
}
