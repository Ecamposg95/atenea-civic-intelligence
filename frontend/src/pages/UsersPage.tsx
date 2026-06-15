import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  createUser,
  deleteUser,
  listUsers,
  resetPassword,
  restoreUser,
  setActive,
  updateUser,
} from "@/api/users";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SearchIcon, UserIcon } from "@/components/ui/icons";
import { useAuthStore } from "@/store/authStore";
import type { User, UserRole } from "@/types/auth";
import type { UserCreatePayload, UserUpdatePayload } from "@/types/users";

const PAGE_SIZE = 20;
const ALL_ROLES: UserRole[] = ["superadmin", "admin", "analyst", "viewer"];

const ROLE_BADGE: Record<UserRole, string> = {
  superadmin: "border-accent/30 bg-accent/10 text-accent",
  admin: "border-teal/30 bg-teal/10 text-teal",
  analyst: "border-state-warning/30 bg-state-warning/10 text-state-warning",
  viewer: "border-line text-ink-muted",
};

type StatusFilter = "all" | "active" | "inactive";

export function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const isSuper = currentUser?.role === "superadmin";
  const assignableRoles = useMemo(
    () => (isSuper ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "superadmin")),
    [isSuper],
  );

  const [rows, setRows] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [sort, setSort] = useState<"created_at" | "full_name" | "email" | "role">("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [tempPassword, setTempPassword] = useState<{ label: string; value: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers({
        q: query || undefined,
        role: role || undefined,
        is_active: statusFilter === "all" ? undefined : statusFilter === "active",
        include_deleted: includeDeleted || undefined,
        sort,
        order,
        limit: PAGE_SIZE,
        offset,
      });
      setRows(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los usuarios");
    } finally {
      setLoading(false);
    }
  }, [query, role, statusFilter, includeDeleted, sort, order, offset]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setQuery(searchInput.trim());
  };

  const withRefresh = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "La operación falló");
    }
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppLayout title="Usuarios" crumb="Administración · Control de acceso">
      <PageHeader
        eyebrow="Administración"
        title="Gestión de"
        accent="usuarios"
        subtitle="Alta, roles, estado y restablecimiento de contraseñas. Acciones tenant-scoped y auditadas."
        actions={
          <>
            <div className="card-premium px-4 py-3">
              <div className="eyebrow mb-1.5">Usuarios</div>
              <div className="flex items-center gap-2">
                <UserIcon className="h-5 w-5 text-accent" />
                <AnimatedNumber
                  value={total}
                  className="font-display text-2xl font-bold tabular-nums text-ink"
                />
              </div>
            </div>
            <Button
              variant="primary"
              className="shadow-glow-accent"
              onClick={() => setCreateOpen(true)}
            >
              + Nuevo usuario
            </Button>
          </>
        }
      />

      {/* Toolbar */}
      <div className="reveal card-premium mb-4 flex flex-wrap items-center gap-3 p-4" style={{ animationDelay: "120ms" }}>
        <form onSubmit={onSearch} className="relative flex-1 min-w-[220px]">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            className="field-input pl-9"
            placeholder="Buscar por nombre o email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </form>
        <select
          className="field-input w-auto"
          value={role}
          onChange={(e) => {
            setOffset(0);
            setRole(e.target.value as UserRole | "");
          }}
        >
          <option value="">Todos los roles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className="field-input w-auto"
          value={statusFilter}
          onChange={(e) => {
            setOffset(0);
            setStatusFilter(e.target.value as StatusFilter);
          }}
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
        <select
          className="field-input w-auto"
          value={`${sort}:${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(":");
            setSort(s as typeof sort);
            setOrder(o as typeof order);
          }}
        >
          <option value="created_at:desc">Más recientes</option>
          <option value="created_at:asc">Más antiguos</option>
          <option value="full_name:asc">Nombre A–Z</option>
          <option value="email:asc">Email A–Z</option>
          <option value="role:asc">Rol</option>
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-line bg-bg-sunken accent-accent"
            checked={includeDeleted}
            onChange={(e) => {
              setOffset(0);
              setIncludeDeleted(e.target.checked);
            }}
          />
          Incluir eliminados
        </label>
      </div>

      {error && (
        <div className="reveal mb-4 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="reveal card-premium overflow-x-auto !p-0" style={{ animationDelay: "200ms" }}>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line bg-bg-sunken/60 text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Teléfono</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="h-5 animate-pulse rounded bg-panel-hover" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-ink-faint">
                  Sin usuarios para los filtros actuales.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((u) => {
                const deleted = false; // deleted_at not surfaced; inactive implies status
                return (
                  <tr
                    key={u.id}
                    className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-hover/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="metric-chip h-8 w-8 shrink-0 font-display text-[11px] font-bold text-accent">
                          {u.full_name
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase() ?? "")
                            .join("") || "—"}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink">{u.full_name}</div>
                          <div className="truncate font-mono text-xs text-ink-faint">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`pill ${ROLE_BADGE[u.role]}`}>{u.role}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {u.is_active ? (
                          <span className="pill border-teal/30 bg-teal/10 text-teal">Activo</span>
                        ) : (
                          <span className="pill border-state-critical/30 bg-state-critical/10 text-state-critical">
                            Inactivo
                          </span>
                        )}
                        {u.must_change_password && (
                          <span className="pill border-state-warning/30 bg-state-warning/10 text-state-warning">
                            Cambio pendiente
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-muted">{u.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5 text-xs">
                        <button
                          className="rounded-md border border-line bg-bg-sunken px-2 py-1 font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent/10"
                          onClick={() => setEditing(u)}
                        >
                          Editar
                        </button>
                        {u.is_active ? (
                          <button
                            className="rounded-md border border-line bg-bg-sunken px-2 py-1 font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                            onClick={() => withRefresh(() => setActive(u.id, false))}
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            className="rounded-md border border-line bg-bg-sunken px-2 py-1 font-medium text-teal transition-colors hover:border-teal/40 hover:bg-teal/10"
                            onClick={() => withRefresh(() => setActive(u.id, true))}
                          >
                            Activar
                          </button>
                        )}
                        <button
                          className="rounded-md border border-line bg-bg-sunken px-2 py-1 font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                          onClick={() =>
                            withRefresh(async () => {
                              const r = await resetPassword(u.id);
                              setTempPassword({
                                label: `Contraseña temporal para ${u.email}`,
                                value: r.temporary_password,
                              });
                            })
                          }
                        >
                          Reset clave
                        </button>
                        <button
                          className="rounded-md border border-line bg-bg-sunken px-2 py-1 font-medium text-state-critical transition-colors hover:border-state-critical/40 hover:bg-state-critical/10"
                          onClick={() => setConfirmDelete(u)}
                        >
                          Eliminar
                        </button>
                        {includeDeleted && !deleted && (
                          <button
                            className="rounded-md border border-line bg-bg-sunken px-2 py-1 font-medium text-teal transition-colors hover:border-teal/40 hover:bg-teal/10"
                            onClick={() => withRefresh(() => restoreUser(u.id))}
                          >
                            Restaurar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
        <span>
          {total} usuario{total === 1 ? "" : "s"} · página {page} de {pages}
        </span>
        <div className="flex gap-2">
          <Button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
          >
            Anterior
          </Button>
          <Button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
          >
            Siguiente
          </Button>
        </div>
      </div>

      {/* Create modal */}
      <CreateUserModal
        open={createOpen}
        roles={assignableRoles}
        onClose={() => setCreateOpen(false)}
        onCreated={(label, value) => {
          setCreateOpen(false);
          if (value) setTempPassword({ label, value });
          void fetchUsers();
        }}
      />

      {/* Edit modal */}
      <EditUserModal
        user={editing}
        roles={assignableRoles}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void fetchUsers();
        }}
      />

      {/* Delete confirm */}
      <Modal
        open={Boolean(confirmDelete)}
        title="Eliminar usuario"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() =>
                withRefresh(async () => {
                  if (confirmDelete) await deleteUser(confirmDelete.id);
                  setConfirmDelete(null);
                })
              }
            >
              Eliminar
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          Se aplicará un borrado lógico (soft-delete) a{" "}
          <span className="text-ink">{confirmDelete?.email}</span>. Podrás
          restaurarlo después con el filtro “Incluir eliminados”.
        </p>
      </Modal>

      {/* Temp password reveal */}
      <Modal
        open={Boolean(tempPassword)}
        title="Contraseña temporal"
        onClose={() => setTempPassword(null)}
        footer={<Button variant="primary" onClick={() => setTempPassword(null)}>Listo</Button>}
      >
        <p className="text-sm text-ink-muted">{tempPassword?.label}</p>
        <div className="mt-3 select-all rounded-lg border border-line bg-bg-sunken px-3 py-2.5 font-mono text-sm text-ink">
          {tempPassword?.value}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Cópiala ahora: no se volverá a mostrar. El usuario deberá cambiarla al
          iniciar sesión.
        </p>
      </Modal>
    </AppLayout>
  );
}

/* ----------------------------- Create modal ----------------------------- */
function CreateUserModal({
  open,
  roles,
  onClose,
  onCreated,
}: {
  open: boolean;
  roles: UserRole[];
  onClose: () => void;
  onCreated: (label: string, tempPassword: string | null) => void;
}) {
  const [form, setForm] = useState<UserCreatePayload>({
    email: "",
    full_name: "",
    role: "viewer",
    phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await createUser({ ...form, phone: form.phone || null });
      onCreated(`Contraseña temporal para ${res.user.email}`, res.temporary_password);
      setForm({ email: "", full_name: "", role: "viewer", phone: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el usuario");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Nuevo usuario"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="create-user-form" disabled={saving}>
            {saving ? "Creando…" : "Crear usuario"}
          </Button>
        </>
      }
    >
      <form id="create-user-form" className="space-y-4" onSubmit={submit}>
        <div>
          <label className="field-label">Nombre completo</label>
          <input
            className="field-input"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="field-label">Email</label>
          <input
            type="email"
            className="field-input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Rol</label>
            <select
              className="field-input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Teléfono (opcional)</label>
            <input
              className="field-input"
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
        </div>
        <p className="text-xs text-ink-faint">
          Se generará una contraseña temporal; el usuario deberá cambiarla en su
          primer inicio de sesión.
        </p>
        {error && (
          <div className="rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}

/* ------------------------------ Edit modal ------------------------------ */
function EditUserModal({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: User | null;
  roles: UserRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<UserUpdatePayload>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name,
        role: user.role,
        phone: user.phone ?? "",
        is_active: user.is_active,
      });
      setError(null);
    }
  }, [user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSaving(true);
    try {
      await updateUser(user.id, { ...form, phone: form.phone || null });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(user)}
      title={`Editar ${user?.full_name ?? ""}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="edit-user-form" disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </>
      }
    >
      <form id="edit-user-form" className="space-y-4" onSubmit={submit}>
        <div>
          <label className="field-label">Nombre completo</label>
          <input
            className="field-input"
            value={form.full_name ?? ""}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Rol</label>
            <select
              className="field-input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Teléfono</label>
            <input
              className="field-input"
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-line bg-bg-sunken accent-accent"
            checked={Boolean(form.is_active)}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          Cuenta activa
        </label>
        {error && (
          <div className="rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
