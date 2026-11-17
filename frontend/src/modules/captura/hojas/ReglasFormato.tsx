import { FOCO } from "./campos";

const REGLAS = [
  "Cada familia la encabeza su jefe de familia (el activista).",
  "Se le explica a cada persona para qué se usan sus datos.",
  "Sin nombres duplicados.",
  "Letra legible.",
  "Datos completos, con clave de elector.",
  "Credencial vigente para 2027.",
  "Teléfono de 10 dígitos.",
];

/** The 7 rules printed on the Carpeta de Activismo, collapsed by default. */
export function ReglasFormato() {
  return (
    <details className="group rounded-xl border border-line bg-panel">
      <summary
        className={`flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden ${FOCO}`}
      >
        Reglas del formato
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 text-ink-muted transition-transform group-open:rotate-180">
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-3">
        <ol className="list-decimal space-y-1 pl-5 text-[15px] leading-relaxed text-ink marker:font-semibold marker:text-ink-muted">
          {REGLAS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
        <p className="mt-3 text-[15px] font-semibold text-ink">
          La sección que vale es la de la credencial, aunque la persona viva en otra.
        </p>
      </div>
    </details>
  );
}
