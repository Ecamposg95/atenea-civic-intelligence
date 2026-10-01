import { describe, it, expect } from "vitest";
import type { Alerta } from "@/api/alertas";
import { ALERTAS_READ, SEVERIDAD, filtrarAlertas, haceCuanto } from "../logic";

const base: Omit<Alerta, "clave" | "categoria" | "seccion"> = {
  regla: "T1", severidad: "critica", titulo: "t", detalle: "d",
  valor: null, umbral: null, enlace: "/",
};
const items: Alerta[] = [
  { ...base, clave: "T1:4121", categoria: "territorial", seccion: "4121" },
  { ...base, clave: "O1:4122", categoria: "operativa", seccion: "4122" },
  { ...base, clave: "O3:campaña", categoria: "operativa", seccion: null },
];

describe("filtrarAlertas", () => {
  it("sin filtros devuelve todo", () => {
    expect(filtrarAlertas(items, "todas", null)).toHaveLength(3);
  });
  it("filtra por categoría", () => {
    expect(filtrarAlertas(items, "operativa", null).map((a) => a.clave))
      .toEqual(["O1:4122", "O3:campaña"]);
    expect(filtrarAlertas(items, "territorial", null).map((a) => a.clave)).toEqual(["T1:4121"]);
  });
  it("filtra por sección y combina con categoría", () => {
    expect(filtrarAlertas(items, "todas", "4122").map((a) => a.clave)).toEqual(["O1:4122"]);
    expect(filtrarAlertas(items, "territorial", "4122")).toEqual([]);
  });
});

describe("haceCuanto", () => {
  const ahora = new Date("2026-09-27T12:00:00Z");
  it("formatea momentos, minutos y horas", () => {
    expect(haceCuanto("2026-09-27T12:00:20Z", ahora)).toBe("evaluado hace un momento");
    expect(haceCuanto("2026-09-27T11:58:00Z", ahora)).toBe("evaluado hace 2 min");
    expect(haceCuanto("2026-09-27T09:00:00+00:00", ahora)).toBe("evaluado hace 3 h");
  });
});

describe("constantes", () => {
  it("solo ejecutivos ven alertas", () => {
    expect(ALERTAS_READ).toEqual(["superadmin", "admin", "coordinador"]);
  });
  it("cada severidad tiene etiqueta y color de token", () => {
    for (const s of ["critica", "alta", "media"] as const) {
      expect(SEVERIDAD[s].label).toBeTruthy();
      expect(SEVERIDAD[s].color).toMatch(/^rgb\(var\(--c-/);
    }
  });
});
