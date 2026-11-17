import type { MapaFeature } from "@/api/mapa";
import {
  avanceBin,
  barWidth,
  changedSecciones,
  chipValue,
  colorFor,
  computeTotales,
  formatHace,
  formatPct,
  groupByRegion,
  labelPoint,
  legendFor,
  margenPp,
  normalizeSeccion,
  pctOf,
  resultadoBin,
  titleCase,
  type SeccionMapa,
} from "../mapaHelpers";

const square = (x0: number, y0: number, s = 0.01) => ({
  type: "Polygon" as const,
  coordinates: [[[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s], [x0, y0]]],
});

// Shape served by the backend today (nested resultado_2024 / avance).
const nested: MapaFeature = {
  type: "Feature",
  geometry: square(-99.55, 19.28),
  properties: {
    seccion: "6673/6674",
    secciones: ["6673", "6674"],
    barrio: "SAN PEDRO",
    region: "R-4",
    prioridad: "P2",
    ln_may25: 3575,
    proy_2027: 1274,
    meta_lideres: 17,
    meta_activistas: 170,
    meta_promovidos: 1190,
    resultado_2024: { lista_nominal: 3000, votos: 2000, participacion: 66.7, coalicion: 800, morena: 1000, margen: -200, etiqueta: "COMPETITIVA" },
    avance: { lideres: 3, activistas: 20, promovidos: 595, viejos: 12 },
    nota: "Geometría INE 2021",
  },
};

// Flat variant (defensive path).
const flat: MapaFeature = {
  type: "Feature",
  geometry: square(-99.54, 19.28),
  properties: {
    seccion: 4121,
    barrio: "ÁLVARO OBREGÓN",
    region: "R-1",
    prioridad: "P1",
    meta_promovidos: 1330,
    meta_lideres: 19,
    meta_activistas: 190,
    votos: 2647,
    coalicion: 908,
    morena: 1023,
    lideres: 1,
    promovidos: 0,
  },
};

const mk = (over: Partial<SeccionMapa>): SeccionMapa => ({
  ...normalizeSeccion(flat, 0),
  ...over,
});

describe("normalizeSeccion", () => {
  it("reads nested avance and resultado_2024", () => {
    const x = normalizeSeccion(nested, 3);
    expect(x.id).toBe(3);
    expect(x.seccion).toBe("6673/6674");
    expect(x.secciones).toEqual(["6673", "6674"]);
    expect(x.avance).toEqual({ lideres: 3, activistas: 20, promovidos: 595, viejos: 12 });
    expect(x.r2024?.margen).toBe(-200);
    expect(x.r2024?.etiqueta).toBe("COMPETITIVA");
    expect(x.meta.promovidos).toBe(1190);
  });

  it("accepts flat fields, derives margen and defaults missing counts to 0", () => {
    const x = normalizeSeccion(flat, 0);
    expect(x.seccion).toBe("4121");
    expect(x.secciones).toEqual(["4121"]);
    expect(x.r2024?.margen).toBe(908 - 1023);
    expect(x.avance.viejos).toBe(0);
    expect(x.avance.activistas).toBe(0);
    expect(x.lnMay25).toBeNull();
  });

  it("survives null properties", () => {
    const x = normalizeSeccion({ type: "Feature", geometry: null, properties: null }, 0);
    expect(x.r2024).toBeNull();
    expect(x.meta).toEqual({ lideres: 0, activistas: 0, promovidos: 0 });
  });
});

describe("percentages", () => {
  it("pctOf handles zero / missing meta", () => {
    expect(pctOf(5, 0)).toBeNull();
    expect(pctOf(5, NaN)).toBeNull();
    expect(pctOf(50, 200)).toBe(25);
    expect(pctOf(300, 200)).toBe(150);
    expect(pctOf(-3, 10)).toBe(0);
  });

  it("barWidth clamps to 0..100", () => {
    expect(barWidth(300, 200)).toBe(100);
    expect(barWidth(1, 0)).toBe(0);
    expect(barWidth(10, 40)).toBe(25);
  });

  it("formatPct keeps small progress visible", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(0)).toBe("0 %");
    expect(formatPct(0.43)).toBe("0.4 %");
    expect(formatPct(99.9)).toBe("99 %");
    expect(formatPct(120)).toBe("120 %");
  });

  it("margenPp is coalición − morena over votos", () => {
    const x = normalizeSeccion(nested, 0);
    expect(margenPp(x.r2024)).toBeCloseTo(-10);
    expect(margenPp(null)).toBeNull();
  });
});

