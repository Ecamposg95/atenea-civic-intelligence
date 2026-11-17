import { describe, expect, it } from "vitest";

import {
  CURP_RE,
  duplicadosEnHoja,
  esFilaVacia,
  estadoLocal,
  filaPayload,
  limpiarPersona,
  normalizarEntrada,
  personaVacia,
  resumenGuardado,
  revisarHoja,
  validarPersona,
  type PersonaForm,
} from "../validation";

const CLAVE = "GNZLRB80010115H500";
const CURP = "GODE561231HDFRRN09";
const SECCIONES = new Set(["4114", "4115", "6673"]);

function persona(over: Partial<PersonaForm> = {}): PersonaForm {
  return {
    ...personaVacia(),
    apellido_paterno: "GONZÁLEZ",
    apellido_materno: "PÉREZ",
    nombres: "ROBERTO",
    seccion: "4114",
    clave_elector: CLAVE,
    curp: CURP,
    telefono: "7221234567",
    ...over,
  };
}

const campos = (r: { errores: { campo: string | null }[] }) => r.errores.map((e) => e.campo);

describe("normalizarEntrada", () => {
  it("upper-cases text and drops leading / doubled spaces but keeps a trailing one", () => {
    expect(normalizarEntrada("nombres", "  maría  josé ")).toBe("MARÍA JOSÉ ");
  });
  it("strips spaces and symbols from clave / CURP and caps them at 18", () => {
    expect(normalizarEntrada("clave_elector", "gnzl rb80-0101 15h500 99")).toBe(CLAVE);
    expect(normalizarEntrada("curp", "gode 561231 hdfrrn09")).toBe(CURP);
  });
  it("keeps only digits in teléfono and no spaces in sección", () => {
    expect(normalizarEntrada("telefono", "(722) 123-45 67")).toBe("7221234567");
    expect(normalizarEntrada("seccion", " 41 14")).toBe("4114");
  });
});

describe("limpiarPersona / filaPayload", () => {
  it("trims text fields", () => {
    expect(limpiarPersona(persona({ nombres: "ana " })).nombres).toBe("ANA");
  });
  it("drops empty fields from the payload", () => {
    const p = filaPayload({ ...personaVacia(), nombres: "ana", telefono: "" });
    expect(p).toEqual({ nombres: "ANA" });
  });
});

describe("esFilaVacia", () => {
  it("treats blank and whitespace-only rows as empty", () => {
    expect(esFilaVacia(personaVacia())).toBe(true);
    expect(esFilaVacia({ ...personaVacia(), calle: "   " })).toBe(true);
    expect(esFilaVacia(null)).toBe(true);
  });
  it("any single field makes the row non-empty", () => {
    expect(esFilaVacia({ ...personaVacia(), telefono: "7" })).toBe(false);
    expect(esFilaVacia({ ...personaVacia(), seccion: "4114" })).toBe(false);
  });
});

describe("validarPersona", () => {
  it("a complete row has no errors or avisos", () => {
    const r = validarPersona(persona(), SECCIONES);
    expect(r).toEqual({ vacia: false, errores: [], avisos: [] });
    expect(estadoLocal(r)).toBe("lista");
  });

  it("empty rows are ignored", () => {
    const r = validarPersona(personaVacia(), SECCIONES);
    expect(r.vacia).toBe(true);
    expect(estadoLocal(r)).toBe("vacia");
  });

  it("requires apellido paterno, nombres, sección and clave", () => {
    const r = validarPersona({ ...personaVacia(), telefono: "7221234567" }, SECCIONES);
    expect(campos(r)).toEqual(["apellido_paterno", "nombres", "seccion", "clave_elector"]);
    expect(estadoLocal(r)).toBe("incompleta");
  });

  it("clave must be exactly 18 alphanumeric characters", () => {
    const r = validarPersona(persona({ clave_elector: "ABC123" }), SECCIONES);
    expect(r.errores[0]).toEqual({
      campo: "clave_elector",
      mensaje: "La clave de elector debe tener 18 caracteres (lleva 6)",
    });
  });

  it("sección must be in the catalog, but is not checked without a catalog", () => {
    expect(campos(validarPersona(persona({ seccion: "9999" }), SECCIONES))).toEqual(["seccion"]);
    expect(validarPersona(persona({ seccion: "9999" }), new Set()).errores).toEqual([]);
    expect(validarPersona(persona({ seccion: "9999" }), null).errores).toEqual([]);
  });

  it("CURP is optional (aviso) but validated when present", () => {
    const sin = validarPersona(persona({ curp: "" }), SECCIONES);
    expect(sin.errores).toEqual([]);
    expect(sin.avisos.map((a) => a.campo)).toEqual(["curp"]);
    expect(campos(validarPersona(persona({ curp: "GODE561231HDFRRN0A" }), SECCIONES))).toEqual(["curp"]);
  });

  it("teléfono is optional (aviso) but must have 10 digits", () => {
    expect(validarPersona(persona({ telefono: "" }), SECCIONES).avisos.map((a) => a.campo)).toEqual(["telefono"]);
    expect(campos(validarPersona(persona({ telefono: "722123" }), SECCIONES))).toEqual(["telefono"]);
    expect(campos(validarPersona(persona({ telefono: "72212345678" }), SECCIONES))).toEqual(["telefono"]);
  });
});

