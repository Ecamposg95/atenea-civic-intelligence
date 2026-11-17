/**
 * Crédito "Desarrollado por Atlas Tech".
 *
 * Identidad Atlas Horizon: negro #050505, vidrio con borde translúcido, luz
 * ámbar en el horizonte (#FF6A1F → #FFD3A8), Inter ligera (nunca 700).
 * Lockup "Atlas Tech" (Atlas 500, Tech 300 en gris cálido).
 * Estos colores viven SOLO en este crédito: el resto de la app conserva el
 * azul de campaña. Son fijos (no dependen del tema) para que la marca sea
 * idéntica en claro y oscuro.
 */

const HORIZON = {
  black: "#050505",
  glassLine: "rgba(255,255,255,.12)",
  ink: "#F5F2EE",
  muted: "#A8A29A",
  dim: "#6E6862",
  glow: "#FFD3A8",
} as const;
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

/** Lockup "Atlas Tech". "Atlas" hereda `currentColor`; "Tech" va más tenue. */
function Wordmark({ className = "", subColor }: { className?: string; subColor?: string }) {
  return (
    <span className={`font-atlas whitespace-nowrap tracking-[-0.01em] ${className}`}>
      <span className="font-medium">Atlas</span>{" "}
      <span className="font-light" style={subColor ? { color: subColor } : { opacity: 0.7 }}>
        Tech
      </span>
    </span>
  );
}

/**
 * `badge`  — bloque Horizon destacado (pie del Sidebar, Login).
 * `inline` — línea discreta (pie del contenido en móvil), sigue el tema.
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
        className={`flex items-center justify-center gap-2 font-atlas text-[12px] font-light text-ink-muted ${className}`}
      >
        <span>Desarrollado por</span>
        <AtlasMark size={14} className="text-ink" />
        <Wordmark className="text-[12.5px] text-ink" />
      </p>
    );
  }

  return (
    <div
      className={`relative isolate overflow-hidden rounded-2xl border font-atlas ${className}`}
      style={{ background: HORIZON.black, borderColor: HORIZON.glassLine, color: HORIZON.ink }}
    >
      {/* Horizonte: borde de luz ámbar con resplandor, detrás del contenido. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -z-10 left-1/2 -translate-x-1/2 rounded-[50%]"
        style={{
          top: "72%",
          width: "220%",
          height: "160%",
          borderTop: "1.5px solid #FFB27A",
          boxShadow: "0 -4px 18px rgba(255,140,60,.75), 0 -14px 48px rgba(255,106,31,.45)",
          background:
            "radial-gradient(50% 30% at 50% 0%, rgba(255,140,60,.5), rgba(122,36,10,.3) 45%, rgba(5,5,5,0) 75%)",
        }}
      />
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <span
          className="text-[10px] font-normal uppercase tracking-[0.22em]"
          style={{ color: HORIZON.muted }}
        >
          Desarrollado por
        </span>
        <span className="font-mono text-[10px]" style={{ color: HORIZON.dim }}>
          {VERSION}
        </span>
      </div>
      <div className="flex items-center gap-2.5 px-4 pb-5 pt-2">
        <AtlasMark
          size={24}
          className="[filter:drop-shadow(0_0_10px_rgba(255,140,60,.55))]"
        />
        <Wordmark className="text-[17px]" subColor={HORIZON.muted} />
      </div>
    </div>
  );
}
