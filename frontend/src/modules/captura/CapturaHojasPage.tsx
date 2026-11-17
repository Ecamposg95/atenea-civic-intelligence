import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import {
  enviarHoja,
  getCatalogoCaptura,
  getMisHojas,
  type CatalogoCaptura,
  type FilaResultado,
  type HojaIn,
  type HojaResumen,
  type TipoHoja,
} from "@/api/capturaHojas";

import { BARRIOS_LIST_ID } from "./hojas/CampoControl";
import { BTN_PRIMARIO, BTN_SECUNDARIO, BTN_TEXTO, FOCO } from "./hojas/campos";
import {
  borradorInicial,
  campanaActiva,
  claveBorrador,
  guardarBorrador,
  hojaInicial,
  leerBorrador,
  tieneTrabajo,
  type Borrador,
  type HojaState,
  type TitularState,
} from "./hojas/estado";
import { vistaFila, type FilaVista } from "./hojas/filaEstado";
import { HojaGrid } from "./hojas/HojaGrid";
import { HojaTarjetas } from "./hojas/HojaTarjetas";
import { MisHojas } from "./hojas/MisHojas";
import { ReglasFormato } from "./hojas/ReglasFormato";
import { TEXTOS_TITULAR, TitularPanel } from "./hojas/TitularPanel";
import { TipoHojaSelector } from "./hojas/TipoHojaSelector";
import { useEsEscritorio } from "./hojas/useEsEscritorio";
import {
  MAX_FILAS,
  esFilaVacia,
  filaPayload,
  limpiarPersona,
  nombreCompleto,
  resumenGuardado,
  revisarHoja,
  type CampoPersona,
  type PersonaForm,
  type RevisionFila,
} from "./hojas/validation";

type Servidor = { titular: FilaResultado | null; filas: (FilaResultado | null)[] };
type Mensaje = { tono: "ok" | "error" | "info"; texto: string };

const FILA: Record<TipoHoja, [string, string]> = {
  LIDER: ["activista", "activistas"],
  FAMILIA: ["promovido", "promovidos"],
};

const SIN_REVISION: RevisionFila = { vacia: true, errores: [], avisos: [] };

function servidorVacio(): Record<TipoHoja, Servidor> {
  return { LIDER: { titular: null, filas: [] }, FAMILIA: { titular: null, filas: [] } };
}

/** Sección picked → suggest its barrio in Bo./Col. (only when the colonia is
 * empty or still holds the previous automatic suggestion). */
function conColoniaSugerida(p: PersonaForm, seccion: string, barrioDe: (s: string) => string | null): PersonaForm {
  const anterior = barrioDe(p.seccion);
  const nuevo = barrioDe(seccion);
  const next = { ...p, seccion };
  if (nuevo && (!p.colonia.trim() || (anterior && p.colonia.trim() === anterior))) next.colonia = nuevo;
  return next;
}

function enfocar(selector: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
}

