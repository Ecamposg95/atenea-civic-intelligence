import { ProgressMeter } from "./ProgressMeter";
import {
  barWidth,
  fmt,
  formatPct,
  pctOf,
  regionColor,
  titleCase,
  type RegionGroup,
  type SeccionMapa,
  type ThemeName,
  type Totales,
} from "./mapaHelpers";

interface Props {
  groups: RegionGroup[];
  totales: Totales;
  theme: ThemeName;
  selected: string | null;
  onSelect: (seccion: string) => void;
}

function MetaCell({ value, meta, strong = false }: { value: number; meta: number; strong?: boolean }) {
  const p = pctOf(value, meta);
  const done = p !== null && p >= 100;
  return (
    <td className="px-3 py-2.5 align-middle">
      <div className="flex min-w-[8.5rem] flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2 tabular-nums">
          <span className={strong ? "font-semibold text-ink" : "text-ink"}>
            {fmt(value)}
            <span className="text-ink-muted"> / {fmt(meta)}</span>
          </span>
          <span className="text-xs text-ink-muted">{formatPct(p)}</span>
        </span>
        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-line/70" aria-hidden="true">
          <span
            className={`block h-full rounded-full ${done ? "bg-state-ok" : "bg-accent"}`}
            style={{ width: `${barWidth(value, meta)}%`, minWidth: value > 0 ? 3 : 0 }}
          />
        </span>
      </div>
    </td>
  );
}

function Swatch({ region, theme }: { region: string; theme: ThemeName }) {
  return (
    <span
      className="h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
      style={{ background: regionColor(region, theme) }}
      aria-hidden="true"
    />
  );
}

function regionTitle(g: RegionGroup) {
  return g.region === "Sin región" ? g.region : `Región ${g.region}`;
}

