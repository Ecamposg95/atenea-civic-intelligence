import { useRef, type KeyboardEvent } from "react";

import type { SeccionCatalogo } from "@/api/capturaHojas";

import { CampoControl, TONO_CLASE, formatoEnVivo } from "./CampoControl";
import { CAMPOS_META } from "./campos";
import type { FilaVista } from "./filaEstado";
import { OBLIGATORIOS, type CampoPersona } from "./validation";

interface Props {
  vista: FilaVista;
  idPrefix: string;
  secciones: SeccionCatalogo[];
  onCampo: (campo: CampoPersona, value: string) => void;
  onBlurCampo: (campo: CampoPersona) => void;
  /** Enter on the last field (e.g. open the next card). */
  onFin?: () => void;
  /** "tarjeta" = one column on phones; "ancho" = denser grid for the titular. */
  disposicion?: "tarjeta" | "ancho";
}

/** The 10 paper fields as large, labelled inputs (mobile cards and the new
 * titular form). Each field shows its own messages right under it. */
export function PersonaCampos({ vista, idPrefix, secciones, onCampo, onBlurCampo, onFin, disposicion = "tarjeta" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const campoIds = new Set(CAMPOS_META.map((m) => m.campo));
  const sueltos = vista.mensajes.filter((m) => !m.campo || !campoIds.has(m.campo));

  function onKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-cell]") ?? []);
    const i = items.indexOf(e.currentTarget);
    if (i >= 0 && i < items.length - 1) items[i + 1].focus();
    else onFin?.();
  }

  const grid =
    disposicion === "ancho"
      ? "grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 xl:grid-cols-5"
      : "grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4";

  return (
    <div ref={ref}>
      <div className={grid}>
        {CAMPOS_META.map((m) => {
          const id = `${idPrefix}-${m.campo}`;
          const value = vista.persona[m.campo];
          const fmt = formatoEnVivo(m.campo, value);
          const propios = vista.mensajes.filter((x) => x.campo === m.campo);
          const hintId = fmt || m.campo === "seccion" ? `${id}-hint` : null;
          const describedBy = [hintId, vista.describedBy[m.campo]].filter(Boolean).join(" ");
          const span = m.ancha ? "col-span-2" : "col-span-1";
          return (
            <div key={m.campo} className={span}>
              <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
                {m.label}
                {OBLIGATORIOS.has(m.campo) && (
                  <>
                    <span className="text-state-critical" aria-hidden="true"> *</span>
                    <span className="sr-only"> (obligatorio)</span>
                  </>
                )}
              </label>
              <CampoControl
                campo={m.campo}
                id={id}
                dataCell={`${idPrefix}:${m.campo}`}
                value={value}
                onChange={(v) => onCampo(m.campo, v)}
                onBlur={() => onBlurCampo(m.campo)}
                onKeyDown={onKeyDown}
                secciones={secciones}
                invalid={vista.invalidos.has(m.campo)}
                describedBy={describedBy}
                variante="campo"
              />
              {hintId && (
                <p id={hintId} className={`mt-1 text-[13px] ${fmt ? TONO_CLASE[fmt.tono] : "text-ink-muted"}`}>
                  {m.campo === "seccion" ? "La que dice la credencial" : fmt?.texto}
                </p>
              )}
              {propios.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {propios.map((x) => (
                    <li
                      key={x.id}
                      id={x.id}
                      className={`text-[13px] font-medium ${x.tono === "error" ? "text-state-critical" : "text-state-warning"}`}
                    >
                      <span className="sr-only">{x.tono === "error" ? "Error: " : "Aviso: "}</span>
                      {x.texto}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {sueltos.length > 0 && (
        <ul className="mt-3 space-y-1">
          {sueltos.map((x) => (
            <li
              key={x.id}
              id={x.id}
              className={`text-[13px] font-medium ${x.tono === "error" ? "text-state-critical" : "text-state-warning"}`}
            >
              <span className="sr-only">{x.tono === "error" ? "Error: " : "Aviso: "}</span>
              {x.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
