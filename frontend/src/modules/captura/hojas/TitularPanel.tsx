import type { FilaResultado, PersonaBusqueda, SeccionCatalogo, TipoHoja } from "@/api/capturaHojas";

import { BTN_SECUNDARIO, BTN_TEXTO } from "./campos";
import type { TitularState } from "./estado";
import type { FilaVista } from "./filaEstado";
import { EstadoChip } from "./piezas";
import { PersonaBuscador } from "./PersonaBuscador";
import { PersonaCampos } from "./PersonaCampos";
import { MAX_FILAS, type CampoPersona } from "./validation";

export const TEXTOS_TITULAR: Record<
  TipoHoja,
  { titulo: string; ayuda: string; buscar: string; nuevo: string; hijos: [string, string] }
> = {
  LIDER: {
    titulo: "Líder de la hoja",
    ayuda: "Es quien encabeza el Formato C1.",
    buscar: "Buscar un líder ya capturado",
    nuevo: "Capturar líder nuevo",
    hijos: ["activista", "activistas"],
  },
  FAMILIA: {
    titulo: "Activista, jefe de familia",
    ayuda: "Es la fila sombreada al inicio del Formato Activista.",
    buscar: "Buscar un activista ya capturado",
    nuevo: "Capturar activista nuevo",
    hijos: ["promovido", "promovidos"],
  },
};

interface Props {
  tipo: TipoHoja;
  titular: TitularState;
  onCambiar: (t: TitularState) => void;
  vistaNuevo: FilaVista;
  servidor: FilaResultado | null;
  secciones: SeccionCatalogo[];
  onCampo: (campo: CampoPersona, value: string) => void;
  onBlurCampo: (campo: CampoPersona) => void;
  /** Show the "falta el líder" error for a new activista. */
  faltaLider: boolean;
}

/** The shaded first band of the paper: who the sheet belongs to. Stays
 * selected between sheets so several sheets of the same person go fast. */
export function TitularPanel({
  tipo, titular, onCambiar, vistaNuevo, servidor, secciones, onCampo, onBlurCampo, faltaLider,
}: Props) {
  const tx = TEXTOS_TITULAR[tipo];
  const tipoPersona = tipo === "LIDER" ? "LIDER" : "ACTIVISTA";
  const ex = titular.existente;
  const liderErrorId = "titular-lider-error";

  return (
    <section
      aria-labelledby="titular-titulo"
      className="relative rounded-xl border border-line-strong bg-panel-raised px-4 py-4 sm:px-5"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 rounded-l-xl bg-accent-strong" />
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id="titular-titulo" className="font-display text-lg font-semibold text-ink">{tx.titulo}</h2>
          <p className="text-[13px] text-ink-muted">{tx.ayuda}</p>
        </div>
        {titular.modo === "nuevo" && vistaNuevo.estado.tono !== "vacia" && (
          <EstadoChip estado={vistaNuevo.estado} />
        )}
      </div>

      {titular.modo === "buscar" && ex && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-ink">{ex.nombre_completo}</p>
            <p className="text-sm text-ink-muted">
              {[
                ex.seccion ? `Sección ${ex.seccion}` : null,
                `ya tiene ${ex.hijos} de ${MAX_FILAS[tipo]} ${tx.hijos[1]}`,
                tipo === "FAMILIA" && ex.padre_nombre ? `líder ${ex.padre_nombre}` : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            {servidor && servidor.mensajes.length > 0 && (
              <ul className="mt-1 text-[13px] font-medium text-state-critical">
                {servidor.mensajes.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            className={BTN_SECUNDARIO}
            onClick={() => onCambiar({ ...titular, existente: null })}
          >
            Cambiar
            <span className="sr-only"> {tx.titulo.toLowerCase()}</span>
          </button>
        </div>
      )}

      {titular.modo === "buscar" && !ex && (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,28rem)_auto] sm:items-end">
          <PersonaBuscador
            tipo={tipoPersona}
            label={tx.buscar}
            hijosEtiqueta={tx.hijos}
            onElegir={(p: PersonaBusqueda) => onCambiar({ ...titular, existente: p })}
            invalid={Boolean(servidor && servidor.estado === "error")}
          />
          <button type="button" className={BTN_SECUNDARIO} onClick={() => onCambiar({ ...titular, modo: "nuevo" })}>
            <span aria-hidden="true" className="text-lg leading-none">+</span>
            {tx.nuevo}
          </button>
          {servidor && servidor.mensajes.length > 0 && (
            <ul className="text-[13px] font-medium text-state-critical sm:col-span-2" role="alert">
              {servidor.mensajes.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {titular.modo === "nuevo" && (
        <div className="space-y-4">
          {tipo === "FAMILIA" && (
            <div className="rounded-lg border border-line bg-panel px-4 py-3">
              {titular.lider ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[15px] text-ink">
                    <span className="text-ink-muted">Su líder: </span>
                    <span className="font-semibold">{titular.lider.nombre_completo}</span>
                  </p>
                  <button type="button" className={BTN_TEXTO} onClick={() => onCambiar({ ...titular, lider: null })}>
                    Cambiar líder
                  </button>
                </div>
              ) : (
                <>
                  <PersonaBuscador
                    tipo="LIDER"
                    label="¿De qué líder es este activista?"
                    hint="Obligatorio. Si el líder no aparece, captura primero su hoja C1."
                    hijosEtiqueta={["activista", "activistas"]}
                    onElegir={(p) => onCambiar({ ...titular, lider: p })}
                    invalid={faltaLider}
                    errorId={liderErrorId}
                  />
                  {faltaLider && (
                    <p id={liderErrorId} className="mt-1.5 text-[13px] font-medium text-state-critical">
                      Elige el líder del activista
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          <PersonaCampos
            vista={vistaNuevo}
            idPrefix="t"
            secciones={secciones}
            onCampo={onCampo}
            onBlurCampo={onBlurCampo}
            disposicion="ancho"
          />
          <button type="button" className={BTN_TEXTO} onClick={() => onCambiar({ ...titular, modo: "buscar" })}>
            {tx.buscar.replace("Buscar", "Mejor buscar")}
          </button>
        </div>
      )}
    </section>
  );
}
