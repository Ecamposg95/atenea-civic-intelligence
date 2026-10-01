import { describe, expect, it } from "vitest";
import { campaignSubtitle, pickDefaultCode } from "../regionHelpers";

const region = {
  region: "Atizapán y periferia",
  municipios: [
    { code: "15013", name: "Atizapán", es_campana: true },
    { code: "15104", name: "Tlalnepantla", es_campana: false },
  ],
};

describe("pickDefaultCode", () => {
  it("prefers the campaign municipio", () => {
    expect(pickDefaultCode(region as never, "15013")).toBe("15013");
  });
  it("falls back to es_campana, then first", () => {
    expect(pickDefaultCode(region as never, null)).toBe("15013");
    expect(pickDefaultCode({ region: "x", municipios: [region.municipios[1]] } as never, null)).toBe("15104");
    expect(pickDefaultCode({ region: "x", municipios: [] }, null)).toBeNull();
  });
});

describe("campaignSubtitle", () => {
  it("formats candidato and partido", () => {
    expect(campaignSubtitle({ name: "Atizapán 2027", candidato: "Luis Montaño", partido: "Morena-PVEM-PT" } as never))
      .toBe("Atizapán 2027 · Luis Montaño (Morena-PVEM-PT)");
    expect(campaignSubtitle({ name: "Alpha", candidato: "X" } as never)).toBe("Alpha · X");
    expect(campaignSubtitle({ name: "Alpha" } as never)).toBeNull();
    expect(campaignSubtitle(undefined)).toBeNull();
  });
});
