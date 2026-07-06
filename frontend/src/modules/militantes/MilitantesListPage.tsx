// frontend/src/modules/militantes/MilitantesListPage.tsx
import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { SearchIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import {
  listMilitantes,
  type Militante,
  type MilitanteEstado,
  type QualityFlags,
} from "@/api/militantes";

import { MilitanteDetail } from "./components/MilitanteDetail";

const PAGE = 20;

const ESTADO_OPTIONS: { value: MilitanteEstado | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "REGISTRADO", label: "Registrado" },
  { value: "VALIDADO", label: "Validado" },
  { value: "OBSERVADO", label: "Observado" },
];

const ESTADO_CLASS: Record<MilitanteEstado, string> = {
  REGISTRADO: "border-line bg-panel-hover text-ink-muted",
  VALIDADO: "border-state-ok/30 bg-state-ok/10 text-state-ok",
  OBSERVADO: "border-state-warning/30 bg-state-warning/10 text-state-warning",
};

const ESTADO_LABEL: Record<MilitanteEstado, string> = {
  REGISTRADO: "Registrado",
  VALIDADO: "Validado",
  OBSERVADO: "Observado",
};

type FlagKey = keyof QualityFlags;

const FLAG_OPTIONS: { value: FlagKey | ""; label: string }[] = [
  { value: "", label: "Todas las banderas" },
  { value: "falta_curp", label: "Falta CURP" },
  { value: "falta_foto_frente", label: "Falta foto (frente)" },
  { value: "falta_foto_reverso", label: "Falta foto (reverso)" },
  { value: "falta_firma", label: "Falta firma" },
  { value: "clave_incompleta", label: "Clave incompleta" },
  { value: "posible_duplicado", label: "Posible duplicado" },
];

const FLAG_LABEL: Record<FlagKey, string> = {
  falta_curp: "Falta CURP",
  falta_foto_frente: "Falta foto (frente)",
  falta_foto_reverso: "Falta foto (reverso)",
  falta_firma: "Falta firma",
  clave_incompleta: "Clave incompleta",
  posible_duplicado: "Posible duplicado",
};

/** Flags that indicate a data-integrity risk (rendered as a critical dot); the
 * rest are simple capture-completeness gaps (rendered as a warning dot). */
const FLAG_CRITICAL: Partial<Record<FlagKey, true>> = {
  posible_duplicado: true,
};

function EstadoPill({ estado }: { estado: MilitanteEstado }) {
  return (
    <span className={`pill ${ESTADO_CLASS[estado] ?? ""}`}>
      {ESTADO_LABEL[estado] ?? estado}
    </span>
  );
}

