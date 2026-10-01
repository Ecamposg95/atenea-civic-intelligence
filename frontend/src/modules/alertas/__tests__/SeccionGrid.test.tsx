import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SeccionGrid } from "../SeccionGrid";

describe("SeccionGrid", () => {
  it("pinta una celda por sección, con color de severidad y etiqueta accesible", () => {
    const html = renderToStaticMarkup(
      <SeccionGrid
        secciones={[
          { seccion: "4121", severidad_max: "critica" },
          { seccion: "4122", severidad_max: null },
        ]}
        seleccion={null}
        onSelect={() => {}}
      />,
    );
    expect(html).toContain("4121");
    expect(html).toContain("4122");
    expect(html).toContain("--c-critical");
    expect(html).toContain("Sección 4121: alerta crítica");
    expect(html).toContain("Sección 4122: sin alertas");
  });
});
