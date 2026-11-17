import type { TipoHoja } from "@/api/capturaHojas";

const OPCIONES: { tipo: TipoHoja; titulo: string; detalle: string }[] = [
  { tipo: "LIDER", titulo: "Hoja de líder", detalle: "Formato C1: un líder y hasta 10 activistas" },
  { tipo: "FAMILIA", titulo: "Hoja de familia", detalle: "Formato Activista: un activista y hasta 7 promovidos" },
];

interface Props {
  tipo: TipoHoja;
  onCambiar: (t: TipoHoja) => void;
  /** Sheets with unsaved rows (marked so switching never feels like losing work). */
  pendientes: Record<TipoHoja, boolean>;
}

/** The big two-way choice at the top: a native radio group (arrow keys work). */
export function TipoHojaSelector({ tipo, onCambiar, pendientes }: Props) {
  return (
    <fieldset>
      <legend className="sr-only">¿Qué hoja vas a capturar?</legend>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {OPCIONES.map((o) => {
          const activo = o.tipo === tipo;
          return (
            <label
              key={o.tipo}
              className={`relative flex min-h-[64px] cursor-pointer flex-col justify-center rounded-xl border-2 px-3.5 py-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent sm:px-5 ${
                activo ? "border-accent-strong bg-accent/10" : "border-line-strong bg-panel hover:bg-panel-hover"
              }`}
            >
              <input
                type="radio"
                name="tipo-hoja"
                value={o.tipo}
                checked={activo}
                onChange={() => onCambiar(o.tipo)}
                className="sr-only"
              />
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                    activo ? "border-accent-strong" : "border-ink-muted"
                  }`}
                >
                  {activo && <span className="h-2.5 w-2.5 rounded-full bg-accent-strong" />}
                </span>
                <span className="font-display text-base font-semibold text-ink sm:text-lg">{o.titulo}</span>
              </span>
              <span className="mt-0.5 pl-7 text-[13px] leading-snug text-ink-muted sm:text-sm">{o.detalle}</span>
              {pendientes[o.tipo] && !activo && (
                <span className="mt-1 pl-7 text-[13px] font-semibold text-state-warning">Tiene filas sin guardar</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
