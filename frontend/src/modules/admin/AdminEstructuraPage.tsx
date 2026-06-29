import { FormEvent, useEffect, useState } from "react";

import { getEstructura, type EstructuraNode } from "@/api/admin";
import { createUser, updateUser } from "@/api/users";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { Modal } from "@/components/ui/Modal";
import { useAsync } from "@/hooks/useAsync";
import type { UserRole } from "@/types/auth";
import type { UserCreatePayload, UserUpdatePayload } from "@/types/users";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A user drawn from the estructura tree, ready for the edit form. */
interface EditableUser {
  id: string;
  full_name: string;
  email: string;
  role: "lider" | "activista";
  seccion: string | null;
  lider_id: string | null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AdminEstructuraPage() {
  const { data, loading, error, reload } = useAsync(getEstructura, []);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EditableUser | null>(null);

  const liders = data ?? [];

  return (
    <AppLayout title="Estructura">
      <PageHeader
        eyebrow="Administración"
        title="Estructura"
        accent="operativa"
        subtitle="Árbol líder → activistas. Alta y edición de usuarios con asignación de líder y sección."
        actions={
          <Button
            variant="primary"
            className="shadow-glow-accent"
            onClick={() => setCreateOpen(true)}
          >
            + Nuevo usuario
          </Button>
        }
      />

      <div className="reveal mt-2">
        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          isEmpty={!loading && !error && liders.length === 0}
          emptyMessage="Aún no hay estructura configurada."
          skeleton={
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="card-premium h-[120px] animate-pulse rounded-lg bg-panel-hover"
                />
              ))}
            </div>
          }
        >
          <div className="space-y-4">
            {liders.map((node, idx) => (
              <div
                key={node.id}
                className="reveal"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <LiderCard
                  node={node}
                  onEditLider={() =>
                    setEditing({
                      id: node.id,
                      full_name: node.full_name,
                      email: node.email,
                      role: "lider",
                      seccion: node.seccion,
                      lider_id: null,
                    })
                  }
                  onEditActivista={(a) =>
                    setEditing({
                      id: a.id,
                      full_name: a.full_name,
                      email: a.email,
                      role: "activista",
                      seccion: a.seccion,
                      lider_id: node.id,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </DataState>
      </div>

      {/* Create modal */}
      <CreateUserModal
        open={createOpen}
        liders={liders}
        onClose={() => setCreateOpen(false)}
        onCreated={(_tempPassword) => {
          setCreateOpen(false);
          reload();
        }}
      />

      {/* Edit modal */}
      <EditUserModal
        user={editing}
        liders={liders}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    </AppLayout>
  );
}

// ── LiderCard ─────────────────────────────────────────────────────────────────

function LiderCard({
  node,
  onEditLider,
  onEditActivista,
}: {
  node: EstructuraNode;
  onEditLider: () => void;
  onEditActivista: (a: EstructuraNode["activistas"][number]) => void;
}) {
  return (
    <Card
      title={node.full_name}
      accentDot
      action={
        <div className="flex items-center gap-2">
          <span className="pill border-accent/30 bg-accent/10 text-accent">
            {node.total} registros
          </span>
          <button
            className="rounded-md border border-line bg-bg-sunken px-2 py-1 text-xs font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent/10"
            onClick={onEditLider}
          >
            Editar
          </button>
        </div>
      }
    >
      <div className="mb-3 text-xs text-ink-faint">{node.email}</div>

      {node.activistas.length === 0 ? (
        <p className="text-xs text-ink-faint italic">Sin activistas asignados.</p>
      ) : (
        <ul className="divide-y divide-line">
          {node.activistas.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between py-2.5 text-sm"
            >
              <div className="min-w-0">
                <span className="truncate font-medium text-ink">{a.full_name}</span>
                <span className="ml-2 font-mono text-xs text-ink-faint">{a.email}</span>
                {a.seccion && (
                  <span className="ml-2 pill border-line bg-panel-hover text-xs text-ink-muted">
                    Sección {a.seccion}
                  </span>
                )}
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                <span className="pill border-teal/30 bg-teal/10 text-teal">
                  {a.count}
                </span>
                <button
                  className="rounded-md border border-line bg-bg-sunken px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                  onClick={() => onEditActivista(a)}
                >
                  Editar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── CreateUserModal ───────────────────────────────────────────────────────────

interface CreateState {
  email: string;
  full_name: string;
  role: "lider" | "activista";
  lider_id: string;
  seccion: string;
}

function CreateUserModal({
  open,
  liders,
  onClose,
  onCreated,
}: {
  open: boolean;
  liders: EstructuraNode[];
  onClose: () => void;
  onCreated: (tempPassword: string | null) => void;
}) {
  const [form, setForm] = useState<CreateState>({
    email: "",
    full_name: "",
    role: "activista",
    lider_id: "",
    seccion: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setForm({ email: "", full_name: "", role: "activista", lider_id: "", seccion: "" });
      setError(null);
      setTempPassword(null);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: UserCreatePayload = {
        email: form.email,
        full_name: form.full_name,
        role: form.role as UserRole,
        lider_id: form.role === "activista" && form.lider_id ? form.lider_id : null,
        seccion: form.seccion || null,
      };
      const res = await createUser(payload);
      if (res.temporary_password) {
        setTempPassword(res.temporary_password);
      } else {
        onCreated(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el usuario");
    } finally {
      setSaving(false);
    }
  };

  if (tempPassword) {
    return (
      <Modal
        open={open}
        title="Usuario creado"
        onClose={() => onCreated(tempPassword)}
        footer={
          <Button variant="primary" onClick={() => onCreated(tempPassword)}>
            Listo
          </Button>
        }
      >
        <p className="text-sm text-ink-muted">Contraseña temporal generada:</p>
        <div className="mt-3 select-all rounded-lg border border-line bg-bg-sunken px-3 py-2.5 font-mono text-sm text-ink">
          {tempPassword}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Cópiala ahora: no se volverá a mostrar. El usuario deberá cambiarla al
          iniciar sesión.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title="Nuevo usuario"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            type="submit"
            form="create-estructura-user"
            disabled={saving}
          >
            {saving ? "Creando…" : "Crear usuario"}
          </Button>
        </>
      }
    >
      <form id="create-estructura-user" className="space-y-4" onSubmit={submit}>
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
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as "lider" | "activista" })
              }
            >
              <option value="lider">lider</option>
              <option value="activista">activista</option>
            </select>
          </div>
          <div>
            <label className="field-label">Sección</label>
            <input
              className="field-input"
              placeholder="Opcional"
              value={form.seccion}
              onChange={(e) => setForm({ ...form, seccion: e.target.value })}
            />
          </div>
        </div>
        {form.role === "activista" && (
          <div>
            <label className="field-label">Líder asignado</label>
            <select
              className="field-input"
              value={form.lider_id}
              onChange={(e) => setForm({ ...form, lider_id: e.target.value })}
            >
              <option value="">— Sin líder —</option>
              {liders.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.full_name}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}

// ── EditUserModal ─────────────────────────────────────────────────────────────

interface EditState {
  full_name: string;
  role: "lider" | "activista";
  lider_id: string;
  seccion: string;
}

function EditUserModal({
  user,
  liders,
  onClose,
  onSaved,
}: {
  user: EditableUser | null;
  liders: EstructuraNode[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<EditState>({
    full_name: "",
    role: "activista",
    lider_id: "",
    seccion: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name,
        role: user.role,
        lider_id: user.lider_id ?? "",
        seccion: user.seccion ?? "",
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
      const payload: UserUpdatePayload = {
        full_name: form.full_name || undefined,
        role: form.role as UserRole,
        lider_id: form.role === "activista" && form.lider_id ? form.lider_id : null,
        seccion: form.seccion || null,
      };
      await updateUser(user.id, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el usuario");
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
          <Button
            variant="primary"
            type="submit"
            form="edit-estructura-user"
            disabled={saving}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </>
      }
    >
      <form id="edit-estructura-user" className="space-y-4" onSubmit={submit}>
        <div>
          <label className="field-label">Nombre completo</label>
          <input
            className="field-input"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Rol</label>
            <select
              className="field-input"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as "lider" | "activista" })
              }
            >
              <option value="lider">lider</option>
              <option value="activista">activista</option>
            </select>
          </div>
          <div>
            <label className="field-label">Sección</label>
            <input
              className="field-input"
              placeholder="Opcional"
              value={form.seccion}
              onChange={(e) => setForm({ ...form, seccion: e.target.value })}
            />
          </div>
        </div>
        {form.role === "activista" && (
          <div>
            <label className="field-label">Líder asignado</label>
            <select
              className="field-input"
              value={form.lider_id}
              onChange={(e) => setForm({ ...form, lider_id: e.target.value })}
            >
              <option value="">— Sin líder —</option>
              {liders.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.full_name}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