/** Desktop: grouped table. Mobile: grouped cards. Selecting a row selects on the map. */
export function SeccionesRegionTable({ groups, totales, theme, selected, onSelect }: Props) {
  const nSecciones = groups.reduce((a, g) => a + g.secciones.length, 0);

  const rowAction = (x: SeccionMapa) => (
    <button
      type="button"
      onClick={() => onSelect(x.seccion)}
      aria-current={x.seccion === selected ? "true" : undefined}
      aria-label={`Ver sección ${x.seccion} en el mapa`}
      className="focus-ring -mx-2 inline-flex min-h-[44px] items-center rounded-lg px-2 font-display text-[15px] font-bold tabular-nums text-ink hover:text-accent"
    >
      {x.seccion}
    </button>
  );

  return (
    <>
      {/* ── desktop table ── */}
      <div className="panel hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Metas y avance por sección, agrupadas por región ({nSecciones} polígonos)
          </caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th scope="col" className="px-3 py-3 font-semibold">Sección</th>
              <th scope="col" className="px-3 py-3 font-semibold">Barrio</th>
              <th scope="col" className="px-3 py-3 font-semibold">Prioridad</th>
              <th scope="col" className="px-3 py-3 font-semibold">Líderes</th>
              <th scope="col" className="px-3 py-3 font-semibold">Activistas</th>
              <th scope="col" className="px-3 py-3 font-semibold">Promovidos</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Valores viejos</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.region} className="border-b border-line-strong/60">
              <tr className="bg-bg-sunken/60">
                <th scope="colgroup" colSpan={7} className="px-3 py-2 text-left">
                  <span className="flex items-center gap-2">
                    <Swatch region={g.region} theme={theme} />
                    <span className="font-semibold text-ink">{regionTitle(g)}</span>
                    <span className="truncate text-xs font-normal text-ink-muted">{g.barrios.join(", ")}</span>
                  </span>
                </th>
              </tr>
              {g.secciones.map((x) => {
                const isSel = x.seccion === selected;
                return (
                  <tr
                    key={x.seccion}
                    onClick={() => onSelect(x.seccion)}
                    className={`cursor-pointer border-t border-line/60 transition-colors ${
                      isSel ? "bg-accent/10" : "hover:bg-panel-hover"
                    }`}
                  >
                    <th scope="row" className="px-3 py-1 text-left">
                      <span className={`mr-2 inline-block h-6 w-1 rounded-full align-middle ${isSel ? "bg-accent" : "bg-transparent"}`} aria-hidden="true" />
                      {rowAction(x)}
                    </th>
                    <td className="px-3 py-2.5 text-ink-muted">{titleCase(x.barrio)}</td>
                    <td className="px-3 py-2.5 font-semibold text-ink">{x.prioridad ?? "—"}</td>
                    <MetaCell value={x.avance.lideres} meta={x.meta.lideres} />
                    <MetaCell value={x.avance.activistas} meta={x.meta.activistas} />
                    <MetaCell value={x.avance.promovidos} meta={x.meta.promovidos} strong />
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{fmt(x.avance.viejos)}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-line text-ink">
                <th scope="row" colSpan={3} className="px-3 py-2.5 text-left text-xs font-semibold text-ink-muted">
                  Subtotal {g.region}
                </th>
                <MetaCell value={g.subtotal.avance.lideres} meta={g.subtotal.meta.lideres} />
                <MetaCell value={g.subtotal.avance.activistas} meta={g.subtotal.meta.activistas} />
                <MetaCell value={g.subtotal.avance.promovidos} meta={g.subtotal.meta.promovidos} strong />
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{fmt(g.subtotal.avance.viejos)}</td>
              </tr>
            </tbody>
          ))}
          <tfoot>
            <tr className="bg-bg-sunken/60">
              <th scope="row" colSpan={3} className="px-3 py-3 text-left font-semibold text-ink">
                Total San Mateo Atenco
              </th>
              <MetaCell value={totales.avance.lideres} meta={totales.meta.lideres} strong />
              <MetaCell value={totales.avance.activistas} meta={totales.meta.activistas} strong />
              <MetaCell value={totales.avance.promovidos} meta={totales.meta.promovidos} strong />
              <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">{fmt(totales.avance.viejos)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── mobile cards ── */}
      <div className="flex flex-col gap-5 md:hidden">
        {groups.map((g) => (
          <section key={g.region} aria-label={regionTitle(g)}>
            <h3 className="mb-2 flex items-center gap-2 px-1">
              <Swatch region={g.region} theme={theme} />
              <span className="font-semibold text-ink">{regionTitle(g)}</span>
              <span className="ml-auto text-xs tabular-nums text-ink-muted">
                {fmt(g.subtotal.avance.promovidos)} / {fmt(g.subtotal.meta.promovidos)} promovidos
              </span>
            </h3>
            <ul className="flex flex-col gap-2">
              {g.secciones.map((x) => {
                const isSel = x.seccion === selected;
                return (
                  <li key={x.seccion}>
                    <button
                      type="button"
                      onClick={() => onSelect(x.seccion)}
                      aria-current={isSel ? "true" : undefined}
                      className={`focus-ring panel flex w-full flex-col gap-3 p-4 text-left transition-colors ${
                        isSel ? "ring-2 ring-accent" : "active:bg-panel-hover"
                      }`}
                    >
                      <span className="flex w-full items-baseline justify-between gap-3">
                        <span className="min-w-0">
                          <span className="font-display text-lg font-bold tabular-nums text-ink">Sección {x.seccion}</span>
                          <span className="block truncate text-sm text-ink-muted">{titleCase(x.barrio)}</span>
                        </span>
                        <span className="shrink-0 rounded-pill border border-line px-2.5 py-1 text-xs font-semibold text-ink">
                          {x.prioridad ?? "—"}
                        </span>
                      </span>
                      <span className="flex w-full flex-col gap-2.5">
                        <ProgressMeter label="Líderes" value={x.avance.lideres} meta={x.meta.lideres} size="sm" />
                        <ProgressMeter label="Activistas" value={x.avance.activistas} meta={x.meta.activistas} size="sm" />
                        <ProgressMeter label="Promovidos" value={x.avance.promovidos} meta={x.meta.promovidos} />
                      </span>
                      {x.avance.viejos > 0 && (
                        <span className="text-xs text-ink-muted">
                          {fmt(x.avance.viejos)} valores viejos
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <section className="panel flex flex-col gap-3 p-4" aria-label="Total San Mateo Atenco">
          <h3 className="font-semibold text-ink">Total San Mateo Atenco</h3>
          <ProgressMeter label="Líderes" value={totales.avance.lideres} meta={totales.meta.lideres} />
          <ProgressMeter label="Activistas" value={totales.avance.activistas} meta={totales.meta.activistas} />
          <ProgressMeter label="Promovidos" value={totales.avance.promovidos} meta={totales.meta.promovidos} size="lg" />
          <p className="text-xs text-ink-muted">{fmt(totales.avance.viejos)} valores viejos</p>
        </section>
      </div>
    </>
  );
}