describe("color scales", () => {
  it("avance bins step at 10/25/50/75/100", () => {
    expect(avanceBin(null)).toBe(-1);
    expect([0, 9.9, 10, 24, 25, 60, 75, 99, 100, 180].map(avanceBin)).toEqual([0, 0, 1, 1, 2, 3, 4, 4, 5, 5]);
  });

  it("resultado bins are symmetric with a neutral ±2 band", () => {
    expect([-15, -10, -6, -3, -2, 0, 2, 3, 6, 10, 15].map(resultadoBin)).toEqual([0, 1, 1, 2, 3, 3, 3, 4, 5, 5, 6]);
  });

  it("region color follows the región, never the order it appears in", () => {
    const r4 = mk({ region: "R-4" });
    const r1 = mk({ region: "R-1" });
    expect(colorFor("region", r4, "light")).toBe("#eda100");
    expect(colorFor("region", r1, "light")).toBe("#2a78d6");
    expect(colorFor("region", mk({ region: null }), "light")).toBe("#c3c2b7");
  });

  it("prioridad P1 is the strongest step; dark mode has its own steps", () => {
    const p1 = colorFor("prioridad", mk({ prioridad: "P1" }), "light");
    const p4 = colorFor("prioridad", mk({ prioridad: "P4" }), "light");
    expect(p1).not.toBe(p4);
    expect(colorFor("prioridad", mk({ prioridad: "P1" }), "dark")).not.toBe(p1);
  });

  it("avance and resultado modes map through their bins", () => {
    const half = mk({ meta: { lideres: 1, activistas: 1, promovidos: 100 }, avance: { lideres: 0, activistas: 0, promovidos: 50, viejos: 0 } });
    expect(colorFor("avance", half, "light")).toBe("#3987e5");
    expect(chipValue("avance", half)).toBe("50%");
    const x = normalizeSeccion(nested, 0);
    expect(chipValue("resultado", x)).toBe("−10");
    expect(chipValue("region", x)).toBe("R-4");
  });

  it("every legend has a swatch per bin", () => {
    expect(legendFor("region", "light").items).toHaveLength(7);
    expect(legendFor("prioridad", "dark").items).toHaveLength(4);
    expect(legendFor("avance", "light").items).toHaveLength(6);
    expect(legendFor("resultado", "light").items).toHaveLength(7);
  });
});

describe("groupByRegion", () => {
  const list = [
    mk({ seccion: "4140", region: "R-2", barrio: "SANTA MARÍA", meta: { lideres: 40, activistas: 400, promovidos: 2800 }, avance: { lideres: 2, activistas: 5, promovidos: 100, viejos: 1 } }),
    mk({ seccion: "4123", region: "R-2", barrio: "BUENAVISTA", meta: { lideres: 17, activistas: 170, promovidos: 1190 }, avance: { lideres: 1, activistas: 0, promovidos: 10, viejos: 0 } }),
    mk({ seccion: "4121", region: "R-1" }),
    mk({ seccion: "9999", region: null }),
  ];

  it("orders regiones R-1..R-7, then unknown; secciones numerically", () => {
    const g = groupByRegion(list);
    expect(g.map((x) => x.region)).toEqual(["R-1", "R-2", "Sin región"]);
    expect(g[1].secciones.map((x) => x.seccion)).toEqual(["4123", "4140"]);
    expect(g[1].barrios).toEqual(["Buenavista", "Santa María"]);
  });

  it("computes subtotals per región", () => {
    const r2 = groupByRegion(list)[1];
    expect(r2.subtotal.meta).toEqual({ lideres: 57, activistas: 570, promovidos: 3990 });
    expect(r2.subtotal.avance).toEqual({ lideres: 3, activistas: 5, promovidos: 110, viejos: 1 });
  });

  it("computeTotales prefers the API totals and falls back to sums / 400·4000·28000", () => {
    expect(computeTotales(list, { lideres: 9, meta_promovidos: 28000 }).avance.lideres).toBe(9);
    expect(computeTotales([], null).meta).toEqual({ lideres: 400, activistas: 4000, promovidos: 28000 });
  });
});

describe("misc", () => {
  it("titleCase keeps accents and slashes", () => {
    expect(titleCase("SAN NICOLÁS / SANTIAGO")).toBe("San Nicolás / Santiago");
    expect(titleCase("ÁLVARO OBREGÓN")).toBe("Álvaro Obregón");
    expect(titleCase(null)).toBe("—");
  });

  it("formatHace", () => {
    expect(formatHace(3_000)).toBe("hace un momento");
    expect(formatHace(42_000)).toBe("hace 42 s");
    expect(formatHace(5 * 60_000)).toBe("hace 5 min");
    expect(formatHace(2 * 3_600_000)).toBe("hace 2 h");
  });

  it("changedSecciones flags only increases", () => {
    const a = [mk({ seccion: "1" }), mk({ seccion: "2" })];
    const b = [
      mk({ seccion: "1", avance: { lideres: 0, activistas: 0, promovidos: 5, viejos: 0 } }),
      mk({ seccion: "2" }),
    ];
    expect([...changedSecciones(a, b)]).toEqual(["1"]);
  });

  it("labelPoint lands inside a concave (L-shaped) polygon", () => {
    // L shape: the bbox centre (0.5, 0.5) is outside the polygon.
    const L = {
      type: "Polygon" as const,
      coordinates: [[[0, 0], [1, 0], [1, 0.3], [0.3, 0.3], [0.3, 1], [0, 1], [0, 0]]],
    };
    const p = labelPoint(L)!;
    const inside = (p[0] <= 0.3 && p[1] <= 1) || (p[1] <= 0.3 && p[0] <= 1);
    expect(inside).toBe(true);
    expect(labelPoint(null)).toBeNull();
  });
});
