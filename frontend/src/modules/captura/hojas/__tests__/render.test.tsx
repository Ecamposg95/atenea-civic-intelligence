import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { HojaGrid } from "../HojaGrid";
import { HojaTarjetas } from "../HojaTarjetas";
import { vistaFila } from "../filaEstado";
import { filasVacias, personaVacia, validarPersona } from "../validation";

// vitest runs in "node" (no jsdom): assert on server-rendered markup.
const SECCIONES = [{ seccion: "4114", barrio: "San Juan", region: "R-1" }];

function vistas() {
  const filas = filasVacias(3);
  filas[1] = { ...personaVacia(), nombres: "ANA", telefono: "722" };
  return filas.map((p, i) => vistaFila(`f${i}`, p, validarPersona(p), null, new Set(), true));
}

const noop = () => {};

describe("HojaGrid", () => {
  it("labels every cell and ties errors with aria-describedby", () => {
    const html = renderToStaticMarkup(
      <HojaGrid vistas={vistas()} secciones={SECCIONES} etiquetaFila={["activista", "activistas"]}
        onCampo={noop} onBlurCampo={noop} onFinal={noop} />,
    );
    expect(html).toContain('aria-label="Apellido paterno, activista 2"');
    expect(html).toContain('aria-describedby="f1-msgs"');
    expect(html).toContain('id="f1-msgs"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("4114 San Juan");
    expect(html).toContain('data-cell="f2:telefono"');
    expect(html).toContain('inputMode="numeric"');
  });
});

describe("HojaTarjetas", () => {
  it("renders one collapsible card per row with only the open one expanded", () => {
    const html = renderToStaticMarkup(
      <HojaTarjetas vistas={vistas()} secciones={SECCIONES} abierta={1} onAbrir={noop}
        etiquetaFila={["promovido", "promovidos"]} onCampo={noop} onBlurCampo={noop} onFinal={noop} />,
    );
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(html).toContain("incompleta");
    expect(html).toContain('for="f1-clave_elector"');
    expect(html).toContain('autoCapitalize="characters"');
  });
});
