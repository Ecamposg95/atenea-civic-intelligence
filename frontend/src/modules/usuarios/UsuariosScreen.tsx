import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { deleteUser, resetPassword, restoreUser, setActive } from "@/api/users";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuthStore } from "@/store/authStore";
import type { UserRole } from "@/types/auth";

import {
  createManagedUser,
  fetchPeopleByRole,
  fetchRoleCounts,
  fetchSecciones,
  fetchUsers,
  updateManagedUser,
  type SeccionOption,
} from "./api";
import { ConfirmDeleteDialog, TempPasswordDialog, type TempSecret } from "./components/Dialogs";
import { CloseGlyph } from "./components/Overlay";
import { UserDrawer, type DrawerState } from "./components/UserDrawer";
import { UserList } from "./components/UserList";
import {
  DEFAULT_FILTERS,
  pageCount,
  rangeLabel,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  toListParams,
  toPayload,
  translateError,
  type ManagedUser,
  type SortKey,
  type StatusFilter,
  type UserFilters,
} from "./filters";
import { assignableRoles, canManageLifecycle, ROLE_DOT, ROLE_PLURAL, visibleRoles } from "./roles";
import { BTN, FOCUS, INPUT, LABEL } from "./ui";

const PAGE_SIZE = 20;

export function UsuariosScreen() {
  const me = useAuthStore((s) => s.user);
  const actor = useMemo(() => (me ? { id: me.id, role: me.role } : null), [me]);
  const allowedRoles = useMemo(() => assignableRoles(actor?.role), [actor]);
  const chipRoles = useMemo(() => visibleRoles(actor?.role), [actor]);
  const lifecycle = canManageLifecycle(actor?.role);

  /* ---------------- list state ---------------- */
  const [filters, setFilters] = useState<UserFilters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Partial<Record<UserRole, number>>>({});
  const [lideres, setLideres] = useState<ManagedUser[]>([]);
  const [coordinadores, setCoordinadores] = useState<ManagedUser[]>([]);
  const [secciones, setSecciones] = useState<SeccionOption[] | null>(null);
  const seccionesLoaded = useRef(false);

  /* ---------------- action state ---------------- */
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [saving, setSaving] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [secret, setSecret] = useState<TempSecret | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const patch = (p: Partial<UserFilters>) =>
    setFilters((f) => ({ ...f, page: 0, ...p }));

  // Debounced search box → filters.q
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 0 }));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setListError(null);
    try {
      const data = await fetchUsers(toListParams(filters, PAGE_SIZE));
      if (id !== reqId.current) return;
      setRows(data.items);
      setTotal(data.total);
    } catch (err) {
      if (id !== reqId.current) return;
      setListError(translateError(err, "No se pudo cargar la lista de usuarios."));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSide = useCallback(async () => {
    const [c, l, co] = await Promise.all([
      fetchRoleCounts(chipRoles).catch(() => ({})),
      fetchPeopleByRole("lider"),
      fetchPeopleByRole("coordinador"),
    ]);
    setCounts(c);
    setLideres(l);
    setCoordinadores(co);
  }, [chipRoles]);

  useEffect(() => {
    void loadSide();
  }, [loadSide]);

  const refreshAll = useCallback(() => {
    void load();
    void loadSide();
  }, [load, loadSide]);

  const names = useMemo(() => {
    const m: Record<string, string> = {};
    [...lideres, ...coordinadores].forEach((u) => (m[u.id] = u.full_name));
    return m;
  }, [lideres, coordinadores]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  /* ---------------- actions ---------------- */
  const openDrawer = (s: DrawerState) => {
    setDrawerError(null);
    setDrawer(s);
    if (!seccionesLoaded.current) {
      seccionesLoaded.current = true;
      void fetchSecciones().then(setSecciones);
    }
  };

  const replaceRow = (u: ManagedUser) => {
    setRows((rs) => rs.map((r) => (r.id === u.id ? { ...r, ...u } : r)));
    setDrawer((d) => (d?.mode === "edit" && d.user.id === u.id ? { mode: "edit", user: { ...d.user, ...u } } : d));
  };

  const handleSubmit: Parameters<typeof UserDrawer>[0]["onSubmit"] = async (mode, values, diff) => {
    setSaving(true);
    setDrawerError(null);
    try {
      if (mode === "create") {
        const res = await createManagedUser({ ...toPayload(values), email: values.email.trim() });
        setDrawer(null);
        if (res.temporary_password) {
          setSecret({
            name: res.user.full_name,
            email: res.user.email,
            password: res.temporary_password,
            reason: "create",
          });
        }
        setNotice({ text: `${res.user.full_name} se creó como usuario.`, tone: "ok" });
        refreshAll();
      } else if (drawer?.mode === "edit") {
        if (diff && Object.keys(diff).length > 0) {
          const u = await updateManagedUser(drawer.user.id, diff);
          replaceRow(u);
          setNotice({ text: `Cambios guardados para ${u.full_name}.`, tone: "ok" });
          refreshAll();
        }
        setDrawer(null);
      }
    } catch (err) {
      setDrawerError(translateError(err, "No se pudieron guardar los cambios."));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: ManagedUser, next: boolean) => {
    setBusyId(u.id);
    try {
      const updated = await setActive(u.id, next);
      replaceRow(updated as ManagedUser);
      setNotice({
        text: next ? `${u.full_name} puede volver a entrar.` : `${u.full_name} ya no puede iniciar sesión.`,
        tone: "ok",
      });
      // The row no longer matches an active/inactive filter: reload the page.
      if (filters.status === "activos" || filters.status === "inactivos") void load();
      void loadSide();
    } catch (err) {
      setNotice({ text: translateError(err, "No se pudo cambiar el estado."), tone: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const doReset = async (u: ManagedUser) => {
    setBusyId(u.id);
    try {
      const r = await resetPassword(u.id);
      setSecret({ name: u.full_name, email: u.email, password: r.temporary_password, reason: "reset" });
      replaceRow({ ...u, must_change_password: true });
    } catch (err) {
      setNotice({ text: translateError(err, "No se pudo restablecer la contraseña."), tone: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteUser(toDelete.id);
      setNotice({ text: `${toDelete.full_name} se eliminó. Puedes restaurarlo desde “Eliminados”.`, tone: "ok" });
      setToDelete(null);
      setDrawer(null);
      refreshAll();
    } catch (err) {
      setNotice({ text: translateError(err, "No se pudo eliminar el usuario."), tone: "error" });
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const doRestore = async (u: ManagedUser) => {
    setBusyId(u.id);
    try {
      await restoreUser(u.id);
      setNotice({ text: `${u.full_name} se restauró y está activo.`, tone: "ok" });
      refreshAll();
    } catch (err) {
      setNotice({ text: translateError(err, "No se pudo restaurar el usuario."), tone: "error" });
    } finally {
      setBusyId(null);
    }
  };

  /* ---------------- render ---------------- */
  const pages = pageCount(total, PAGE_SIZE);
  const hasQuery = Boolean(filters.q || filters.role);
  const activeTotal = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  const empty = (() => {
    if (hasQuery)
      return {
        title: "Nadie coincide con esta búsqueda",
        body: "Revisa la ortografía o quita el filtro de rol.",
        action: (
          <button
            type="button"
            className={BTN.secondary}
            onClick={() => {
              setSearch("");
              patch({ q: "", role: null });
            }}
          >
            Limpiar búsqueda y filtros
          </button>
        ),
      };
    if (filters.status === "eliminados")
      return { title: "No hay usuarios eliminados", body: "Las cuentas que elimines aparecerán aquí para restaurarlas.", action: null };
    if (filters.status === "inactivos")
      return { title: "No hay cuentas desactivadas", body: "Todas las cuentas pueden iniciar sesión.", action: null };
    return {
      title: "Aún no hay usuarios",
      body: "Da de alta a tu equipo: capturistas, líderes y coordinación.",
      action:
        allowedRoles.length > 0 ? (
          <button type="button" className={BTN.primary} onClick={() => openDrawer({ mode: "create" })}>
            Crear el primer usuario
          </button>
        ) : null,
    };
  })();

  return (
    <AppLayout title="Usuarios" crumb="Administración">
      <div className="mx-auto w-full max-w-6xl">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Usuarios</h1>
            <p className="mt-1 max-w-prose text-[15px] text-ink-muted">
              Da de alta a tu equipo, asigna roles y secciones, y controla quién puede entrar.
            </p>
          </div>
          {allowedRoles.length > 0 && (
            <button type="button" className={`${BTN.primary} w-full sm:w-auto`} onClick={() => openDrawer({ mode: "create" })}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nuevo usuario
            </button>
          )}
        </header>

        {/* Team roster — doubles as the role filter */}
        <nav aria-label="Filtrar por rol" className="-mx-4 mb-5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap">
            <li>
              <RoleChip
                label="Todo el equipo"
                count={activeTotal || undefined}
                pressed={filters.role === null}
                onClick={() => patch({ role: null })}
              />
            </li>
            {chipRoles.map((r) => (
              <li key={r}>
                <RoleChip
                  label={ROLE_PLURAL[r]}
                  dot={ROLE_DOT[r]}
                  count={counts[r]}
                  pressed={filters.role === r}
                  onClick={() => patch({ role: filters.role === r ? null : r })}
                />
              </li>
            ))}
          </ul>
        </nav>

        {/* Toolbar */}
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
          <div>
            <label htmlFor="usr-search" className={LABEL}>
              Buscar
            </label>
            <div className="relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                id="usr-search"
                type="search"
                className={`${INPUT} pl-10 pr-12`}
                placeholder="Nombre o correo"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Borrar búsqueda"
                  onClick={() => setSearch("")}
                  className={`${FOCUS} absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-lg text-ink-muted hover:text-ink`}
                >
                  <CloseGlyph />
                </button>
              )}
            </div>
          </div>

          <fieldset>
            <legend className={LABEL}>Estado</legend>
            <div className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg border border-line-strong bg-bg-sunken p-0.5">
              {STATUS_OPTIONS.filter((o) => lifecycle || o.value !== "eliminados").map((o) => (
                <label
                  key={o.value}
                  className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                    filters.status === o.value ? "bg-panel text-ink shadow-sm" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <input
                    type="radio"
                    name="usr-status"
                    value={o.value}
                    checked={filters.status === o.value}
                    onChange={() => patch({ status: o.value as StatusFilter })}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="usr-sort" className={LABEL}>
              Ordenar
            </label>
            <select
              id="usr-sort"
              className={`${INPUT} md:w-44`}
              value={filters.sort}
              onChange={(e) => patch({ sort: e.target.value as SortKey })}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results */}
        <p className="mb-2 text-sm text-ink-muted" aria-live="polite">
          {loading ? "Cargando usuarios…" : listError ? "" : rangeLabel(filters.page, PAGE_SIZE, total)}
        </p>

        {loading && rows.length === 0 ? (
          <ListSkeleton />
        ) : listError ? (
          <div role="alert" className="rounded-card border border-state-critical/50 bg-state-critical/10 p-5">
            <p className="font-semibold text-ink">No se pudo cargar la lista</p>
            <p className="mt-1 text-sm text-ink-muted">{listError}</p>
            <button type="button" className={`${BTN.secondary} mt-4`} onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-card border border-dashed border-line-strong bg-panel px-5 py-10 text-center">
            <p className="font-display text-lg font-semibold text-ink">{empty.title}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{empty.body}</p>
            {empty.action && <div className="mt-5">{empty.action}</div>}
          </div>
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
            <UserList
              rows={rows}
              status={filters.status}
              actor={actor}
              names={names}
              busyId={busyId}
              onEdit={(u) => openDrawer({ mode: "edit", user: u })}
              onToggleActive={(u, next) => void toggleActive(u, next)}
              onRestore={(u) => void doRestore(u)}
            />
          </div>
        )}

        {/* Pagination */}
        {!listError && total > PAGE_SIZE && (
          <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              className={BTN.secondary}
              disabled={filters.page === 0 || loading}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Anterior
            </button>
            <span className="text-sm text-ink-muted">
              Página {filters.page + 1} de {pages}
            </span>
            <button
              type="button"
              className={BTN.secondary}
              disabled={filters.page + 1 >= pages || loading}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Siguiente
            </button>
          </nav>
        )}
      </div>

      <UserDrawer
        state={drawer}
        actor={actor}
        allowedRoles={allowedRoles}
        secciones={secciones}
        lideres={lideres.filter((l) => drawer?.mode !== "edit" || l.id !== drawer.user.id)}
        coordinadores={coordinadores.filter((c) => drawer?.mode !== "edit" || c.id !== drawer.user.id)}
        saving={saving}
        serverError={drawerError}
        onClose={() => setDrawer(null)}
        onSubmit={(m, v, d) => void handleSubmit(m, v, d)}
        onToggleActive={(u, next) => void toggleActive(u, next)}
        onResetPassword={(u) => void doReset(u)}
        onDelete={(u) => setToDelete(u)}
        onTerritoryChanged={() => void load()}
      />

      <ConfirmDeleteDialog
        user={toDelete}
        busy={deleting}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void doDelete()}
      />
      <TempPasswordDialog secret={secret} onClose={() => setSecret(null)} />

      {/* Status toast (announced to screen readers) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center p-4" aria-live="polite" role="status">
        {notice && (
          <div
            className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-card border bg-panel-raised px-4 py-3 text-sm text-ink shadow-panel ${
              notice.tone === "error" ? "border-state-critical/60" : "border-line-strong"
            }`}
          >
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ background: notice.tone === "error" ? "rgb(var(--c-critical))" : "rgb(var(--c-ok))" }}
              aria-hidden="true"
            />
            <span className="flex-1">{notice.text}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setNotice(null)}
              className={`${FOCUS} -my-2 -mr-2 grid h-11 w-11 place-items-center rounded-lg text-ink-muted hover:text-ink`}
            >
              <CloseGlyph />
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function RoleChip({
  label,
  dot,
  count,
  pressed,
  onClick,
}: {
  label: string;
  dot?: string;
  count?: number;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`${FOCUS} inline-flex min-h-[44px] items-center gap-2 rounded-pill border px-4 text-sm font-medium transition-colors ${
        pressed
          ? "border-ink bg-ink text-bg"
          : "border-line-strong bg-panel text-ink hover:bg-panel-hover"
      }`}
    >
      {dot && <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} aria-hidden="true" />}
      {label}
      {count !== undefined && (
        <span
          className={`min-w-[1.5rem] rounded-pill px-1.5 text-center text-[13px] tabular-nums ${
            pressed ? "bg-bg/20 text-bg" : "bg-panel-hover text-ink-muted"
          }`}
        >
          <span className="sr-only">, </span>
          {count}
          <span className="sr-only"> activos</span>
        </span>
      )}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-card border border-line bg-panel p-4">
          <div className="h-10 w-10 animate-pulse rounded-full bg-panel-hover" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-panel-hover" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-panel-hover" />
          </div>
          <div className="hidden h-7 w-28 animate-pulse rounded-pill bg-panel-hover sm:block" />
        </div>
      ))}
    </div>
  );
}
