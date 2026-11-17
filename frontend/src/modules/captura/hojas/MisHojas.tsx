import type { HojaResumen } from "@/api/capturaHojas";

import { BTN_TEXTO } from "./campos";
import { etiquetaPersonas } from "./validation";

interface Props {
  hojas: HojaResumen[] | null;
  error: string | null;
  onReintentar: () => void;
}

const rtf = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });

export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const seg = Math.round((t - ahora.getTime()) / 1000);
  const abs = Math.abs(seg);
  if (abs < 60) return "hace un momento";
  if (abs < 3600) return rtf.format(Math.round(seg / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seg / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(seg / 86400), "day");
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** The capturista's last saved sheets (counts only, no personal data). */
export function MisHojas({ hojas, error, onReintentar }: Props) {
  return (
    <section aria-labelledby="mis-hojas-titulo" className="rounded-xl border border-line bg-panel p-4">
      <h2 id="mis-hojas-titulo" className="font-display text-base font-semibold text-ink">
        Mis hojas recientes
      </h2>
      {error ? (
        <div className="mt-2">
          <p className="text-sm text-state-critical">No se pudieron cargar tus hojas: {error}</p>
          <button type="button" className={BTN_TEXTO} onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : hojas === null ? (
        <p className="mt-2 text-sm text-ink-muted">Cargando…</p>
      ) : hojas.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          Aún no guardas hojas en esta campaña. Cada hoja que guardes aparecerá aquí.
        </p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {hojas.map((h) => {
            const tipo = h.tipo_hoja === "FAMILIA" ? "FAMILIA" : "LIDER";
            return (
              <li key={h.hoja_id} className="py-2.5">
                <p className="truncate text-[15px] font-semibold text-ink">{h.titular_nombre || "Sin titular"}</p>
                <p className="text-[13px] text-ink-muted">
                  {tipo === "LIDER" ? "Hoja C1" : "Hoja de familia"}
                  {", "}
                  {etiquetaPersonas(tipo, "fila", h.filas)}
                  {h.titular_nuevo ? `, ${tipo === "LIDER" ? "líder nuevo" : "activista nuevo"}` : ""}
                </p>
                <p className="text-[13px] text-ink-muted">
                  <time dateTime={h.created_at}>{haceCuanto(h.created_at)}</time>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
