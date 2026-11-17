import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { revelarClaves } from "@/api/admin";
import {
  downloadExport,
  listPromovidos,
  type FiltroLegacy,
  type Promovido,
  type TipoPersona,
} from "@/api/promovidos";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SearchIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import { useAuthStore } from "@/store/authStore";

import { PromovidoDetail } from "./components/PromovidoDetail";
import { BTN, BTN_GHOST, FIELD, LegacyBadge, TipoBadge, cadenaDe, fmtFecha } from "./components/personaUi";

const PAGE = 50;

const LEGACY_OPTS: { id: FiltroLegacy; label: string }[] = [
  { id: "nuevos", label: "Nuevos" },
  { id: "viejos", label: "Valores viejos" },
  { id: "todos", label: "Todos" },
];

const TIPO_OPTS: { value: TipoPersona | ""; label: string }[] = [
  { value: "", label: "Todos los tipos" },
  { value: "LIDER", label: "Líderes" },
  { value: "ACTIVISTA", label: "Activistas" },
  { value: "PROMOVIDO", label: "Promovidos" },
];

type SortKey = "nombre" | "seccion" | "created_at";
const SORT_OPTS: { value: SortKey; label: string }[] = [
  { value: "created_at", label: "Más recientes" },
  { value: "nombre", label: "Nombre" },
  { value: "seccion", label: "Sección" },
];

const nf = new Intl.NumberFormat("es-MX");

const asLegacy = (v: string | null): FiltroLegacy =>
  v === "viejos" || v === "todos" ? v : "nuevos";
const asTipo = (v: string | null): TipoPersona | "" =>
  v === "LIDER" || v === "ACTIVISTA" || v === "PROMOVIDO" ? v : "";

