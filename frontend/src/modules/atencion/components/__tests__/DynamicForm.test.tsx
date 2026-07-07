import { renderToStaticMarkup } from "react-dom/server";
import type { FormSchema } from "@/api/atencion";
import { DynamicForm, validate } from "../DynamicForm";

// Schema: a required text field, plus a select field gated by mostrar_si on
// the text field's value — mirrors backend app/services/form_schema.py.
const schema: FormSchema = {
  secciones: [
    {
      titulo: "Datos generales",
      campos: [
        { key: "nombre", tipo: "text", label: "Nombre", requerido: true },
        {
          key: "detalle",
          tipo: "select",
          label: "Detalle",
          opciones: ["A", "B"],
          mostrar_si: { campo: "nombre", igual: "mostrar" },
        },
      ],
    },
  ],
};

describe("DynamicForm rendering", () => {
  it("hides the gated field when the trigger value does not match", () => {
    const html = renderToStaticMarkup(
      <DynamicForm schema={schema} value={{ nombre: "algo" }} onChange={() => {}} />,
    );
    expect(html).toContain("Nombre");
    expect(html).not.toContain("Detalle");
  });

  it("shows the gated field once the trigger equals the configured value", () => {
    const html = renderToStaticMarkup(
      <DynamicForm schema={schema} value={{ nombre: "mostrar" }} onChange={() => {}} />,
    );
    expect(html).toContain("Nombre");
    expect(html).toContain("Detalle");
  });

  it("renders an error message passed via the errors prop", () => {
    const html = renderToStaticMarkup(
      <DynamicForm
        schema={schema}
        value={{}}
        onChange={() => {}}
        errors={{ nombre: "Nombre es requerido" }}
      />,
    );
    expect(html).toContain("Nombre es requerido");
  });
});

describe("validate", () => {
  it("flags a missing required field", () => {
    const errors = validate(schema, {});
    expect(errors.nombre).toBe("Nombre es requerido");
  });

  it("does not flag a required field that has a value", () => {
    const errors = validate(schema, { nombre: "algo" });
    expect(errors.nombre).toBeUndefined();
  });

  it("does not validate a field hidden by mostrar_si even if required", () => {
    const gatedRequired: FormSchema = {
      secciones: [
        {
          titulo: "Sección",
          campos: [
            { key: "trigger", tipo: "text", label: "Disparador" },
            {
              key: "condicional",
              tipo: "text",
              label: "Condicional",
              requerido: true,
              mostrar_si: { campo: "trigger", igual: "si" },
            },
          ],
        },
      ],
    };
    // Not visible (trigger !== "si") -> no error even though requerido.
    expect(validate(gatedRequired, {})).toEqual({});
    // Visible now -> required error appears.
    expect(validate(gatedRequired, { trigger: "si" }).condicional).toBe(
      "Condicional es requerido",
    );
  });
});
