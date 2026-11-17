/**
 * Crédito "Desarrollado por Atlas Tech".
 *
 * Usa la identidad Atlas Tech (Teal Aurora: panel #1E1E22, borde #2A2A32,
 * regla aurora, wordmark ATLAS_TECH en Montserrat). Estos colores viven SOLO
 * en este badge: el resto de la app conserva el azul de campaña.
 * Los colores son fijos (no dependen del tema) para que la marca sea idéntica
 * en claro y oscuro.
 */

const AURORA = "linear-gradient(90deg,#00C9B1 0%,#00E5FF 30%,#7B2FBE 65%,#C026D3 100%)";
const VERSION = "v0.2.0";

export function AtlasMark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 375.71 340"
      height={size}
      width={(size * 375.71) / 340}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g fill="currentColor">
        <polygon points="252.36 236.3 195.47 110.84 140.66 236.21 98.8 235.8 174.88 71.93 216.92 71.85 295.23 235.73 252.36 236.3" />
        <polygon points="235.1 264.18 156.85 264.18 169.04 236.37 222.59 236.45 235.1 264.18" />
        <path d="M322.77,271.46c-5.63,7.02-12.31,13.43-18.68,19.74-31,30.74-75.65,46.25-119.14,44.73-92.04-3.23-164.14-80-162.22-171.68C24.29,89.2,76.26,23.61,149.63,4.95,164.96,1.05,180.47-.39,196.78.09c49.74,1.45,95.91,25.54,126.33,64.35,47.43,60.52,48.14,146.58-.34,207.02ZM285.77,268.38c61.55-58.4,56.66-157.12-9.84-209.36-54.27-42.64-132.41-38.36-181.82,10.11-54.43,53.4-55.5,140.38-2.56,195.07,52.52,54.26,139.28,56.32,194.22,4.19Z" />
      </g>
    </svg>
  );
}

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-atlas tracking-[0.08em] ${className}`}>
      <span aria-hidden="true">
        <span className="font-extrabold">ATLAS</span>
        <span className="font-normal">_TECH</span>
      </span>
      <span className="sr-only">Atlas Tech</span>
    </span>
  );
}

/**
 * `badge`  — bloque destacado (pie del Sidebar, Login).
 * `inline` — línea discreta (pie del contenido en móvil).
 */
export function AtlasCredit({
  variant = "badge",
  className = "",
}: {
  variant?: "badge" | "inline";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <p
        className={`flex items-center justify-center gap-2 text-[12px] text-ink-muted ${className}`}
      >
        <AtlasMark size={14} className="text-ink" />
        <span>Desarrollado por</span>
        <Wordmark className="text-[12px] text-ink" />
        <span
          aria-hidden="true"
          className="h-[2px] w-6 rounded-full"
          style={{ background: AURORA }}
        />
      </p>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-[4px] border ${className}`}
      style={{ background: "#141416", borderColor: "#2A2A32", color: "#E8E8EA" }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: AURORA }}
      />
      <div className="flex items-center gap-3 px-3.5 pb-3 pt-[15px]">
        <AtlasMark size={30} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="font-atlas text-[11px] font-medium" style={{ color: "#A3A3AE" }}>
            Desarrollado por
          </div>
          <Wordmark className="text-[16px]" />
        </div>
        <span className="font-atlas text-[10px] font-medium" style={{ color: "#A3A3AE" }}>
          {VERSION}
        </span>
      </div>
    </div>
  );
}
