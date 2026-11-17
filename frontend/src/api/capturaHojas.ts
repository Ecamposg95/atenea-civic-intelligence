import { apiClient } from "./client";

/** Captura de hojas SMA — `/captura/*` (spec 2026-11-17 §5).
 *
 * Mirrors `backend/app/schemas/captura_sma.py`. Every response is read
 * defensively (missing arrays → []) so a backend mid-change never crashes the
 * capture screen. */

export type TipoHoja = "LIDER" | "FAMILIA";
export type TipoPersona = "LIDER" | "ACTIVISTA";
export type EstadoFila = "ok" | "aviso" | "error";

export interface SeccionCatalogo {
  seccion: string;
  barrio: string;
  region: string;
  prioridad?: string;
}

export interface CatalogoCaptura {
  secciones: SeccionCatalogo[];
  barrios: string[];
}

export interface PersonaBusqueda {
  id: string;
  tipo?: string | null;
  nombre_completo: string;
  seccion: string | null;
  telefono: string | null;
  padre_id?: string | null;
  padre_nombre: string | null;
  hijos: number;
}

/** One person exactly as written on the paper (the 10 columns). */
export interface PersonaIn {
  apellido_paterno: string;
  apellido_materno: string;
  nombres: string;
  seccion: string;
  calle: string;
  numero: string;
  colonia: string;
  clave_elector: string;
  curp: string;
  telefono: string;
}

export type TitularIn = { id: string } | (Partial<PersonaIn> & { padre_id?: string });

export interface HojaIn {
  tipo_hoja: TipoHoja;
  dry_run: boolean;
  titular: TitularIn;
  filas: Partial<PersonaIn>[];
}

export interface FilaResultado {
  /** Position in `filas` (null for the titular). */
  index: number | null;
  estado: EstadoFila;
  mensajes: string[];
  id?: string | null;
}

export interface HojaOut {
  ok: boolean;
  titular: FilaResultado;
  filas: FilaResultado[];
  creados: number;
  hoja_id: string | null;
}

export interface HojaResumen {
  hoja_id: string;
  tipo_hoja: TipoHoja | string;
  titular_id?: string | null;
  titular_nombre?: string | null;
  titular_nuevo?: boolean;
  filas: number;
  created_at: string;
}

export async function getCatalogoCaptura(): Promise<CatalogoCaptura> {
  const data = (await apiClient.get("/captura/catalogo")).data ?? {};
  return {
    secciones: Array.isArray(data.secciones) ? data.secciones : [],
    barrios: Array.isArray(data.barrios) ? data.barrios : [],
  };
}

export async function buscarPersonas(
  tipo: TipoPersona,
  q: string,
  signal?: AbortSignal,
): Promise<PersonaBusqueda[]> {
  const params: Record<string, string> = { tipo };
  if (q.trim()) params.q = q.trim();
  const data = (await apiClient.get("/captura/personas", { params, signal })).data;
  return Array.isArray(data)
    ? data.map((p: PersonaBusqueda) => ({ ...p, hijos: Number(p.hijos) || 0 }))
    : [];
}

function isHojaOut(data: unknown): data is HojaOut {
  return (
    !!data &&
    typeof data === "object" &&
    "titular" in data &&
    Array.isArray((data as HojaOut).filas)
  );
}

/** Review (`dry_run: true`) or commit a sheet.
 *
 * A commit with errors answers 422 with the same `HojaOut` body, so 422 is
 * accepted here and returned as data (with `ok: false`). Any other failure
 * (409 no privacy notice, 422 envelope, network) throws an `Error` whose
 * message is safe to show. */
export async function enviarHoja(payload: HojaIn): Promise<HojaOut> {
  const res = await apiClient.post("/captura/hoja", payload, {
    validateStatus: (s) => (s >= 200 && s < 300) || s === 422,
  });
  const data = res.data;
  if (isHojaOut(data)) {
    return {
      ok: Boolean(data.ok),
      titular: {
        index: null,
        estado: data.titular?.estado ?? "ok",
        mensajes: Array.isArray(data.titular?.mensajes) ? data.titular.mensajes : [],
        id: data.titular?.id ?? null,
      },
      filas: data.filas.map((f) => ({
        index: typeof f.index === "number" ? f.index : null,
        estado: f.estado,
        mensajes: Array.isArray(f.mensajes) ? f.mensajes : [],
        id: f.id ?? null,
      })),
      creados: Number(data.creados) || 0,
      hoja_id: data.hoja_id ?? null,
    };
  }
  const message =
    (data && typeof data === "object" && (data as { error?: { message?: string } }).error?.message) ||
    "La hoja no se pudo procesar.";
  const err = new Error(String(message)) as Error & { status?: number };
  err.status = res.status;
  throw err;
}

export async function getMisHojas(): Promise<HojaResumen[]> {
  const data = (await apiClient.get("/captura/mis-hojas")).data;
  return Array.isArray(data) ? data : [];
}