export function CapturaHojasPage() {
  const esEscritorio = useEsEscritorio();
  const claveDraft = useMemo(() => claveBorrador(campanaActiva()), []);
  const [inicial] = useState(() => leerBorrador(claveDraft));
  const [borrador, setBorrador] = useState<Borrador>(() => inicial ?? borradorInicial());
  const [recuperado, setRecuperado] = useState(
    () => !!inicial && (tieneTrabajo(inicial.hojas.LIDER) || tieneTrabajo(inicial.hojas.FAMILIA)),
  );
  const [catalogo, setCatalogo] = useState<CatalogoCaptura | null>(null);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [servidor, setServidor] = useState<Record<TipoHoja, Servidor>>(servidorVacio);
  const [vistos, setVistos] = useState<Record<TipoHoja, Set<string>>>(() => ({ LIDER: new Set(), FAMILIA: new Set() }));
  const [mostrarTodo, setMostrarTodo] = useState<Record<TipoHoja, boolean>>({ LIDER: false, FAMILIA: false });
  const [enviando, setEnviando] = useState<null | "revisar" | "guardar">(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [abierta, setAbierta] = useState<number | null>(0);
  const [misHojas, setMisHojas] = useState<HojaResumen[] | null>(null);
  const [misHojasError, setMisHojasError] = useState<string | null>(null);
  const revisarRef = useRef<HTMLButtonElement>(null);

  const tipo = borrador.tipo;
  const hoja = borrador.hojas[tipo];
  const srv = servidor[tipo];
  const secciones = catalogo?.secciones ?? [];

  // ── Data ──
  const cargarCatalogo = useCallback(async () => {
    setCatalogoError(null);
    try {
      setCatalogo(await getCatalogoCaptura());
    } catch (e) {
      setCatalogoError(e instanceof Error ? e.message : "Error de conexión");
    }
  }, []);

  const cargarMisHojas = useCallback(async () => {
    setMisHojasError(null);
    try {
      setMisHojas(await getMisHojas());
    } catch (e) {
      setMisHojasError(e instanceof Error ? e.message : "Error de conexión");
    }
  }, []);

  useEffect(() => {
    void cargarCatalogo();
    void cargarMisHojas();
  }, [cargarCatalogo, cargarMisHojas]);

  // ── Draft autosave + leave guard ──
  useEffect(() => {
    const t = window.setTimeout(() => guardarBorrador(claveDraft, borrador), 400);
    return () => window.clearTimeout(t);
  }, [borrador, claveDraft]);

  const pendientes = useMemo(
    () => ({ LIDER: tieneTrabajo(borrador.hojas.LIDER), FAMILIA: tieneTrabajo(borrador.hojas.FAMILIA) }),
    [borrador],
  );
  const hayPendientes = pendientes.LIDER || pendientes.FAMILIA;

  useEffect(() => {
    if (!hayPendientes) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      guardarBorrador(claveDraft, borrador);
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hayPendientes, borrador, claveDraft]);

  // Success messages fade on their own; errors stay until the next action.
  useEffect(() => {
    if (mensaje?.tono !== "ok") return;
    const t = window.setTimeout(() => setMensaje(null), 8000);
    return () => window.clearTimeout(t);
  }, [mensaje]);

  // ── Derived ──
  const barrioDe = useCallback(
    (s: string) => {
      const b = secciones.find((x) => x.seccion === s)?.barrio;
      return b ? b.toUpperCase() : null;
    },
    [secciones],
  );
  const seccionesSet = useMemo(() => new Set(secciones.map((s) => s.seccion)), [secciones]);
  const titularNuevo = hoja.titular.modo === "nuevo" ? hoja.titular.nuevo : null;
  const revision = useMemo(
    () => revisarHoja(titularNuevo, hoja.filas, seccionesSet),
    [titularNuevo, hoja.filas, seccionesSet],
  );
  const vistas: FilaVista[] = hoja.filas.map((p, i) =>
    vistaFila(`f${i}`, p, revision.filas[i], srv.filas[i] ?? null, vistos[tipo], mostrarTodo[tipo]),
  );
  const vistaTitular = vistaFila(
    "t",
    hoja.titular.nuevo,
    revision.titular ?? SIN_REVISION,
    titularNuevo ? srv.titular : null,
    vistos[tipo],
    mostrarTodo[tipo],
  );

  const faltaTitular =
    hoja.titular.modo === "buscar" ? !hoja.titular.existente : esFilaVacia(hoja.titular.nuevo);
  const faltaLider = tipo === "FAMILIA" && hoja.titular.modo === "nuevo" && !hoja.titular.lider;
  const filasConDatos = revision.filasConDatos;
  const filasConError = vistas.filter((v, i) => !revision.filas[i].vacia && (revision.filas[i].errores.length > 0 || v.estado.tono === "error")).length;
  const textos = TEXTOS_TITULAR[tipo];

  // ── Mutations ──
  function actualizarHoja(fn: (h: HojaState) => HojaState) {
    setBorrador((b) => ({ ...b, hojas: { ...b.hojas, [b.tipo]: fn(b.hojas[b.tipo]) } }));
  }

  function olvidarServidor(fila: number | "titular") {
    setServidor((s) => {
      const cur = s[tipo];
      if (fila === "titular") return cur.titular ? { ...s, [tipo]: { ...cur, titular: null } } : s;
      if (!cur.filas[fila]) return s;
      const filas = cur.filas.slice();
      filas[fila] = null;
      return { ...s, [tipo]: { ...cur, filas } };
    });
  }

  function onCampoFila(i: number, campo: CampoPersona, value: string) {
    actualizarHoja((h) => {
      const filas = h.filas.slice();
      filas[i] = campo === "seccion" ? conColoniaSugerida(filas[i], value, barrioDe) : { ...filas[i], [campo]: value };
      return { ...h, filas };
    });
    olvidarServidor(i);
  }

  function onCampoTitular(campo: CampoPersona, value: string) {
    actualizarHoja((h) => ({
      ...h,
      titular: {
        ...h.titular,
        nuevo:
          campo === "seccion"
            ? conColoniaSugerida(h.titular.nuevo, value, barrioDe)
            : { ...h.titular.nuevo, [campo]: value },
      },
    }));
    olvidarServidor("titular");
  }

  function marcarVisto(key: string, campo: CampoPersona) {
    const k = `${key}:${campo}`;
    setVistos((v) => (v[tipo].has(k) ? v : { ...v, [tipo]: new Set(v[tipo]).add(k) }));
  }

  function cambiarTitular(t: TitularState) {
    actualizarHoja((h) => ({ ...h, titular: t }));
    olvidarServidor("titular");
  }

  function cambiarTipo(t: TipoHoja) {
    setBorrador((b) => ({ ...b, tipo: t }));
    setMensaje(null);
    setAbierta(0);
  }

  function limpiarFilas(t: TipoHoja) {
    setBorrador((b) => ({ ...b, hojas: { ...b.hojas, [t]: { ...b.hojas[t], filas: hojaInicial(t).filas } } }));
    setServidor((s) => ({ ...s, [t]: { titular: null, filas: [] } }));
    setVistos((v) => ({ ...v, [t]: new Set() }));
    setMostrarTodo((m) => ({ ...m, [t]: false }));
  }

  function enfocarPrimeraCelda() {
    if (esEscritorio) enfocar('[data-cell="f0:apellido_paterno"]');
    else {
      setAbierta(0);
      enfocar('[data-cell="f0:apellido_paterno"]');
    }
  }

  function enfocarPrimerProblema(srvNuevo?: Servidor) {
    const s = srvNuevo ?? srv;
    const titularMal = faltaTitular || faltaLider || (revision.titular?.errores.length ?? 0) > 0 ||
      s.titular?.estado === "error";
    if (titularMal) {
      enfocar("#titular-panel input, #titular-panel select, #titular-panel button");
      return;
    }
    const i = hoja.filas.findIndex(
      (_, k) => (revision.filas[k]?.errores.length ?? 0) > 0 || s.filas[k]?.estado === "error",
    );
    if (i < 0) return;
    const campo = revision.filas[i]?.errores[0]?.campo ?? "apellido_paterno";
    if (!esEscritorio) setAbierta(i);
    enfocar(`[data-cell="f${i}:${campo}"]`);
  }

  // ── Review / save ──
  async function enviar(dryRun: boolean) {
    setMostrarTodo((m) => ({ ...m, [tipo]: true }));
    setMensaje(null);

    const soloTitular = filasConDatos === 0;
    if (soloTitular && (hoja.titular.modo === "buscar" || esFilaVacia(hoja.titular.nuevo))) {
      setMensaje({ tono: "error", texto: `La hoja no tiene ${FILA[tipo][1]} capturados. Llena al menos una fila.` });
      enfocarPrimeraCelda();
      return;
    }
    if (!dryRun) {
      const problemas: string[] = [];
      if (faltaTitular) problemas.push(`falta ${textos.titulo.toLowerCase()}`);
      if (faltaLider) problemas.push("falta el líder del activista");
      if (revision.totalErrores > 0)
        problemas.push(revision.totalErrores === 1 ? "hay 1 error" : `hay ${revision.totalErrores} errores`);
      if (problemas.length) {
        setMensaje({
          tono: "error",
          texto: `No se guardó: ${problemas.join(", ")}. Corrige lo marcado en rojo.`,
        });
        enfocarPrimerProblema();
        return;
      }
    }

    const t = hoja.titular;
    const payload: HojaIn = {
      tipo_hoja: tipo,
      dry_run: dryRun,
      titular:
        t.modo === "buscar"
          ? t.existente
            ? { id: t.existente.id }
            : {}
          : { ...filaPayload(t.nuevo), ...(tipo === "FAMILIA" && t.lider ? { padre_id: t.lider.id } : {}) },
      filas: hoja.filas.map(filaPayload),
    };

    setEnviando(dryRun ? "revisar" : "guardar");
    try {
      const res = await enviarHoja(payload);
      const filasRes: (FilaResultado | null)[] = hoja.filas.map(() => null);
      for (const f of res.filas) if (f.index != null && f.index < filasRes.length) filasRes[f.index] = f;
      const nuevoSrv: Servidor = { titular: res.titular, filas: filasRes };

      if (!dryRun && res.ok) {
        const titularFueNuevo = t.modo === "nuevo";
        const nFilas = Math.max(0, res.creados - (titularFueNuevo ? 1 : 0));
        const avisos = [res.titular, ...res.filas].filter((f) => f.estado === "aviso").length;
        const limpio = limpiarPersona(t.nuevo);
        const existente =
          t.modo === "buscar" && t.existente
            ? { ...t.existente, hijos: t.existente.hijos + nFilas }
            : {
                id: res.titular.id ?? "",
                nombre_completo: nombreCompleto(limpio),
                seccion: limpio.seccion || null,
                telefono: limpio.telefono || null,
                padre_id: t.lider?.id ?? null,
                padre_nombre: t.lider?.nombre_completo ?? null,
                hijos: nFilas,
              };
        // Keep the titular (now an existing person) for the next sheet.
        actualizarHoja((h) => ({
          titular: { modo: "buscar", existente: existente.id ? existente : null, nuevo: hojaInicial(tipo).titular.nuevo, lider: null },
          filas: h.filas,
        }));
        limpiarFilas(tipo);
        setRecuperado(false);
        setMensaje({
          tono: "ok",
          texto:
            resumenGuardado(tipo, titularFueNuevo, nFilas) +
            (avisos ? `. ${avisos === 1 ? "1 persona con aviso" : `${avisos} personas con avisos`}, se guardaron igual.` : "."),
        });
        void cargarMisHojas();
        enfocarPrimeraCelda();
        return;
      }

      setServidor((s) => ({ ...s, [tipo]: nuevoSrv }));
      const resultados = [res.titular, ...res.filas];
      const errores = resultados.filter((f) => f.estado === "error").length;
      const avisos = resultados.filter((f) => f.estado === "aviso").length;
      if (!dryRun) {
        setMensaje({
          tono: "error",
          texto: `No se guardó: ${errores === 1 ? "1 persona tiene errores" : `${errores} personas tienen errores`}. Corrige lo marcado en rojo y vuelve a guardar.`,
        });
        enfocarPrimerProblema(nuevoSrv);
      } else {
        const okN = resultados.length - errores - avisos;
        setMensaje({
          tono: errores ? "error" : "info",
          texto: errores
            ? `Revisión: ${errores} con errores, ${avisos} con avisos, ${okN} sin observaciones. Corrige lo marcado en rojo.`
            : avisos
              ? `Revisión sin errores: ${avisos} con avisos (no impiden guardar) y ${okN} sin observaciones.`
              : "Revisión sin errores. Ya puedes guardar la hoja.",
        });
        if (errores) enfocarPrimerProblema(nuevoSrv);
      }
    } catch (e) {
      setMensaje({
        tono: "error",
        texto: `No se pudo ${dryRun ? "revisar" : "guardar"} la hoja: ${e instanceof Error ? e.message : "error de conexión"}. Tus datos siguen aquí; intenta de nuevo.`,
      });
    } finally {
      setEnviando(null);
    }
  }

  function descartar() {
    if (!window.confirm(`¿Borrar lo capturado en esta hoja? ${textos.titulo} se queda.`)) return;
    limpiarFilas(tipo);
    actualizarHoja((h) => (h.titular.modo === "nuevo" ? { ...h, titular: { ...h.titular, nuevo: hojaInicial(tipo).titular.nuevo } } : h));
    setMensaje(null);
    setRecuperado(false);
  }

  const resumenFilas =
    `${filasConDatos} de ${MAX_FILAS[tipo]} ${FILA[tipo][1]}` +
    (mostrarTodo[tipo] && filasConError ? `, ${filasConError} con errores` : "");

  return (
    <AppLayout title="Captura de hojas" crumb="Captura">
      <datalist id={BARRIOS_LIST_ID}>
        {(catalogo?.barrios ?? []).map((b) => (
          <option key={b} value={b.toUpperCase()} />
        ))}
      </datalist>

      <div className="mx-auto max-w-[1760px]">
        <header className="mb-5 flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Captura de hojas</h1>
          <p className="max-w-[62ch] text-[15px] text-ink-muted">
            Copia la hoja de papel tal cual, fila por fila. Las filas vacías no se guardan.
          </p>
        </header>

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            <TipoHojaSelector tipo={tipo} onCambiar={cambiarTipo} pendientes={pendientes} />
            <ReglasFormato />

            {recuperado && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-strong bg-panel px-4 py-2.5">
                <p className="text-[15px] text-ink">Recuperamos lo que dejaste sin guardar.</p>
                <button type="button" className={BTN_TEXTO} onClick={() => setRecuperado(false)}>
                  Entendido
                </button>
              </div>
            )}

            {catalogoError && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-state-critical/50 bg-panel px-4 py-2.5">
                <p className="text-[15px] text-ink">
                  No se cargó la lista de secciones ({catalogoError}). Escribe la sección a mano; se revisa al guardar.
                </p>
                <button type="button" className={BTN_TEXTO} onClick={() => void cargarCatalogo()}>
                  Reintentar
                </button>
              </div>
            )}

            <section aria-label="Hoja en captura" className="rounded-2xl border border-line bg-panel/60 p-3 sm:p-4">
              <div id="titular-panel">
                <TitularPanel
                  tipo={tipo}
                  titular={hoja.titular}
                  onCambiar={cambiarTitular}
                  vistaNuevo={vistaTitular}
                  servidor={srv.titular}
                  secciones={secciones}
                  onCampo={onCampoTitular}
                  onBlurCampo={(c) => marcarVisto("t", c)}
                  faltaLider={faltaLider && mostrarTodo[tipo]}
                />
              </div>

              <div className="mb-2.5 mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
                <h2 className="font-display text-lg font-semibold capitalize text-ink">{FILA[tipo][1]}</h2>
                <p className="text-sm text-ink-muted">
                  {esEscritorio
                    ? "Tab avanza a la derecha; Enter baja a la misma columna."
                    : "Toca una persona para abrirla. Enter pasa al siguiente dato."}
                </p>
              </div>

              {esEscritorio ? (
                <HojaGrid
                  vistas={vistas}
                  secciones={secciones}
                  etiquetaFila={FILA[tipo]}
                  onCampo={onCampoFila}
                  onBlurCampo={(i, c) => marcarVisto(`f${i}`, c)}
                  onFinal={() => revisarRef.current?.focus()}
                />
              ) : (
                <HojaTarjetas
                  vistas={vistas}
                  secciones={secciones}
                  abierta={abierta}
                  onAbrir={setAbierta}
                  etiquetaFila={FILA[tipo]}
                  onCampo={onCampoFila}
                  onBlurCampo={(i, c) => marcarVisto(`f${i}`, c)}
                  onFinal={() => revisarRef.current?.focus()}
                />
              )}

              <div className="sticky bottom-0 z-20 -mx-3 mt-4 rounded-b-2xl border-t border-line-strong bg-panel/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-ink" aria-hidden="true">
                    {resumenFilas}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`${BTN_TEXTO} hidden sm:inline-flex`}
                      onClick={descartar}
                      disabled={!pendientes[tipo] || enviando !== null}
                    >
                      Descartar
                    </button>
                    <button
                      ref={revisarRef}
                      type="button"
                      className={`${BTN_SECUNDARIO} flex-1 sm:flex-none`}
                      onClick={() => void enviar(true)}
                      disabled={enviando !== null}
                      aria-describedby="hoja-resumen"
                    >
                      {enviando === "revisar" ? "Revisando…" : "Revisar"}
                    </button>
                    <button
                      type="button"
                      className={`${BTN_PRIMARIO} flex-[2] sm:flex-none`}
                      onClick={() => void enviar(false)}
                      disabled={enviando !== null}
                      aria-describedby="hoja-resumen"
                    >
                      {enviando === "guardar" ? "Guardando…" : "Guardar hoja"}
                    </button>
                  </div>
                </div>
                <p id="hoja-resumen" className="sr-only">{resumenFilas}</p>
              </div>
            </section>
            {pendientes[tipo] && (
              <button type="button" className={`${BTN_TEXTO} w-full sm:hidden`} onClick={descartar} disabled={enviando !== null}>
                Descartar hoja
              </button>
            )}
          </div>

          <aside className="min-w-0 2xl:sticky 2xl:top-0 2xl:self-start">
            <MisHojas hojas={misHojas} error={misHojasError} onReintentar={() => void cargarMisHojas()} />
          </aside>
        </div>
      </div>

      {/* Live regions exist before their content so screen readers announce it. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-36 z-50 flex justify-center px-4 sm:bottom-28">
        <div role="status" aria-live="polite" className="w-full max-w-lg">
          {mensaje && mensaje.tono !== "error" && <Aviso mensaje={mensaje} onCerrar={() => setMensaje(null)} />}
        </div>
        <div role="alert" className="absolute inset-x-4 bottom-0 mx-auto max-w-lg">
          {mensaje?.tono === "error" && <Aviso mensaje={mensaje} onCerrar={() => setMensaje(null)} />}
        </div>
      </div>
    </AppLayout>
  );
}

function Aviso({ mensaje, onCerrar }: { mensaje: Mensaje; onCerrar: () => void }) {
  const tono =
    mensaje.tono === "ok"
      ? "border-state-ok bg-panel"
      : mensaje.tono === "error"
        ? "border-state-critical bg-panel"
        : "border-accent-strong bg-panel";
  const marca =
    mensaje.tono === "ok" ? "bg-state-ok" : mensaje.tono === "error" ? "bg-state-critical" : "bg-accent-strong";
  return (
    <div
      className={`pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl border-2 ${tono} px-4 py-3 shadow-card-hover`}
    >
      <span aria-hidden="true" className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${marca}`} />
      <p className="flex-1 text-[15px] font-semibold leading-snug text-ink">{mensaje.texto}</p>
      <button
        type="button"
        onClick={onCerrar}
        className={`-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-muted hover:text-ink ${FOCO}`}
      >
        <span aria-hidden="true" className="text-xl leading-none">×</span>
        <span className="sr-only">Cerrar mensaje</span>
      </button>
    </div>
  );
}

export default CapturaHojasPage;
