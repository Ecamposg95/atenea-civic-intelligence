import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { buscarPersonas, type PersonaBusqueda, type TipoPersona } from "@/api/capturaHojas";

interface Props {
  tipo: TipoPersona;
  label: string;
  hint?: string;
  onElegir: (p: PersonaBusqueda) => void;
  /** Words for the child count, e.g. ["activista", "activistas"]. */
  hijosEtiqueta: [string, string];
  autoFocus?: boolean;
  invalid?: boolean;
  errorId?: string;
}

/** Typeahead over people already captured (`GET /captura/personas`), as an
 * ARIA 1.2 combobox: ↓/↑ move, Enter picks, Esc closes. */
export function PersonaBuscador({ tipo, label, hint, onElegir, hijosEtiqueta, autoFocus, invalid, errorId }: Props) {
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const hintId = `${uid}-hint`;
  const statusId = `${uid}-status`;
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState<PersonaBusqueda[]>([]);
  const [activo, setActivo] = useState(-1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blurTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setCargando(true);
      setError(null);
      try {
        const r = await buscarPersonas(tipo, q, ctrl.signal);
        setItems(r);
        setActivo(r.length ? 0 : -1);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "No se pudo buscar");
      } finally {
        if (!ctrl.signal.aborted) setCargando(false);
      }
    }, 220);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q, tipo, abierto]);

  function elegir(p: PersonaBusqueda) {
    onElegir(p);
    setAbierto(false);
    setQ("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!abierto) setAbierto(true);
      else setActivo((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (abierto && activo >= 0 && items[activo]) {
        e.preventDefault();
        elegir(items[activo]);
      }
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  const estado = cargando
    ? "Buscando…"
    : error
      ? error
      : abierto && items.length === 0
        ? q.trim()
          ? `Nadie con «${q.trim()}». Revisa la escritura o captúralo como nuevo.`
          : "Todavía no hay nadie capturado."
        : abierto
          ? `${items.length} ${items.length === 1 ? "resultado" : "resultados"}`
          : "";

  const describedBy = [hint ? hintId : null, statusId, invalid && errorId ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="relative">
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mb-1.5 text-[13px] text-ink-muted">
          {hint}
        </p>
      )}
      <div className="relative">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted">
          <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={abierto && activo >= 0 ? `${listId}-${activo}` : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Escribe un nombre o apellido"
          value={q}
          onChange={(e) => {
            setQ(e.target.value.toUpperCase());
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setAbierto(false), 150);
          }}
          onKeyDown={onKeyDown}
          className={`h-12 w-full rounded-xl border bg-bg-sunken pl-11 pr-3.5 text-base text-ink placeholder:text-ink-muted/70 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent ${
            invalid ? "border-state-critical/80" : "border-line-strong"
          }`}
        />
      </div>
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {estado}
      </p>
      {abierto && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-line-strong bg-panel shadow-card-hover">
          <ul id={listId} role="listbox" aria-label={label} className="max-h-80 overflow-y-auto py-1">
            {items.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === activo}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(p)}
                onMouseEnter={() => setActivo(i)}
                className={`flex min-h-[48px] cursor-pointer flex-col justify-center px-4 py-2 ${
                  i === activo ? "bg-accent/15" : ""
                }`}
              >
                <span className="text-[15px] font-semibold text-ink">{p.nombre_completo}</span>
                <span className="text-[13px] text-ink-muted">
                  {[
                    p.seccion ? `Sección ${p.seccion}` : null,
                    `${p.hijos} ${p.hijos === 1 ? hijosEtiqueta[0] : hijosEtiqueta[1]}`,
                    p.padre_nombre ? `Líder: ${p.padre_nombre}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
          {(cargando || error || items.length === 0) && (
            <p className={`px-4 py-3 text-sm ${error ? "text-state-critical" : "text-ink-muted"}`} aria-hidden="true">
              {estado}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
