import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getAdminRegistros,
  revelarClave,
  type AdminRegistro,
  type AdminRegistroList,
} from "@/api/admin";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { StatusPill } from "@/components/ui/StatusPill";
import { DatabaseIcon, SearchIcon, ShieldIcon, VotersIcon } from "@/components/ui/icons";
import { useAuthStore } from "@/store/authStore";
import { useCampaignStore } from "@/store/campaignStore";

const PAGE = 20;

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Convert a datetime-local value (no tz) into an ISO UTC string for the API. */
function localToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Up to two initials from a full name, for the Avatar element. */
function initials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Ephemeral reveal flash ───────────────────────────────────────────────────
// PII is shown for AUTO_DISMISS_MS then automatically cleared.
// It is NEVER stored in global state or table rows.

const AUTO_DISMISS_MS = 15_000;

interface RevealState {
  registroId: string;
  clave: string;
}

interface RevealFlashProps {
  reveal: RevealState | null;
  onDismiss: () => void;
}

function RevealFlash({ reveal, onDismiss }: RevealFlashProps) {
  // Auto-dismiss after AUTO_DISMISS_MS
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [reveal, onDismiss]);

  if (!reveal) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Clave de elector revelada"
      className="fixed bottom-6 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 px-4"
    >
      <div className="card-premium flex items-start justify-between gap-4 p-4 shadow-2xl ring-1 ring-state-critical/30">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wider text-state-critical">
            Clave de elector — acceso auditado
          </p>
          <p className="mt-1 select-all break-all font-mono text-base font-semibold text-ink">
            {reveal.clave}
          </p>
          <p className="mt-1 font-mono text-[10px] text-ink-faint">
            ID {reveal.registroId.slice(0, 8)}… · se cierra en {AUTO_DISMISS_MS / 1000}s
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          className="focus-ring shrink-0 rounded p-1 text-ink-faint transition-colors hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminRegistrosPage() {
  const role = useAuthStore((s) => s.user?.role);
  const canReveal = role === "admin" || role === "superadmin";
  const activeId = useCampaignStore((s) => s.activeId);

  const [data, setData] = useState<AdminRegistroList | null>(null);
  const [offset, setOffset] = useState(0);

  // Raw inputs (debounced)
  const [qInput, setQInput] = useState("");
  const [seccionInput, setSeccionInput] = useState("");
  const [liderInput, setLiderInput] = useState("");
  const [activistaInput, setActivistaInput] = useState("");
  const [sinceInput, setSinceInput] = useState("");
  const [untilInput, setUntilInput] = useState("");

  // Committed filter values (driven by debounce)
  const [q, setQ] = useState("");
  const [seccion, setSeccion] = useState("");
  const [liderId, setLiderId] = useState("");
  const [activistaId, setActivistaId] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // PII reveal state — local only, never in table data or global store
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [revealing, setRevealing] = useState<string | null>(null); // row id being fetched

  // Debounce raw inputs → committed filters; reset to first page
  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      setQ(qInput.trim());
      setSeccion(seccionInput.trim());
      setLiderId(liderInput.trim());
      setActivistaId(activistaInput.trim());
      setSince(sinceInput);
      setUntil(untilInput);
    }, 350);
    return () => clearTimeout(t);
  }, [qInput, seccionInput, liderInput, activistaInput, sinceInput, untilInput]);

  // Reset to first page whenever the active base (or consolidated) changes.
  useEffect(() => {
    setOffset(0);
  }, [activeId]);

  const reload = useCallback(() => setRetryTick((n) => n + 1), []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    getAdminRegistros({
      limit: PAGE,
      offset,
      q: q || undefined,
      seccion: seccion || undefined,
      lider_id: liderId || undefined,
      activista_id: activistaId || undefined,
      since: localToIso(since),
      until: localToIso(until),
    })
      .then((res) => {
        if (!ignore) setData(res);
      })
      .catch((e: unknown) => {
        if (!ignore)
          setError(e instanceof Error ? e.message : "Error al cargar los registros");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [offset, q, seccion, liderId, activistaId, since, until, retryTick, activeId]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const hasFilters = Boolean(
    qInput || seccionInput || liderInput || activistaInput || sinceInput || untilInput,
  );

  // ── Summary KPIs — derived only from the already-fetched page (no extra fetch) ──
  const consentCount = useMemo(
    () => items.filter((r) => r.consentimiento).length,
    [items],
  );
  const claveCount = useMemo(
    () => items.filter((r) => Boolean(r.clave_masked)).length,
    [items],
  );

  // ── Reveal handler ─────────────────────────────────────────────────────────
  const handleReveal = useCallback(
    async (row: AdminRegistro) => {
      if (!canReveal) return;
      const confirmed = window.confirm(
        `¿Confirma revelar la clave de elector de ${row.nombre_completo}?\nEsta acción queda registrada en la bitácora de auditoría.`,
      );
      if (!confirmed) return;

      setRevealing(row.id);
      try {
        const res = await revelarClave(row.id);
        // Show ephemeral flash — PII stored only in component-local state
        setReveal({ registroId: row.id, clave: res.clave_elector });
      } catch (e: unknown) {
        const status = (e as { status?: number }).status;
        if (status === 422) {
          window.alert("Este registro no tiene clave de elector guardada.");
        } else if (status === 404) {
          window.alert("Registro no encontrado.");
        } else {
          window.alert(
            e instanceof Error ? e.message : "No se pudo revelar la clave.",
          );
        }
      } finally {
        setRevealing(null);
      }
    },
    [canReveal],
  );

  const dismissReveal = useCallback(() => setReveal(null), []);

  // ── Columns ────────────────────────────────────────────────────────────────
  // NOTE: No sortValue — server-paginated table; client sort is disabled.

  const columns = useMemo<Column<AdminRegistro>[]>(() => {
    const cols: Column<AdminRegistro>[] = [
      {
        key: "nombre_completo",
        header: "Nombre",
        render: (r) => (
          <span className="flex items-center gap-2.5">
            <Avatar initials={initials(r.nombre_completo)} variant="brand" />
            <span className="font-medium text-ink">{r.nombre_completo}</span>
          </span>
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
        key: "colonia",
        header: "Colonia",
        render: (r) => <span className="text-sm text-ink-muted">{r.colonia ?? "—"}</span>,
        hideOnCard: true,
      },
      {
        key: "telefono",
        header: "Contacto",
        render: (r) => (
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {r.telefono ?? "—"}
          </span>
        ),
        hideOnCard: true,
      },
      {
        key: "activista_nombre",
        header: "Activista",
        render: (r) => (
          <span className="text-sm text-ink-muted">{r.activista_nombre ?? "—"}</span>
        ),
        hideOnCard: true,
      },
      {
        key: "lider_nombre",
        header: "Líder",
        render: (r) => (
          <span className="text-sm text-ink-muted">{r.lider_nombre ?? "—"}</span>
        ),
        hideOnCard: true,
      },
      {
        key: "organization_name",
        header: "Base",
        render: (r) => (
          <span className="text-sm text-ink-muted">{r.organization_name ?? "—"}</span>
        ),
        hideOnCard: true,
      },
      {
        key: "clave_masked",
        header: "Clave",
        render: (r) => (
          <span className="font-mono text-xs tabular-nums text-ink-faint">
            {r.clave_masked ?? "—"}
          </span>
        ),
      },
      {
        key: "consentimiento",
        header: "Consentimiento",
        render: (r) =>
          r.consentimiento ? (
            <StatusPill kind="ok">Sí</StatusPill>
          ) : (
            <StatusPill kind="warn">Sin registrar</StatusPill>
          ),
        hideOnCard: true,
      },
      {
        key: "created_at",
        header: "Fecha",
        render: (r) => (
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {new Date(r.created_at).toLocaleString()}
          </span>
        ),
        hideOnCard: true,
      },
    ];

    if (canReveal) {
      cols.push({
        key: "_revelar",
        header: "",
        render: (r) => (
          <button
            type="button"
            disabled={revealing === r.id}
            onClick={(e) => {
              // Prevent any potential row-level click bubble
              e.stopPropagation();
              void handleReveal(r);
            }}
            className="btn-ghost focus-ring px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Revelar clave de ${r.nombre_completo}`}
          >
            {revealing === r.id ? "…" : "Revelar"}
          </button>
        ),
        align: "right",
      });
    }

    return cols;
  }, [canReveal, revealing, handleReveal]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Registros (Admin)" crumb="Admin">
      <PageHeader
        eyebrow="Consola de administración"
        title="Registros"
        accent="Activistas"
        subtitle="Vista cross-tenant de capturas. Revelar clave queda auditado."
      />

      {/* Summary — derived only from the page already on screen */}
      <div className="reveal mt-5" style={{ animationDelay: "80ms" }}>
        <SectionHeading
          eyebrow="Resumen"
          title="Vista general"
          note={hasFilters ? "Con filtros aplicados" : "Todas las capturas"}
        />
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            label="Registros"
            value="—"
            countTo={data?.total ?? 0}
            tone="warm"
            icon={<VotersIcon />}
            context={hasFilters ? "Coincidencias con los filtros" : "Capturados en la base"}
            delay={80}
          />
          <MetricCard
            label="Con consentimiento"
            value="—"
            countTo={consentCount}
            tone="teal"
            icon={<ShieldIcon />}
            context={`${consentCount} de ${items.length} en esta página`}
            delay={140}
          />
          <MetricCard
            label="Con clave capturada"
            value="—"
            countTo={claveCount}
            tone="accent"
            icon={<DatabaseIcon />}
            context={`${claveCount} de ${items.length} en esta página`}
            delay={200}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="reveal mt-5" style={{ animationDelay: "260ms" }}>
        <Card title="Filtros" accentDot>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {/* Búsqueda general */}
            <label className="flex flex-col gap-1.5 xl:col-span-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Búsqueda
              </span>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Nombre, teléfono…"
                  className="field-input focus-ring w-full pl-9"
                />
              </div>
            </label>

            {/* Sección */}
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

            {/* Líder ID (text input — v1) */}
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Líder ID
              </span>
              <input
                value={liderInput}
                onChange={(e) => setLiderInput(e.target.value)}
                placeholder="uuid…"
                className="field-input focus-ring w-full font-mono text-xs"
              />
            </label>

            {/* Activista ID (text input — v1) */}
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Activista ID
              </span>
              <input
                value={activistaInput}
                onChange={(e) => setActivistaInput(e.target.value)}
                placeholder="uuid…"
                className="field-input focus-ring w-full font-mono text-xs"
              />
            </label>

            {/* Desde */}
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Desde
              </span>
              <input
                type="datetime-local"
                value={sinceInput}
                onChange={(e) => setSinceInput(e.target.value)}
                className="field-input focus-ring w-full"
              />
            </label>

            {/* Hasta */}
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Hasta
              </span>
              <input
                type="datetime-local"
                value={untilInput}
                onChange={(e) => setUntilInput(e.target.value)}
                className="field-input focus-ring w-full"
              />
            </label>
          </div>

          {/* Clear row */}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setQInput("");
                setSeccionInput("");
                setLiderInput("");
                setActivistaInput("");
                setSinceInput("");
                setUntilInput("");
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
      <div className="reveal mt-5" style={{ animationDelay: "320ms" }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading eyebrow="Consola" title="Registros" />
          <span
            className={`font-mono text-xs text-ink-muted transition-opacity${loading ? " opacity-40" : ""}`}
          >
            {data && data.total > 0
              ? `${offset + 1}–${Math.min(offset + PAGE, data.total)} de ${data.total} registros`
              : ""}
          </span>
        </div>

        <DataState
          loading={loading}
          error={error}
          isEmpty={!loading && !error && items.length === 0}
          emptyMessage="Sin registros para los filtros seleccionados."
          onRetry={reload}
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
            emptyMessage="Sin registros para los filtros seleccionados."
          />
        </DataState>

        {/* Server-side pagination */}
        {!loading && !error && (data?.total ?? 0) > PAGE && (
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
              className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={loading || !data || offset + PAGE >= data.total}
              onClick={() => setOffset(offset + PAGE)}
              className="btn-ghost focus-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {/* Ephemeral PII reveal flash — auto-dismissed, never in table state */}
      <RevealFlash reveal={reveal} onDismiss={dismissReveal} />
    </AppLayout>
  );
}
