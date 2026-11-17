import type { SeccionCatalogo } from "@/api/capturaHojas";

import { FOCO } from "./campos";
import type { FilaVista } from "./filaEstado";
import { BARRA_TONO, EstadoChip } from "./piezas";
import { PersonaCampos } from "./PersonaCampos";
import { nombreCompleto, type CampoPersona } from "./validation";

interface Props {
  vistas: FilaVista[];
  secciones: SeccionCatalogo[];
  abierta: number | null;
  onAbrir: (fila: number | null) => void;
  etiquetaFila: [string, string];
  onCampo: (fila: number, campo: CampoPersona, value: string) => void;
  onBlurCampo: (fila: number, campo: CampoPersona) => void;
  /** Enter on the last field of the last card. */
  onFinal: () => void;
}

function enfocarPrimerCampo(fila: number) {
  // Wait for the card to render, then focus + bring it into view.
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-cell="f${fila}:apellido_paterno"]`);
    el?.focus();
    el?.closest("[data-tarjeta]")?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

/** Phones: each paper row is a collapsible card ("Persona 3, incompleta");
 * only one is open at a time so the keyboard never hides what you type. */
export function HojaTarjetas({ vistas, secciones, abierta, onAbrir, etiquetaFila, onCampo, onBlurCampo, onFinal }: Props) {
  const singular = etiquetaFila[0].charAt(0).toUpperCase() + etiquetaFila[0].slice(1);
  return (
    <ol className="space-y-2.5" aria-label={`Filas de ${etiquetaFila[1]}`}>
      {vistas.map((v, i) => {
        const open = abierta === i;
        const nombre = nombreCompleto(v.persona);
        const panelId = `${v.key}-panel`;
        return (
          <li
            key={v.key}
            data-tarjeta
            className={`relative scroll-mt-4 overflow-hidden rounded-xl border bg-panel ${
              open ? "border-accent/60 shadow-panel" : "border-line"
            }`}
          >
            <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${BARRA_TONO[v.estado.tono]}`} />
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => {
                  if (open) onAbrir(null);
                  else {
                    onAbrir(i);
                    enfocarPrimerCampo(i);
                  }
                }}
                className={`flex min-h-[56px] w-full items-center gap-3 py-2.5 pl-5 pr-4 text-left ${FOCO} focus-visible:-outline-offset-2`}
              >
                <span className="font-display text-lg font-semibold tabular-nums text-ink" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">
                    {nombre || `${singular} ${i + 1}`}
                    <span className="sr-only">{nombre ? `, ${etiquetaFila[0]} ${i + 1}` : ""}</span>
                  </span>
                  <EstadoChip estado={v.estado} />
                  {!open && v.mensajes.length > 0 && (
                    <span className="ml-2 text-[13px] text-ink-muted">
                      {v.mensajes.length === 1 ? "1 mensaje" : `${v.mensajes.length} mensajes`}
                    </span>
                  )}
                </span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className={`h-5 w-5 shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
                >
                  <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </h3>
            <div id={panelId} hidden={!open} className="border-t border-line px-4 pb-4 pl-5 pt-4">
              {open && (
                <PersonaCampos
                  vista={v}
                  idPrefix={v.key}
                  secciones={secciones}
                  onCampo={(c, val) => onCampo(i, c, val)}
                  onBlurCampo={(c) => onBlurCampo(i, c)}
                  onFin={() => {
                    if (i < vistas.length - 1) {
                      onAbrir(i + 1);
                      enfocarPrimerCampo(i + 1);
                    } else onFinal();
                  }}
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