export function PromovidosPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isExec = role === "superadmin" || role === "admin" || role === "coordinador";
  const canReveal = isExec;
  const canCapture = isExec || role === "capturista";

  // Deep-link filters (Estructura → "Ver en la lista" uses padre_id + padre_nombre).
  const [params, setParams] = useSearchParams();
  const padreId = params.get("padre_id") ?? "";
  const padreNombre = params.get("padre_nombre") ?? "";

  const [legacy, setLegacy] = useState<FiltroLegacy>(asLegacy(params.get("legacy")));
  const [tipo, setTipo] = useState<TipoPersona | "">(asTipo(params.get("tipo")));
  const [sort, setSort] = useState<SortKey>("created_at");

  // Text inputs are debounced into committed values.
  const [qIn, setQIn] = useState(params.get("q") ?? "");
  const [seccionIn, setSeccionIn] = useState(params.get("seccion") ?? "");
  const [padreIn, setPadreIn] = useState("");
  const [q, setQ] = useState(qIn);
  const [seccion, setSeccion] = useState(seccionIn);
  const [padre, setPadre] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Promovido | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qIn.trim());
      setSeccion(seccionIn.trim());
      setPadre(padreIn.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [qIn, seccionIn, padreIn]);

  useEffect(() => setOffset(0), [q, seccion, padre, padreId, legacy, tipo, sort]);
  // "Ver su gente" lands here with padre_id: paper families are always new captures.
  useEffect(() => {
    if (padreId) setLegacy("nuevos");
  }, [padreId]);

  const state = useAsync(
    () =>
      listPromovidos({
        q, seccion, padre, padre_id: padreId || undefined, legacy, tipo,
        sort, order: sort === "created_at" ? "desc" : "asc", limit: PAGE, offset,
      }),
    [q, seccion, padre, padreId, legacy, tipo, sort, offset],
  );
  const data = state.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const hasFilters = Boolean(q || seccion || padre || padreId || tipo);

  // ── Batch reveal (audited per id). PII lives only in this component's state
  // and is dropped whenever the visible set can change.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => setRevealed({}), [items]);

  const revealPage = useCallback(async () => {
    const ids = items.map((p) => p.id).filter((id) => !(id in revealed));
    if (ids.length === 0) return;
    if (!window.confirm(
      `¿Revelar la clave de elector de las ${ids.length} personas en pantalla?\nQueda registrado en la bitácora de auditoría.`,
    )) return;
    setRevealing(true);
    setNotice(null);
    try {
      const claves = await revelarClaves(ids);
      setRevealed((prev) => ({ ...prev, ...claves }));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "No se pudieron revelar las claves.");
    } finally {
      setRevealing(false);
    }
  }, [items, revealed]);

  // ── Export (masked; audited server-side as registro.export).
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const exportar = useCallback(async (format: "csv" | "xlsx") => {
    setExporting(format);
    setNotice(null);
    try {
      await downloadExport(format, { q, seccion, legacy, tipo });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "No se pudo descargar el archivo.");
    } finally {
      setExporting(null);
    }
  }, [q, seccion, legacy, tipo]);

  const clearPadreId = () => {
    const next = new URLSearchParams(params);
    next.delete("padre_id");
    next.delete("padre_nombre");
    setParams(next, { replace: true });
  };

  const clearFilters = () => {
    setQIn("");
    setSeccionIn("");
    setPadreIn("");
    setTipo("");
    if (padreId) clearPadreId();
  };

  const clave = (p: Promovido) => revealed[p.id] ?? p.clave_masked ?? "—";

  return (
    <AppLayout title="Personas" crumb="Personas">
      <PageHeader
        title="Personas"
        subtitle="Líderes, activistas y promovidos de las hojas de papel. Toca a una persona para ver su ficha completa."
        actions={
          <div className="flex flex-wrap gap-2">
            {canCapture && (
              <Link to="/captura" className={BTN}>Capturar hoja</Link>
            )}
            <button type="button" className={BTN_GHOST} disabled={exporting !== null || total === 0}
              onClick={() => void exportar("xlsx")}>
              {exporting === "xlsx" ? "Descargando…" : "Descargar Excel"}
            </button>
            <button type="button" className={BTN_GHOST} disabled={exporting !== null || total === 0}
              onClick={() => void exportar("csv")}>
              {exporting === "csv" ? "Descargando…" : "CSV"}
            </button>
          </div>
        }
      />

      {data && !data.has_territory ? (
        <div className="card-premium px-5 py-12 text-center text-ink-muted">
          Pídele a tu administrador que te asigne un territorio.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Search + Nuevos/Viejos/Todos */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative block flex-1">
              <span className="sr-only">Buscar por nombre</span>
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input type="search" value={qIn} onChange={(e) => setQIn(e.target.value)}
                placeholder="Buscar por nombre" autoComplete="off"
                className={`${FIELD} w-full pl-10`} />
            </label>
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [&_button]:min-h-[40px] [&_button]:whitespace-nowrap">
              <SegmentedControl options={LEGACY_OPTS} value={legacy} onChange={setLegacy}
                ariaLabel="Mostrar capturas" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm text-ink-muted">
              Tipo
              <select value={tipo} onChange={(e) => setTipo(asTipo(e.target.value))} className={FIELD}>
                {TIPO_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-muted">
              Sección
              <input value={seccionIn} onChange={(e) => setSeccionIn(e.target.value)}
                inputMode="numeric" placeholder="Ej. 4121" className={FIELD} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-sm text-ink-muted md:col-span-1">
              Líder o activista
              <input value={padreIn} onChange={(e) => setPadreIn(e.target.value)}
                placeholder="Su gente directa" className={FIELD} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-sm text-ink-muted md:col-span-1">
              Ordenar
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={FIELD}>
                {SORT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-sm text-ink-muted" aria-live="polite">
              {state.loading && !data ? "Cargando…" : (
                <><strong className="font-semibold text-ink tabular-nums">{nf.format(total)}</strong>{" "}
                  {total === 1 ? "persona" : "personas"}{hasFilters ? " con estos filtros" : ""}</>
              )}
            </p>
            {padreId && (
              <span className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-accent/30 bg-accent/10 pl-3 text-sm text-ink">
                Gente de {padreNombre || "esta persona"}
                <button type="button" onClick={clearPadreId} aria-label="Quitar filtro de cadena"
                  className="focus-ring grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:text-ink">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </span>
            )}
            {hasFilters && (
              <button type="button" onClick={clearFilters}
                className="focus-ring min-h-[44px] rounded-lg px-2 text-sm font-medium text-accent underline-offset-4 hover:underline">
                Limpiar filtros
              </button>
            )}
            {canReveal && items.length > 0 && (
              <button type="button" onClick={() => void revealPage()} disabled={revealing}
                className="focus-ring ml-auto min-h-[44px] rounded-lg px-2 text-sm font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50">
                {revealing ? "Revelando…" : "Revelar claves de esta página"}
              </button>
            )}
          </div>
          {notice && <p role="alert" className="text-sm text-state-critical">{notice}</p>}

          <DataState loading={state.loading && !data} error={state.error} onRetry={state.reload}
            skeleton={<div className="h-64 animate-pulse rounded-card bg-panel-hover" />}>
            {items.length === 0 ? (
              <div className="card-premium flex flex-col items-center gap-3 px-5 py-12 text-center">
                <p className="text-sm text-ink-muted">
                  {hasFilters
                    ? "Nadie coincide con estos filtros."
                    : legacy === "nuevos"
                      ? "Todavía no hay capturas nuevas. Empieza con la primera hoja."
                      : "No hay personas en esta vista."}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {hasFilters ? (
                    <button type="button" onClick={clearFilters} className={BTN_GHOST}>Limpiar filtros</button>
                  ) : canCapture ? (
                    <Link to="/captura" className={BTN}>Capturar hoja</Link>
                  ) : null}
                  {!hasFilters && isExec && (
                    <Link to="/promovidos/importar" className={BTN_GHOST}>Importar Excel</Link>
                  )}
                </div>
              </div>
            ) : (
              <div className={`card-premium overflow-hidden transition-opacity ${state.loading ? "opacity-60" : ""}`}>
                {/* Desktop: table */}
                <table className="hidden w-full text-sm md:table">
                  <caption className="sr-only">Personas capturadas</caption>
                  <thead>
                    <tr className="border-b border-line bg-panel-raised text-left text-xs font-semibold text-ink-muted">
                      <th scope="col" className="px-4 py-3">Nombre</th>
                      <th scope="col" className="px-4 py-3">Tipo</th>
                      <th scope="col" className="px-4 py-3">Cadena</th>
                      <th scope="col" className="px-4 py-3">Sección</th>
                      <th scope="col" className="hidden px-4 py-3 lg:table-cell">Teléfono</th>
                      <th scope="col" className="px-4 py-3">Clave</th>
                      <th scope="col" className="hidden px-4 py-3 xl:table-cell">Captura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.id} className="border-b border-line/60 last:border-0 hover:bg-panel-hover">
                        <td className="px-4 py-2.5">
                          <button type="button" onClick={() => setSelected(p)}
                            className="focus-ring -mx-1 min-h-[40px] rounded px-1 text-left font-medium text-ink hover:text-accent">
                            {p.nombre_completo}
                          </button>
                          {p.legacy && <LegacyBadge className="ml-2" />}
                        </td>
                        <td className="px-4 py-2.5"><TipoBadge tipo={p.tipo} /></td>
                        <td className="px-4 py-2.5 text-ink-muted">{cadenaDe(p)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-ink-muted">{p.seccion ?? "—"}</td>
                        <td className="hidden px-4 py-2.5 tabular-nums text-ink-muted lg:table-cell">{p.telefono ?? "—"}</td>
                        <td className={`px-4 py-2.5 font-mono text-xs ${revealed[p.id] ? "text-ink" : "text-ink-muted"}`}>{clave(p)}</td>
                        <td className="hidden px-4 py-2.5 tabular-nums text-ink-muted xl:table-cell">{fmtFecha(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile: cards */}
                <ul className="divide-y divide-line/60 md:hidden">
                  {items.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setSelected(p)}
                        className="focus-ring flex w-full flex-col gap-1.5 px-4 py-3.5 text-left hover:bg-panel-hover">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{p.nombre_completo}</span>
                          {p.legacy && <LegacyBadge />}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                          <TipoBadge tipo={p.tipo} />
                          <span>Sección <span className="tabular-nums">{p.seccion ?? "—"}</span></span>
                          {cadenaDe(p) !== "—" && <span>de {cadenaDe(p)}</span>}
                        </span>
                        <span className="font-mono text-xs text-ink-muted">Clave {clave(p)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </DataState>

          {total > PAGE && (
            <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
              <span className="text-sm tabular-nums text-ink-muted">
                {nf.format(offset + 1)}–{nf.format(Math.min(offset + PAGE, total))} de {nf.format(total)}
              </span>
              <div className="flex gap-2">
                <button type="button" className={BTN_GHOST} disabled={state.loading || offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE))}>Anterior</button>
                <button type="button" className={BTN_GHOST} disabled={state.loading || offset + PAGE >= total}
                  onClick={() => setOffset(offset + PAGE)}>Siguiente</button>
              </div>
            </nav>
          )}
        </div>
      )}

      {selected && <PromovidoDetail promovido={selected} onClose={() => setSelected(null)} />}
    </AppLayout>
  );
}
