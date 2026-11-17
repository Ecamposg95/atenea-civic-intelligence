/** What each row shows: its status chip and the messages tied to its cells.
 * Pure (unit-tested); the page feeds it the local check, the last server
 * review for that row (dropped as soon as the row is edited) and which
 * fields the person has already left. */

import type { FilaResultado } from "@/api/capturaHojas";

import type { CampoPersona, PersonaForm, RevisionFila } from "./validation";

export type TonoEstado = "vacia" | "neutro" | "lista" | "ok" | "aviso" | "error";

export interface EstadoFilaVista {
  texto: string;
  tono: TonoEstado;
}

export interface MensajeVista {
  id: string;
  texto: string;
  tono: "error" | "aviso";
  campo: CampoPersona | null;
}

export interface FilaVista {
  /** DOM-safe key: "t" (titular) or "f3". */
  key: string;
  persona: PersonaForm;
  estado: EstadoFilaVista;
  mensajes: MensajeVista[];
  /** Fields shown as invalid (red border + aria-invalid). */
  invalidos: Set<CampoPersona>;
  /** aria-describedby value per field (only fields with messages). */
  describedBy: Partial<Record<CampoPersona, string>>;
  /** id of the row's whole message list (when there are messages). */
  mensajesId: string | null;
}

export function estadoFila(local: RevisionFila, server?: FilaResultado | null): EstadoFilaVista {
  if (local.vacia) return { texto: "vacía", tono: "vacia" };
  if (server) {
    if (server.estado === "error") return { texto: "con errores", tono: "error" };
    if (server.estado === "aviso") return { texto: "con avisos", tono: "aviso" };
    return { texto: "revisada", tono: "ok" };
  }
  if (local.errores.length > 0) return { texto: "incompleta", tono: "neutro" };
  return { texto: "lista", tono: "lista" };
}

export function vistaFila(
  key: string,
  persona: PersonaForm,
  local: RevisionFila,
  server: FilaResultado | null | undefined,
  vistos: ReadonlySet<string>,
  mostrarTodo: boolean,
): FilaVista {
  const visto = (c: CampoPersona | null) => mostrarTodo || (c !== null && vistos.has(`${key}:${c}`));
  const mensajes: MensajeVista[] = [];
  const invalidos = new Set<CampoPersona>();

  if (!local.vacia) {
    for (const e of local.errores) {
      if (!visto(e.campo)) continue;
      if (e.campo) invalidos.add(e.campo);
      if (!server) mensajes.push({ id: "", texto: e.mensaje, tono: "error", campo: e.campo });
    }
    if (server) {
      for (const texto of server.mensajes) {
        // Server avisos read like "Falta la CURP"; anything else from a row
        // marked "error" that the local rules also flag is an error too.
        const esError =
          server.estado === "error" &&
          !/^Falta (la CURP|el teléfono)$|posible duplicado|valor viejo/i.test(texto);
        const campo = local.errores.find((e) => e.mensaje === texto)?.campo ?? campoDeMensaje(texto);
        if (esError && campo) invalidos.add(campo);
        mensajes.push({ id: "", texto, tono: esError ? "error" : "aviso", campo });
      }
    } else if (mostrarTodo) {
      for (const a of local.avisos) mensajes.push({ id: "", texto: a.mensaje, tono: "aviso", campo: a.campo });
    }
  }

  mensajes.forEach((m, j) => (m.id = `${key}-m${j}`));
  const describedBy: Partial<Record<CampoPersona, string>> = {};
  for (const m of mensajes) {
    if (!m.campo) continue;
    describedBy[m.campo] = describedBy[m.campo] ? `${describedBy[m.campo]} ${m.id}` : m.id;
  }
  return {
    key,
    persona,
    estado: estadoFila(local, server),
    mensajes,
    invalidos,
    describedBy,
    mensajesId: mensajes.length ? `${key}-msgs` : null,
  };
}

/** Best-effort field for a server message (they are plain Spanish sentences). */
export function campoDeMensaje(texto: string): CampoPersona | null {
  const t = texto.toLowerCase();
  if (t.includes("clave")) return "clave_elector";
  if (t.includes("curp")) return "curp";
  if (t.includes("teléfono") || t.includes("telefono")) return "telefono";
  if (t.includes("sección") || t.includes("seccion")) return "seccion";
  if (t.includes("apellido paterno")) return "apellido_paterno";
  if (t.includes("nombres") || t.includes("nombre")) return "nombres";
  return null;
}
