import { ProgressMeter } from "./ProgressMeter";
import {
  fmt,
  margenPp,
  regionColor,
  titleCase,
  type SeccionMapa,
  type ThemeName,
} from "./mapaHelpers";

interface Props {
  seccion: SeccionMapa;
  theme: ThemeName;
  onClose: () => void;
  titleId: string;
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

export function SeccionDetalle({ seccion: x, theme, onClose, titleId }: Props) {
  const pp = margenPp(x.r2024);
  const r = x.r2024;
  const ventaja =
    pp === null ? "—" : Math.abs(pp) <= 2 ? "Empate técnico" : pp > 0 ? "Gana coalición" : "Gana Morena";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-2xl font-bold leading-tight tracking-tight text-ink">
            Sección {x.seccion}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{titleCase(x.barrio)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-1 text-xs font-semibold text-ink">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: regionColor(x.region, theme) }}
                aria-hidden="true"
              />
              Región {x.region ?? "—"}
            </span>
            <span className="inline-flex items-center rounded-pill border border-line px-2.5 py-1 text-xs font-semibold text-ink">
              Prioridad {x.prioridad ?? "—"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Cerrar detalle de la sección ${x.seccion}`}
          className="focus-ring -mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-panel-hover hover:text-ink"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      {x.nota && (
        <p className="rounded-lg border border-line bg-bg-sunken px-3 py-2 text-xs leading-relaxed text-ink-muted">
          {x.nota}. El mapa las muestra juntas y suma sus metas y su avance.
        </p>
      )}

      <section aria-labelledby={`${titleId}-avance`} className="flex flex-col gap-3.5">
        <h3 id={`${titleId}-avance`} className="text-sm font-semibold text-ink">
          Avance contra la meta 2027
        </h3>
        <ProgressMeter label="Líderes" value={x.avance.lideres} meta={x.meta.lideres} />
        <ProgressMeter label="Activistas" value={x.avance.activistas} meta={x.meta.activistas} />
        <ProgressMeter label="Promovidos" value={x.avance.promovidos} meta={x.meta.promovidos} size="lg" />
        <p className="text-xs leading-relaxed text-ink-muted">
          <strong className="font-semibold tabular-nums text-ink">{fmt(x.avance.viejos)}</strong> valores viejos
          registrados en esta sección (no cuentan para la meta).
        </p>
      </section>

      <section aria-labelledby={`${titleId}-padron`} className="border-t border-line pt-4">
        <h3 id={`${titleId}-padron`} className="mb-3 text-sm font-semibold text-ink">
          Padrón
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Dato label="Lista nominal (may-25)" value={fmt(x.lnMay25)} />
          <Dato label="Votos proyectados 2027" value={fmt(x.proy2027)} />
        </dl>
      </section>

      <section aria-labelledby={`${titleId}-2024`} className="border-t border-line pt-4">
        <h3 id={`${titleId}-2024`} className="mb-3 text-sm font-semibold text-ink">
          Resultado 2024
        </h3>
        {r ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Dato label="Lista nominal" value={fmt(r.listaNominal)} />
            <Dato label="Votos" value={fmt(r.votos)} />
            <Dato label="Participación" value={r.participacion === null ? "—" : `${r.participacion} %`} />
            <Dato label="Resultado" value={ventaja} />
            <Dato label="Coalición" value={fmt(r.coalicion)} />
            <Dato label="Morena" value={fmt(r.morena)} />
            <Dato
              label="Margen"
              value={
                r.margen === null
                  ? "—"
                  : `${r.margen > 0 ? "+" : ""}${fmt(r.margen)}${pp === null ? "" : ` (${pp > 0 ? "+" : ""}${pp.toFixed(1)} pts)`}`
              }
            />
            {r.etiqueta && <Dato label="Clasificación" value={titleCase(r.etiqueta.replace(/_/g, " "))} />}
          </dl>
        ) : (
          <p className="text-sm text-ink-muted">Sin resultados 2024 para esta sección.</p>
        )}
      </section>
    </div>
  );
}
