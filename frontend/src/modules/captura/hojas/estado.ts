/** Sheet state + sessionStorage draft (autosave; sessionStorage so clave/CURP
 * never outlive the tab on shared phones). Pure apart from the storage
 * accessors, which are wrapped in try/catch: storage may be unavailable
 * (private mode, blocked site data) and the page must work without it. */

import type { PersonaBusqueda, TipoHoja } from "@/api/capturaHojas";

import { CAMPOS, MAX_FILAS, esFilaVacia, filasVacias, personaVacia, type PersonaForm } from "./validation";

export interface TitularState {
  modo: "buscar" | "nuevo";
  existente: PersonaBusqueda | null;
  nuevo: PersonaForm;
  /** FAMILIA + titular nuevo: the líder the new activista belongs to. */
  lider: PersonaBusqueda | null;
}

export interface HojaState {
  titular: TitularState;
  filas: PersonaForm[];
}

export interface Borrador {
  version: 1;
  tipo: TipoHoja;
  hojas: Record<TipoHoja, HojaState>;
}

export function titularInicial(): TitularState {
  return { modo: "buscar", existente: null, nuevo: personaVacia(), lider: null };
}

export function hojaInicial(tipo: TipoHoja): HojaState {
  return { titular: titularInicial(), filas: filasVacias(MAX_FILAS[tipo]) };
}

export function borradorInicial(): Borrador {
  return { version: 1, tipo: "LIDER", hojas: { LIDER: hojaInicial("LIDER"), FAMILIA: hojaInicial("FAMILIA") } };
}

/** True when the sheet holds typed data that has not been saved. A selected
 * existing titular alone is not "work" (it is kept on purpose between sheets). */
export function tieneTrabajo(h: HojaState): boolean {
  return h.filas.some((f) => !esFilaVacia(f)) || (h.titular.modo === "nuevo" && !esFilaVacia(h.titular.nuevo));
}

// ── Parsing untrusted stored JSON ────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 255) : "";
}

function persona(v: unknown): PersonaForm {
  const out = personaVacia();
  if (v && typeof v === "object") {
    for (const c of CAMPOS) out[c] = str((v as Record<string, unknown>)[c]);
  }
  return out;
}

function personaBusqueda(v: unknown): PersonaBusqueda | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.nombre_completo !== "string") return null;
  return {
    id: o.id,
    nombre_completo: o.nombre_completo,
    seccion: typeof o.seccion === "string" ? o.seccion : null,
    telefono: typeof o.telefono === "string" ? o.telefono : null,
    padre_id: typeof o.padre_id === "string" ? o.padre_id : null,
    padre_nombre: typeof o.padre_nombre === "string" ? o.padre_nombre : null,
    hijos: Number(o.hijos) || 0,
  };
}

function hoja(v: unknown, tipo: TipoHoja): HojaState {
  const base = hojaInicial(tipo);
  if (!v || typeof v !== "object") return base;
  const o = v as Record<string, unknown>;
  const t = (o.titular ?? {}) as Record<string, unknown>;
  const filasRaw = Array.isArray(o.filas) ? o.filas : [];
  return {
    titular: {
      modo: t.modo === "nuevo" ? "nuevo" : "buscar",
      existente: personaBusqueda(t.existente),
      nuevo: persona(t.nuevo),
      lider: personaBusqueda(t.lider),
    },
    filas: base.filas.map((_, i) => persona(filasRaw[i])),
  };
}

export function parseBorrador(raw: string | null): Borrador | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || o.version !== 1) return null;
    const hojas = (o.hojas ?? {}) as Record<string, unknown>;
    return {
      version: 1,
      tipo: o.tipo === "FAMILIA" ? "FAMILIA" : "LIDER",
      hojas: { LIDER: hoja(hojas.LIDER, "LIDER"), FAMILIA: hoja(hojas.FAMILIA, "FAMILIA") },
    };
  } catch {
    return null;
  }
}

// ── Storage (best effort) ────────────────────────────────────────────────────

export function claveBorrador(campaignId: string | null): string {
  return `agora.captura-hojas.borrador.v1.${campaignId || "sin-campana"}`;
}

export function leerBorrador(key: string): Borrador | null {
  try {
    return parseBorrador(window.sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

export function guardarBorrador(key: string, b: Borrador): void {
  try {
    if (tieneTrabajo(b.hojas.LIDER) || tieneTrabajo(b.hojas.FAMILIA) ||
        b.hojas.LIDER.titular.existente || b.hojas.FAMILIA.titular.existente) {
      window.sessionStorage.setItem(key, JSON.stringify(b));
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable — the page keeps working without a draft */
  }
}

export function campanaActiva(): string | null {
  try {
    return window.localStorage.getItem("agora-campaign");
  } catch {
    return null;
  }
}
