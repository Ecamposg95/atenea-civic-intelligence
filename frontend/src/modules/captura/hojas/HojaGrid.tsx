import { Fragment, useRef, type KeyboardEvent } from "react";

import type { SeccionCatalogo } from "@/api/capturaHojas";

import { CampoControl, TONO_CLASE, formatoEnVivo } from "./CampoControl";
import { CAMPOS_META } from "./campos";
import type { FilaVista } from "./filaEstado";
import { BARRA_TONO, EstadoChip, MensajesFila } from "./piezas";
import { OBLIGATORIOS, type CampoPersona } from "./validation";

interface Props {
  vistas: FilaVista[];
  secciones: SeccionCatalogo[];
  /** ["activista", "activistas"] — for accessible names. */
  etiquetaFila: [string, string];
  onCampo: (fila: number, campo: CampoPersona, value: string) => void;
  onBlurCampo: (fila: number, campo: CampoPersona) => void;
  /** Enter on the last row → e.g. focus "Revisar". */
  onFinal: () => void;
}

/** Desktop: the paper as a dense, keyboard-first grid. Tab walks across a
 * row (paper order); Enter (or ↓/↑ in text cells) moves to the same column
 * in the next/previous row. */
export function HojaGrid({ vistas, secciones, etiquetaFila, onCampo, onBlurCampo, onFinal }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  function mover(fila: number, campo: CampoPersona, delta: number): boolean {
    const el = ref.current?.querySelector<HTMLElement>(`[data-cell="f${fila + delta}:${campo}"]`);
    if (el) {
      el.focus();
      return true;
    }
    return false;
  }

  function onKeyDown(fila: number, campo: CampoPersona) {
    return (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const esTexto = e.currentTarget.tagName === "INPUT" && campo !== "colonia";
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!mover(fila, campo, 1)) onFinal();
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        mover(fila, campo, -1);
      } else if (esTexto && e.key === "ArrowDown") {
        e.preventDefault();
        mover(fila, campo, 1);
      } else if (esTexto && e.key === "ArrowUp") {
        e.preventDefault();
        mover(fila, campo, -1);
      }
    };
  }

  return (
    <div
      ref={ref}
      className="max-h-[68vh] overflow-auto rounded-xl border border-line bg-panel"
      role="region"
      aria-label={`Filas de ${etiquetaFila[1]}`}
    >
      <table className="w-max min-w-full border-separate border-spacing-0 text-left">
        <caption className="sr-only">
          {`Filas de ${etiquetaFila[1]}. Enter baja a la misma columna de la siguiente fila; Mayúsculas más Enter sube.`}
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 top-0 z-20 w-[7rem] border-b border-r border-line-strong bg-panel-raised px-3 py-2.5 text-[13px] font-semibold text-ink"
            >
              Fila
            </th>
            {CAMPOS_META.map((m) => (
              <th
                key={m.campo}
                scope="col"
                className={`sticky top-0 z-10 ${m.ancho} border-b border-line-strong bg-panel-raised px-2 py-2.5 text-[13px] font-semibold text-ink`}
              >
                <abbr title={m.label} className="no-underline">{m.corto}</abbr>
                {OBLIGATORIOS.has(m.campo) && <span aria-hidden="true" className="text-state-critical"> *</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vistas.map((v, i) => {
            const zebra = i % 2 === 1 ? "bg-bg-sunken/40" : "";
            const conMensajes = v.mensajes.length > 0;
            const linea = conMensajes ? "" : "border-b border-line";
            return (
              <Fragment key={v.key}>
                <tr className={`${zebra} focus-within:bg-accent/[0.06]`}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-[5] ${linea} border-r border-line-strong bg-panel px-0 py-0 text-left align-middle`}
                  >
                    <div className="relative flex h-full min-h-[48px] items-center gap-2 pl-3 pr-2">
                      <span aria-hidden="true" className={`absolute inset-y-1 left-0 w-1 rounded-r ${BARRA_TONO[v.estado.tono]}`} />
                      <span className="w-6 text-right font-display text-base font-semibold tabular-nums text-ink">{i + 1}</span>
                      <EstadoChip estado={v.estado} className="text-[12px]" />
                    </div>
                  </th>
                  {CAMPOS_META.map((m) => {
                    const id = `${v.key}-${m.campo}`;
                    const fmt = formatoEnVivo(m.campo, v.persona[m.campo]);
                    const conContador = m.campo === "clave_elector" || m.campo === "curp";
                    const contadorId = conContador && fmt ? `${id}-fmt` : null;
                    // The first cell carries the whole row's messages; the
                    // others only the messages about themselves.
                    const describedBy = [contadorId,
                      m.campo === "apellido_paterno" && v.mensajesId ? v.mensajesId : v.describedBy[m.campo]]
                      .filter(Boolean).join(" ");
                    return (
                      <td key={m.campo} className={`${linea} relative p-0.5 align-middle`}>
                        <CampoControl
                          campo={m.campo}
                          id={id}
                          dataCell={`f${i}:${m.campo}`}
                          value={v.persona[m.campo]}
                          onChange={(val) => onCampo(i, m.campo, val)}
                          onBlur={() => onBlurCampo(i, m.campo)}
                          onKeyDown={onKeyDown(i, m.campo)}
                          secciones={secciones}
                          invalid={v.invalidos.has(m.campo)}
                          describedBy={describedBy}
                          ariaLabel={`${m.label}, ${etiquetaFila[0]} ${i + 1}`}
                          className={contadorId ? "pb-2.5" : undefined}
                          variante="celda"
                        />
                        {contadorId && fmt && v.persona[m.campo] && (
                          <span
                            id={contadorId}
                            className={`pointer-events-none absolute bottom-[3px] right-2.5 text-[10.5px] leading-none font-semibold tabular-nums ${TONO_CLASE[fmt.tono]}`}
                          >
                            {fmt.texto}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {conMensajes && (
                  <tr className={zebra}>
                    <td className="sticky left-0 z-[5] border-b border-r border-line-strong bg-panel" />
                    <td colSpan={CAMPOS_META.length} className="border-b border-line px-2 pb-2.5 pt-0.5">
                      <MensajesFila id={v.mensajesId} mensajes={v.mensajes} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
