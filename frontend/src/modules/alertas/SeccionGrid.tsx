import type { SeccionSeveridad } from "@/api/alertas";
import { SEVERIDAD } from "./logic";

export function SeccionGrid({
  secciones,
  seleccion,
  onSelect,
}: {
  secciones: SeccionSeveridad[];
  seleccion: string | null;
  onSelect: (seccion: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-11">
      {secciones.map((c) => {
        const sev = c.severidad_max ? SEVERIDAD[c.severidad_max] : null;
        const activa = seleccion === c.seccion;
        return (
          <button
            key={c.seccion}
            type="button"
            onClick={() => onSelect(c.seccion)}
            aria-pressed={activa}
            aria-label={`Sección ${c.seccion}: ${sev ? `alerta ${sev.label.toLowerCase()}` : "sin alertas"}`}
            className={`focus-ring rounded-lg border px-2 py-3 text-center text-sm font-semibold tabular-nums transition-colors ${
              activa ? "border-ink" : "border-line"
            }`}
            style={sev ? { background: sev.color, color: "white" } : undefined}
          >
            {c.seccion}
          </button>
        );
      })}
    </div>
  );
}
