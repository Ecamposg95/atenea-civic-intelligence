import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";

import { getEstructura, type EstructuraActivista, type EstructuraLider } from "@/api/estructura";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { SearchIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import { useAuthStore } from "@/store/authStore";

import { BTN, BTN_GHOST, FIELD } from "./components/personaUi";

const PAGE = 20;
const nf = new Intl.NumberFormat("es-MX");

/**
 * The paper, in miniature: one box per line of the sheet (10 activistas on the
 * C1, 7 promovidos on the Formato Activista). Filled boxes are captured people.
 * Decorative — the text next to it carries the same numbers for screen readers.
 */
function Casillas({ value, meta, size = "md" }: { value: number; meta: number; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-2.5 w-2.5 rounded-[3px]" : "h-3.5 w-3.5 rounded";
  const extra = value - meta;
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: meta }, (_, i) => (
        <span key={i}
          className={`${box} ${i < value ? (value >= meta ? "bg-state-ok" : "bg-accent") : "border border-line-strong bg-transparent"}`} />
      ))}
      {extra > 0 && <span className="ml-1 text-xs tabular-nums text-ink-muted">+{extra}</span>}
    </span>
  );
}

function Faltan({ n, que }: { n: number; que: string }) {
  if (n <= 0) return <span className="text-sm font-medium text-state-ok">Completa</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-state-warning/15 px-2.5 py-0.5 text-sm font-medium text-ink">
      <span className="h-1.5 w-1.5 rounded-full bg-state-warning" aria-hidden="true" />
      Faltan {n} {que}
    </span>
  );
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    className={`shrink-0 text-ink-muted transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

const verGente = (id: string, nombre: string) =>
  `/promovidos?padre_id=${encodeURIComponent(id)}&padre_nombre=${encodeURIComponent(nombre)}`;

function Activista({ a, meta, defaultOpen }: { a: EstructuraActivista; meta: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  const panel = useId();
  const n = a.promovidos.length;
  const incompleta = n < meta;
  return (
    <li className={`border-l-4 ${incompleta ? "border-state-warning" : "border-state-ok/60"}`}>
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)}
        className="focus-ring flex min-h-[44px] w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-panel-hover">
        <Chevron open={open} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{a.nombre_completo}</span>
          <span className="text-sm text-ink-muted">
            Activista · sección <span className="tabular-nums">{a.seccion ?? "—"}</span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <Casillas value={n} meta={meta} size="sm" />
          <span className="text-sm tabular-nums text-ink-muted">{n} de {meta}</span>
        </span>
      </button>
      {open && (
        <div id={panel} className="pb-3 pl-10 pr-3">
          <div className="mb-2"><Faltan n={meta - n} que={meta - n === 1 ? "promovido" : "promovidos"} /></div>
          {n === 0 ? (
            <p className="text-sm text-ink-muted">Aún sin promovidos. Captura su Formato Activista.</p>
          ) : (
            <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {a.promovidos.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">{p.nombre_completo}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">{p.seccion ?? "—"}</span>
                </li>
              ))}
            </ol>
          )}
          <Link to={verGente(a.id, a.nombre_completo)}
            className="focus-ring mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-accent underline-offset-4 hover:underline">
            Abrir su familia en la lista
          </Link>
        </div>
      )}
    </li>
  );
}

function Lider({ l, metaAct, metaProm, expandAll }: {
  l: EstructuraLider; metaAct: number; metaProm: number; expandAll: boolean;
}) {
  const [open, setOpen] = useState(expandAll);
  useEffect(() => setOpen(expandAll), [expandAll]);
  const panel = useId();
  const nAct = l.activistas.length;
  const metaPromLider = metaAct * metaProm;
  const incompleto = nAct < metaAct || l.familias_completas < nAct;
  return (
    <li className="card-premium overflow-hidden">
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)}
        className="focus-ring flex min-h-[56px] w-full flex-col gap-2 px-4 py-3.5 text-left hover:bg-panel-hover sm:flex-row sm:items-center sm:gap-4">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <Chevron open={open} />
          <span className="min-w-0">
            <span className="block font-display text-base font-semibold text-ink">{l.nombre_completo}</span>
            <span className="text-sm text-ink-muted">
              Líder · sección <span className="tabular-nums">{l.seccion ?? "—"}</span>
              {incompleto && <span className="sr-only">. Estructura incompleta</span>}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-8 sm:pl-0">
          <span className="flex items-center gap-2">
            <Casillas value={nAct} meta={metaAct} />
            <span className="text-sm tabular-nums text-ink-muted">{nAct} de {metaAct} activistas</span>
          </span>
          <span className="text-sm tabular-nums text-ink-muted">
            {nf.format(l.total_promovidos)} de {nf.format(metaPromLider)} promovidos
          </span>
        </span>
      </button>
      {open && (
        <div id={panel} className="border-t border-line/70">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Faltan n={metaAct - nAct} que={metaAct - nAct === 1 ? "activista" : "activistas"} />
            <span className="text-sm text-ink-muted">
              {l.familias_completas} de {nAct} {nAct === 1 ? "familia completa" : "familias completas"}
            </span>
            <Link to={verGente(l.id, l.nombre_completo)}
              className="focus-ring ml-auto inline-flex min-h-[44px] items-center text-sm font-medium text-accent underline-offset-4 hover:underline">
              Ver sus activistas en la lista
            </Link>
          </div>
          {nAct === 0 ? (
            <p className="px-4 pb-4 text-sm text-ink-muted">Aún sin activistas. Captura su hoja C1.</p>
          ) : (
            <ul className="flex flex-col gap-1 pb-2">
              {l.activistas.map((a) => (
                <Activista key={a.id} a={a} meta={metaProm} defaultOpen={expandAll && a.promovidos.length > 0} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-display text-2xl font-bold tabular-nums text-ink">{nf.format(value)}</dd>
      {note && <dd className="text-xs text-ink-muted">{note}</dd>}
    </div>
  );
}

export function EstructuraPage() {
  const role = useAuthStore((s) => s.user?.role);
  const canCapture = role === "superadmin" || role === "admin" || role === "coordinador" || role === "capturista";

  const [qIn, setQIn] = useState("");
  const [seccionIn, setSeccionIn] = useState("");
  const [q, setQ] = useState("");
  const [seccion, setSeccion] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qIn.trim());
      setSeccion(seccionIn.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [qIn, seccionIn]);

  const state = useAsync(() => getEstructura({ q, seccion, limit: PAGE, offset }), [q, seccion, offset], "EstructuraPage#1");
  const data = state.data;
  const r = data?.resumen;
  const hasFilters = Boolean(q || seccion);
  // A search result opens the matching trees so the hit is visible right away.
  const expandAll = Boolean(q);

  return (
    <AppLayout title="Estructura" crumb="Personas">
      <PageHeader
        title="Estructura"
        subtitle="Cada líder con sus 10 activistas y cada activista con sus 7 promovidos, igual que en las hojas. Lo que falta para completar se marca en ámbar."
        actions={canCapture ? <Link to="/captura" className={BTN}>Capturar hoja</Link> : undefined}
      />

      <div className="flex flex-col gap-4">
        {r && (
          <dl className="card-premium grid grid-cols-2 divide-line/70 lg:grid-cols-4 lg:divide-x">
            <Stat label="Líderes" value={r.lideres}
              note={`${nf.format(r.lideres_completos)} con sus ${data?.meta_activistas ?? 10} activistas`} />
            <Stat label="Activistas" value={r.activistas} />
            <Stat label="Familias completas" value={r.familias_completas}
              note={`de ${nf.format(r.activistas)} activistas`} />
            <Stat label="Promovidos" value={r.promovidos} />
          </dl>
        )}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="relative block">
            <span className="sr-only">Buscar a cualquier persona de la estructura</span>
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input type="search" value={qIn} onChange={(e) => setQIn(e.target.value)} autoComplete="off"
              placeholder="Buscar líder, activista o promovido" className={`${FIELD} w-full pl-10`} />
          </label>
          <label className="relative block">
            <span className="sr-only">Sección</span>
            <input value={seccionIn} onChange={(e) => setSeccionIn(e.target.value)} inputMode="numeric"
              placeholder="Sección" className={`${FIELD} w-full`} />
          </label>
        </div>

        <p className="text-sm text-ink-muted" aria-live="polite">
          {data ? `${nf.format(data.total)} ${data.total === 1 ? "líder" : "líderes"}${hasFilters ? " con estos filtros" : ""}` : ""}
        </p>

        <DataState loading={state.loading && !data} error={state.error} onRetry={state.reload}
          skeleton={<div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-panel-hover" />)}</div>}>
          {data && data.items.length === 0 ? (
            <div className="card-premium flex flex-col items-center gap-3 px-5 py-12 text-center">
              <p className="text-sm text-ink-muted">
                {hasFilters ? "Nadie de la estructura coincide con la búsqueda." : "Todavía no hay líderes capturados. La estructura empieza con la hoja C1 de un líder."}
              </p>
              {hasFilters ? (
                <button type="button" className={BTN_GHOST} onClick={() => { setQIn(""); setSeccionIn(""); }}>Limpiar búsqueda</button>
              ) : canCapture ? (
                <Link to="/captura" className={BTN}>Capturar hoja C1</Link>
              ) : null}
            </div>
          ) : (
            <ul className={`flex flex-col gap-3 transition-opacity ${state.loading ? "opacity-60" : ""}`}>
              {data?.items.map((l) => (
                <Lider key={l.id} l={l} metaAct={data.meta_activistas} metaProm={data.meta_promovidos} expandAll={expandAll} />
              ))}
            </ul>
          )}
        </DataState>

        {data && data.total > PAGE && (
          <nav aria-label="Páginas de líderes" className="flex items-center justify-between gap-3">
            <span className="text-sm tabular-nums text-ink-muted">
              {nf.format(offset + 1)}–{nf.format(Math.min(offset + PAGE, data.total))} de {nf.format(data.total)}
            </span>
            <div className="flex gap-2">
              <button type="button" className={BTN_GHOST} disabled={state.loading || offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE))}>Anterior</button>
              <button type="button" className={BTN_GHOST} disabled={state.loading || offset + PAGE >= data.total}
                onClick={() => setOffset(offset + PAGE)}>Siguiente</button>
            </div>
          </nav>
        )}
      </div>
    </AppLayout>
  );
}
