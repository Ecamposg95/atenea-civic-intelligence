import { describe, expect, it } from "vitest";

import { borradorInicial, hojaInicial, parseBorrador, tieneTrabajo } from "../estado";
import { personaVacia } from "../validation";

describe("hojaInicial", () => {
  it("has 10 rows for C1 and 7 for familia", () => {
    expect(hojaInicial("LIDER").filas).toHaveLength(10);
    expect(hojaInicial("FAMILIA").filas).toHaveLength(7);
  });
});

describe("tieneTrabajo", () => {
  it("is false for a fresh sheet and for a sheet with only an existing titular", () => {
    const h = hojaInicial("LIDER");
    expect(tieneTrabajo(h)).toBe(false);
    h.titular.existente = { id: "1", nombre_completo: "ANA", seccion: null, telefono: null, padre_nombre: null, hijos: 0 };
    expect(tieneTrabajo(h)).toBe(false);
  });
  it("is true once any row or a new titular has data", () => {
    const h = hojaInicial("FAMILIA");
    h.filas[3] = { ...personaVacia(), calle: "JUÁREZ" };
    expect(tieneTrabajo(h)).toBe(true);
    const t = hojaInicial("FAMILIA");
    t.titular = { ...t.titular, modo: "nuevo", nuevo: { ...personaVacia(), nombres: "ANA" } };
    expect(tieneTrabajo(t)).toBe(true);
  });
});

describe("parseBorrador", () => {
  it("round-trips a draft", () => {
    const b = borradorInicial();
    b.tipo = "FAMILIA";
    b.hojas.FAMILIA.filas[0].nombres = "ANA";
    expect(parseBorrador(JSON.stringify(b))).toEqual(b);
  });

  it("rejects garbage and other versions", () => {
    expect(parseBorrador(null)).toBeNull();
    expect(parseBorrador("{nope")).toBeNull();
    expect(parseBorrador(JSON.stringify({ version: 2 }))).toBeNull();
  });

  it("repairs malformed content to the fixed row counts", () => {
    const b = parseBorrador(
      JSON.stringify({ version: 1, tipo: "X", hojas: { LIDER: { filas: [{ nombres: 5, calle: "A" }] } } }),
    );
    expect(b?.tipo).toBe("LIDER");
    expect(b?.hojas.LIDER.filas).toHaveLength(10);
    expect(b?.hojas.LIDER.filas[0]).toEqual({ ...personaVacia(), calle: "A" });
    expect(b?.hojas.FAMILIA.filas).toHaveLength(7);
    expect(b?.hojas.LIDER.titular.existente).toBeNull();
  });
});
