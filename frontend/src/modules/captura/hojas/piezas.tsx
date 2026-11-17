import type { EstadoFilaVista, MensajeVista, TonoEstado } from "./filaEstado";

/** Left-edge bar color per row tone (the paper-margin stripe). */
export const BARRA_TONO: Record<TonoEstado, string> = {
  vacia: "bg-transparent",
  neutro: "bg-line-strong",
  lista: "bg-state-ok/60",
  ok: "bg-state-ok",
  aviso: "bg-state-warning",
  error: "bg-state-critical",
};

const PUNTO_TONO: Record<TonoEstado, string> = {
  vacia: "border border-line-strong bg-transparent",
  neutro: "bg-ink-muted",
  lista: "bg-state-ok/70",
  ok: "bg-state-ok",
  aviso: "bg-state-warning",
  error: "bg-state-critical",
};

const TEXTO_TONO: Record<TonoEstado, string> = {
  vacia: "text-ink-muted",
  neutro: "text-ink-muted",
  lista: "text-ink",
  ok: "text-ink",
  aviso: "text-state-warning",
  error: "text-state-critical",
};

/** Status in words + a dot (color is never the only signal). */
export function EstadoChip({ estado, className = "" }: { estado: EstadoFilaVista; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${TEXTO_TONO[estado.tono]} ${className}`}>
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO_TONO[estado.tono]}`} />
      {estado.texto}
    </span>
  );
}

/** Row messages; every item has an id so inputs can point at it with
 * aria-describedby. */
export function MensajesFila({ id, mensajes, className = "" }: { id: string | null; mensajes: MensajeVista[]; className?: string }) {
  if (!id || mensajes.length === 0) return null;
  return (
    <ul id={id} className={`flex flex-wrap gap-x-4 gap-y-1 text-[13px] leading-snug ${className}`}>
      {mensajes.map((m) => (
        <li
          key={m.id}
          id={m.id}
          className={`flex items-start gap-1.5 font-medium ${m.tono === "error" ? "text-state-critical" : "text-state-warning"}`}
        >
          <span aria-hidden="true" className="mt-[1px] font-bold">{m.tono === "error" ? "✕" : "!"}</span>
          <span>
            <span className="sr-only">{m.tono === "error" ? "Error: " : "Aviso: "}</span>
            {m.texto}
          </span>
        </li>
      ))}
    </ul>
  );
}