function QualityDots({ flags }: { flags: QualityFlags | null }) {
  const active = flags
    ? (Object.keys(flags) as FlagKey[]).filter((k) => flags[k])
    : [];
  if (active.length === 0) return <span className="text-ink-faint">—</span>;
  return (
    <span className="flex items-center gap-1.5" aria-label="Banderas de calidad">
      {active.map((k) => (
        <span
          key={k}
          title={FLAG_LABEL[k]}
          aria-hidden="true"
          className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-panel ${
            FLAG_CRITICAL[k] ? "bg-state-critical" : "bg-state-warning"
          }`}
        />
      ))}
    </span>
  );
}

/**
 * Padrón de militantes: filtros + tabla paginada (servidor) + drawer de
 * detalle con validar/observar y revelado auditado de CURP/clave/documentos.
 */
export function MilitantesListPage() {
  const [offset, setOffset] = useState(0);

  // Raw inputs (debounced) vs. committed filter values.
  const [qInput, setQInput] = useState("");
  const [seccionInput, setSeccionInput] = useState("");
  const [activistaInput, setActivistaInput] = useState("");
  const [estadoInput, setEstadoInput] = useState<MilitanteEstado | "">("");
  const [flagInput, setFlagInput] = useState<FlagKey | "">("");

  const [q, setQ] = useState("");
  const [seccion, setSeccion] = useState("");
  const [activistaId, setActivistaId] = useState("");
  const [estado, setEstado] = useState<MilitanteEstado | "">("");
  const [flag, setFlag] = useState<FlagKey | "">("");

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      setQ(qInput.trim());
      setSeccion(seccionInput.trim());
      setActivistaId(activistaInput.trim());
      setEstado(estadoInput);
      setFlag(flagInput);
    }, 350);
    return () => clearTimeout(t);
  }, [qInput, seccionInput, activistaInput, estadoInput, flagInput]);

  const state = useAsync(
    () =>
      listMilitantes({
        limit: PAGE,
        offset,
        q: q || undefined,
        seccion: seccion || undefined,
        activista_id: activistaId || undefined,
        estado: estado || undefined,
        flag: flag || undefined,
      }),
    [offset, q, seccion, activistaId, estado, flag],
  );

  const data = state.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const hasFilters = Boolean(
    qInput || seccionInput || activistaInput || estadoInput || flagInput,
  );

  const columns = useMemo<Column<Militante>[]>(
    () => [
      {
        key: "folio",
        header: "Folio",
        render: (r) => (
          <span className="font-mono text-xs text-ink-muted">{r.folio}</span>
        ),
      },
      {
        key: "nombre_completo",
        header: "Nombre",
        render: (r) => (
          <span className="font-medium text-ink">{r.nombre_completo}</span>
        ),
      },
      {
        key: "seccion",
        header: "Sección",
        render: (r) => (
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {r.seccion ?? "—"}
          </span>
        ),
        hideOnCard: true,
      },
      {
        key: "activista_nombre",
        header: "Activista",
        render: (r) => (
          <span className="text-sm text-ink-muted">
            {r.activista_nombre ?? "—"}
          </span>
        ),
        hideOnCard: true,
      },
      {
        key: "estado",
        header: "Estado",
        render: (r) => <EstadoPill estado={r.estado} />,
      },
      {
        key: "quality_flags",
        header: "Banderas",
        render: (r) => <QualityDots flags={r.quality_flags} />,
      },
    ],
    [],
  );

  return (
    <AppLayout title="Militantes" crumb="Ciudadanía">
      <PageHeader
        eyebrow="Ciudadanía"
        title="Consola de"
        accent="Militantes"
        subtitle="Padrón de militantes capturados por tu estructura de activistas."
      />

      {/* Filters */}
      <div className="reveal mt-5" style={{ animationDelay: "180ms" }}>
        <Card title="Filtros" accentDot>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <label className="flex flex-col gap-1.5 xl:col-span-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Búsqueda
              </span>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Nombre, folio…"
                  className="field-input focus-ring w-full pl-9"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Sección
              </span>
              <input
                value={seccionInput}
                onChange={(e) => setSeccionInput(e.target.value)}
                placeholder="0001"
                className="field-input focus-ring w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Activista
              </span>
              <input
                value={activistaInput}
                onChange={(e) => setActivistaInput(e.target.value)}
                placeholder="Nombre o ID"
                className="field-input focus-ring w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Estado
              </span>
              <select
                value={estadoInput}
                onChange={(e) =>
                  setEstadoInput(e.target.value as MilitanteEstado | "")
                }
                className="field-input focus-ring w-full"
              >
                {ESTADO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Bandera
              </span>
              <select
                value={flagInput}
                onChange={(e) => setFlagInput(e.target.value as FlagKey | "")}
                className="field-input focus-ring w-full"
              >
                {FLAG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setQInput("");
                setSeccionInput("");
                setActivistaInput("");
                setEstadoInput("");
                setFlagInput("");
              }}
              disabled={!hasFilters}
              className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              Limpiar filtros
            </button>
          </div>
        </Card>
      </div>

      {/* Table */}
      <div className="reveal mt-5" style={{ animationDelay: "220ms" }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
            <span
              className="h-1.5 w-1.5 rounded-full bg-accent-gradient shadow-glow"
              aria-hidden="true"
            />
            Militantes
          </span>
          <span
            className={`font-mono text-xs text-ink-muted transition-opacity${
              state.loading ? " opacity-40" : ""
            }`}
          >
            {data && data.total > 0
              ? `${offset + 1}–${Math.min(offset + PAGE, data.total)} de ${data.total} militantes`
              : ""}
          </span>
        </div>

        {data && !data.has_territory ? (
          <div className="card-premium px-5 py-12 text-center text-ink-muted">
            Pídele a tu administrador que te asigne un territorio.
          </div>
        ) : (
          <>
            <DataState
              loading={state.loading}
              error={state.error}
              isEmpty={!state.loading && !state.error && items.length === 0}
              emptyMessage="Sin militantes para los filtros seleccionados."
              onRetry={state.reload}
              skeleton={
                <div className="card-premium p-4">
                  <SkeletonRows rows={8} />
                </div>
              }
            >
              <DataTable
                columns={columns}
                rows={items}
                rowKey={(r) => r.id}
                pageSize={PAGE}
                onRowClick={(r) => setSelectedId(r.id)}
                emptyMessage="Sin militantes para los filtros seleccionados."
              />
            </DataState>

            {/* Server-side pagination */}
            {!state.loading && !state.error && (data?.total ?? 0) > PAGE && (
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={state.loading || offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE))}
                  className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={state.loading || !data || offset + PAGE >= data.total}
                  onClick={() => setOffset(offset + PAGE)}
                  className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedId && (
        <MilitanteDetail
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={state.reload}
        />
      )}
    </AppLayout>
  );
}

export default MilitantesListPage;
