import { describe, it, expect } from "vitest";
import { parseIne } from "../ocr";

// Mock OCR text resembling a raw Tesseract dump of an INE credential.
// parseIne is pure — no real OCR runs in this test.
const SAMPLE_INE_TEXT = `
INSTITUTO NACIONAL ELECTORAL
CREDENCIAL PARA VOTAR
NOMBRE
GARCIA LOPEZ MARIA FERNANDA
DOMICILIO
CALLE FICTICIA 123 COL CENTRO
CP 50000 TOLUCA, MEX
CLAVE DE ELECTOR AB12CD34EF56GH78IJ
CURP GRLM850101MMCXXX09
AÑO DE REGISTRO 2018
SECCION 4127
`;

describe("parseIne", () => {
  it("extracts nombre, curp, clave, seccion and domicilio from OCR text", () => {
    const fields = parseIne(SAMPLE_INE_TEXT);

    expect(fields.nombre).toBe("GARCIA LOPEZ MARIA FERNANDA");
    expect(fields.curp).toBe("GRLM850101MMCXXX09");
    expect(fields.clave).toBe("AB12CD34EF56GH78IJ");
    expect(fields.seccion).toBe("4127");
    expect(fields.domicilio).toContain("CALLE FICTICIA 123");
    expect(fields.domicilio).toContain("TOLUCA");
  });

  it("is case-insensitive (lowercase OCR noise is normalized)", () => {
    const lower = SAMPLE_INE_TEXT.toLowerCase();
    const fields = parseIne(lower);

    expect(fields.curp).toBe("GRLM850101MMCXXX09");
    expect(fields.seccion).toBe("4127");
  });

  it("matches SECCION with an accented Ó and no separator", () => {
    const fields = parseIne("SECCIÓN4127\nCURP GRLM850101MMCXXX09");
    expect(fields.seccion).toBe("4127");
  });

  it("falls back to a bare 18-char token for clave when there is no explicit label", () => {
    const text = "CURP GRLM850101MMCXXX09\nAB12CD34EF56GH78IJ\nSECCION 4127";
    const fields = parseIne(text);

    expect(fields.curp).toBe("GRLM850101MMCXXX09");
    expect(fields.clave).toBe("AB12CD34EF56GH78IJ");
  });

  it("omits fields it cannot confidently find instead of guessing", () => {
    const fields = parseIne("INSTITUTO NACIONAL ELECTORAL\nCREDENCIAL PARA VOTAR");

    expect(fields.nombre).toBeUndefined();
    expect(fields.curp).toBeUndefined();
    expect(fields.clave).toBeUndefined();
    expect(fields.seccion).toBeUndefined();
    expect(fields.domicilio).toBeUndefined();
  });

  it("does not throw on empty input", () => {
    expect(() => parseIne("")).not.toThrow();
    expect(parseIne("")).toEqual({});
  });
});
