import { useEffect, useId, useState } from "react";

import { assignTerritory, searchAreas, type AreaHit } from "@/api/territory";

import { translateError, type ManagedUser } from "../filters";
import { BTN, FOCUS, INPUT, LABEL } from "../ui";

/** Superadmin-only: assign an electoral area to the user (applies immediately). */
export function TerritorySection({
  user,
  onChanged,
}: {
  user: ManagedUser;
  onChanged: () => void;
}) {
  const inputId = useId();
  const [current, setCurrent] = useState<{ id: string; nombre: string } | null>(
    user.area_id && user.area_nombre ? { id: user.area_id, nombre: user.area_nombre } : null,
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AreaHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      searchAreas(q)
        .then(setResults)
        .catch((err) => setError(translateError(err, "No se pudo buscar el área.")))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const apply = async (hit: AreaHit | null) => {
    setBusy(true);
    setError(null);
    try {
      await assignTerritory(user.id, hit?.id ?? null);
      setCurrent(hit ? { id: hit.id, nombre: hit.name } : null);
      setQuery("");
      setResults([]);
      onChanged();
    } catch (err) {
      setError(translateError(err, "No se pudo actualizar el territorio."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 border-t border-line pt-6" aria-labelledby={`${inputId}-h`}>
      <h3 id={`${inputId}-h`} className="font-display text-base font-semibold text-ink">
        Territorio
      </h3>
      <p className="mt-1 text-sm text-ink-muted">
        Se guarda en cuanto eliges un área.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink">{current?.nombre ?? "Sin territorio asignado"}</span>
        {current && (
          <button type="button" className={BTN.quiet} disabled={busy} onClick={() => void apply(null)}>
            Quitar territorio
          </button>
        )}
      </div>
      <label htmlFor={inputId} className={`${LABEL} mt-3`}>
        Buscar área
      </label>
      <input
        id={inputId}
        className={INPUT}
        placeholder="Municipio, distrito o sección"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={busy}
        autoComplete="off"
      />
      <p className="mt-1 min-h-[1.25rem] text-[13px] text-ink-muted" aria-live="polite">
        {searching ? "Buscando…" : query.trim() && results.length === 0 ? "Sin coincidencias." : ""}
      </p>
      {results.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-line bg-bg-sunken">
          {results.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className={`${FOCUS} flex min-h-[44px] w-full items-center justify-between gap-3 px-3 text-left text-sm text-ink hover:bg-panel-hover`}
                onClick={() => void apply(hit)}
                disabled={busy}
              >
                <span className="truncate">{hit.name}</span>
                <span className="shrink-0 text-[13px] text-ink-muted">{hit.level}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-state-critical">
          {error}
        </p>
      )}
    </section>
  );
}