describe("CURP_RE", () => {
  it.each([
    [CURP, true],
    ["GODE561231MDFRRN0A", false], // last char must be a digit
    ["GODE561231XDFRRN09", false], // sex must be H/M
    ["GADE561231HDFAEN09", false], // vowels where consonants go
  ])("%s → %s", (curp, ok) => {
    expect(CURP_RE.test(curp)).toBe(ok);
  });
});

describe("duplicadosEnHoja", () => {
  it("flags repeated claves and CURPs as errors and repeated names as avisos", () => {
    const filas = [
      persona(),
      persona({ apellido_paterno: "LÓPEZ", curp: "" }),
      persona({ clave_elector: "ZZZZZZ80010115H500", curp: "" }),
      personaVacia(),
      personaVacia(),
    ];
    const d = duplicadosEnHoja(filas);
    expect(d[0].errores.map((e) => e.campo)).toEqual(["clave_elector"]);
    expect(d[0].avisos.map((e) => e.campo)).toEqual(["nombres"]); // same name as row 2
    expect(d[1].errores.map((e) => e.campo)).toEqual(["clave_elector"]);
    expect(d[2].errores).toEqual([]);
    expect(d[2].avisos.map((e) => e.campo)).toEqual(["nombres"]);
    expect(d[3]).toEqual({ errores: [], avisos: [] });
  });

  it("ignores empty rows and invalid claves", () => {
    const d = duplicadosEnHoja([
      persona({ clave_elector: "ABC", curp: "" }),
      persona({ clave_elector: "ABC", curp: "", nombres: "OTRO" }),
      personaVacia(),
      personaVacia(),
    ]);
    expect(d.every((x) => x.errores.length === 0)).toBe(true);
  });
});

describe("revisarHoja", () => {
  it("includes a new titular in the duplicate check", () => {
    const r = revisarHoja(persona(), [persona({ nombres: "OTRA", curp: "" }), personaVacia()], SECCIONES);
    expect(r.titular?.errores.map((e) => e.campo)).toEqual(["clave_elector"]);
    expect(r.filas[0].errores.map((e) => e.campo)).toEqual(["clave_elector"]);
    expect(r.filas[1].vacia).toBe(true);
    expect(r.totalErrores).toBe(2);
    expect(r.filasConDatos).toBe(1);
  });

  it("an existing titular (null) is not validated", () => {
    const r = revisarHoja(null, [persona()], SECCIONES);
    expect(r.titular).toBeNull();
    expect(r.totalErrores).toBe(0);
  });
});

describe("resumenGuardado", () => {
  it("matches the copy in the spec", () => {
    expect(resumenGuardado("LIDER", true, 8)).toBe("Hoja guardada: 1 líder + 8 activistas");
    expect(resumenGuardado("LIDER", false, 1)).toBe("Hoja guardada: 1 activista");
    expect(resumenGuardado("FAMILIA", true, 7)).toBe("Hoja guardada: 1 activista + 7 promovidos");
    expect(resumenGuardado("FAMILIA", false, 3)).toBe("Hoja guardada: 3 promovidos");
    expect(resumenGuardado("LIDER", true, 0)).toBe("Hoja guardada: 1 líder");
  });
});
