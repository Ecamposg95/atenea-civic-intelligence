import { describe, expect, it } from "vitest";

import { campoDeMensaje, estadoFila, vistaFila } from "../filaEstado";
import { personaVacia, validarPersona, type PersonaForm } from "../validation";

const incompleta: PersonaForm = { ...personaVacia(), nombres: "ANA", telefono: "722" };

describe("estadoFila", () => {
  it("uses the server result when present, otherwise the local check", () => {
    const local = validarPersona(incompleta);
    expect(estadoFila(validarPersona(personaVacia()))).toEqual({ texto: "vacía", tono: "vacia" });
    expect(estadoFila(local).texto).toBe("incompleta");
    expect(estadoFila(local, { index: 0, estado: "error", mensajes: [] }).tono).toBe("error");
    expect(estadoFila(local, { index: 0, estado: "aviso", mensajes: [] }).tono).toBe("aviso");
    expect(estadoFila(local, { index: 0, estado: "ok", mensajes: [] }).texto).toBe("revisada");
  });
});

describe("vistaFila", () => {
  it("shows only errors of fields already visited until a full review", () => {
    const local = validarPersona(incompleta);
    const v = vistaFila("f0", incompleta, local, null, new Set(["f0:telefono"]), false);
    expect(v.mensajes.map((m) => m.campo)).toEqual(["telefono"]);
    expect([...v.invalidos]).toEqual(["telefono"]);
    expect(v.describedBy.telefono).toBe("f0-m0");
    expect(v.mensajesId).toBe("f0-msgs");

    const todo = vistaFila("f0", incompleta, local, null, new Set(), true);
    expect(todo.invalidos.has("apellido_paterno")).toBe(true);
    expect(todo.mensajes.some((m) => m.tono === "aviso" && m.campo === "curp")).toBe(true);
  });

  it("server messages replace local ones and keep avisos as avisos", () => {
    const local = validarPersona(incompleta);
    const v = vistaFila("f2", incompleta, local, {
      index: 2,
      estado: "error",
      mensajes: ["La clave de elector ya fue capturada en esta campaña", "Falta la CURP"],
    }, new Set(), true);
    expect(v.mensajes.map((m) => [m.texto, m.tono, m.campo])).toEqual([
      ["La clave de elector ya fue capturada en esta campaña", "error", "clave_elector"],
      ["Falta la CURP", "aviso", "curp"],
    ]);
    expect(v.invalidos.has("clave_elector")).toBe(true);
    expect(v.invalidos.has("curp")).toBe(false);
  });

  it("empty rows show nothing", () => {
    const v = vistaFila("f1", personaVacia(), validarPersona(personaVacia()), null, new Set(), true);
    expect(v.mensajes).toEqual([]);
    expect(v.mensajesId).toBeNull();
  });
});

describe("campoDeMensaje", () => {
  it("maps server sentences to fields", () => {
    expect(campoDeMensaje("La CURP está repetida en la hoja")).toBe("curp");
    expect(campoDeMensaje("La sección 9 no es de San Mateo Atenco")).toBe("seccion");
    expect(campoDeMensaje("Coincide con un valor viejo (se guarda como captura nueva)")).toBeNull();
  });
});
