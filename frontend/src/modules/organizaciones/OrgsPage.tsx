// frontend/src/modules/organizaciones/OrgsPage.tsx
// Gestión de Organizaciones — superadmin multi-tenant control surface.
// Lists real organizations from the API and lets a superadmin create, edit,
// activate, or deactivate tenants. Slug collisions surface the backend 409.
import { useCallback, useMemo, useState } from "react";

import {
  createOrganization,
  listOrganizations,
  updateOrganization,
} from "@/api/organizations";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { DataState } from "@/components/ui/DataState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { DatabaseIcon, ShieldIcon } from "@/components/ui/icons";
import { TONE_BADGE } from "@/constants/ui";
import { useAsync } from "@/hooks/useAsync";
import type { Organization, OrgUpdatePayload } from "@/types/organizations";

// ─── Types ────────────────────────────────────────────────────────────────────

type Editing = { mode: "create" } | { mode: "edit"; org: Organization };

interface FormState {
  name: string;
  slug: string;
}

const EMPTY_FORM: FormState = { name: "", slug: "" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lowercase, hyphenated, ascii-safe slug derived from a name. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Static columns (no closure over state) ───────────────────────────────────
// Client-side data: sortValue IS appropriate — DataTable paginates the full set.

const ORG_STATIC_COLUMNS: Column<Organization>[] = [
  {
    key: "name",
    header: "Nombre",
    sortValue: (o) => o.name,
    render: (o) => (
      <span className="font-medium text-ink">{o.name}</span>
    ),
  },
  {
    key: "slug",
    header: "Slug",
    render: (o) => (
      <span className="font-mono text-xs text-accent">{o.slug}</span>
    ),
  },
  {
    key: "is_active",
    header: "Estado",
    sortValue: (o) => (o.is_active ? 0 : 1),
    render: (o) => (
      <span
        className={`pill ${o.is_active ? TONE_BADGE.ok : TONE_BADGE.neutral}`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            o.is_active ? "bg-teal" : "bg-ink-faint"
          }`}
          aria-hidden="true"
        />
        {o.is_active ? "Activa" : "Inactiva"}
      </span>
    ),
  },
];

// ─── Page component ───────────────────────────────────────────────────────────

export function OrgsPage() {
  const orgs = useAsync(() => listOrganizations(), [], "OrgsPage#1");
  const items = orgs.data?.items ?? [];

  const [editing, setEditing] = useState<Editing | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Tracks whether the user manually edited the slug, so we stop auto-deriving.
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const active = items.filter((o) => o.is_active).length;
    return { total: items.length, active, inactive: items.length - active };
  }, [items]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function openCreate(): void {
    setEditing({ mode: "create" });
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setModalError(null);
  }

  function openEdit(org: Organization): void {
    setEditing({ mode: "edit", org });
    setForm({ name: org.name, slug: org.slug });
    setSlugTouched(true);
    setModalError(null);
  }

  function closeModal(): void {
    if (saving) return;
    setEditing(null);
    setModalError(null);
  }

  function onNameChange(name: string): void {
    setForm((f) => ({
      name,
      slug: slugTouched ? f.slug : slugify(name),
    }));
  }

  function onSlugChange(slug: string): void {
    setSlugTouched(true);
    setForm((f) => ({ ...f, slug: slugify(slug) }));
  }

  async function onSubmit(): Promise<void> {
    if (!editing) return;
    const name = form.name.trim();
    const slug = form.slug.trim();
    if (!name || !slug) {
      setModalError("Nombre y slug son obligatorios.");
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      if (editing.mode === "create") {
        await createOrganization({ name, slug });
      } else {
        await updateOrganization(editing.org.id, { name, slug });
      }
      setEditing(null);
      orgs.reload();
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 409) {
        setModalError("Ese slug ya está en uso. Elige otro.");
      } else if (status === 403) {
        setModalError("No tienes permisos para esta operación.");
      } else {
        setModalError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    } finally {
      setSaving(false);
    }
  }

  const toggleActive = useCallback(
    async (org: Organization, active: boolean) => {
      try {
        const payload: OrgUpdatePayload = { is_active: active };
        await updateOrganization(org.id, payload);
        orgs.reload();
      } catch (e: unknown) {
        // Surface inline — non-critical action, no full-page error needed.
        console.error("toggleActive failed", e);
      }
    },
    [orgs],
  );

  // ─── Actions column (closes over openEdit / toggleActive) ───────────────────
  // useMemo keeps the array reference stable for DataTable's sort memo.

  const columns = useMemo<Column<Organization>[]>(
    () => [
      ...ORG_STATIC_COLUMNS,
      {
        key: "actions",
        header: "Acciones",
        align: "right",
        render: (org) => (
          <div className="flex flex-wrap justify-end gap-1.5 text-xs">
            <button
              type="button"
              aria-label={`Editar ${org.name}`}
              className="rounded-md border border-line bg-bg-sunken px-2 py-1 font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent/10 focus-ring"
              onClick={() => openEdit(org)}
            >
              Editar
            </button>
            {org.is_active ? (
              <button
                type="button"
                aria-label={`Desactivar ${org.name}`}
                className="rounded-md border border-line bg-bg-sunken px-2 py-1 font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus-ring"
                onClick={() => void toggleActive(org, false)}
              >
                Desactivar
              </button>
            ) : (
              <button
                type="button"
                aria-label={`Activar ${org.name}`}
                className="rounded-md border border-line bg-bg-sunken px-2 py-1 font-medium text-teal transition-colors hover:border-teal/40 hover:bg-teal/10 focus-ring"
                onClick={() => void toggleActive(org, true)}
              >
                Activar
              </button>
            )}
          </div>
        ),
      },
    ],
    [toggleActive],
  );

  const isCreate = editing?.mode === "create";

  return (
    <AppLayout title="Organizaciones" crumb="Administración · Multi-tenant">
      <PageHeader
        eyebrow="Administración"
        title="Gestión de"
        accent="Organizaciones"
        subtitle="Alta y edición de instituciones (tenants) de la plataforma."
        actions={
          <>
            <div className="card-premium px-4 py-3">
              <div className="eyebrow mb-1.5">Organizaciones</div>
              <div className="flex items-center gap-2">
                <DatabaseIcon className="h-5 w-5 text-accent" />
                <AnimatedNumber
                  value={counts.total}
                  className="font-display text-2xl font-bold tabular-nums text-ink"
                />
              </div>
            </div>
            <div className="card-premium px-4 py-3">
              <div className="eyebrow mb-1.5">Activas</div>
              <div className="flex items-center gap-2">
                <ShieldIcon className="h-5 w-5 text-teal" />
                <AnimatedNumber
                  value={counts.active}
                  className="font-display text-2xl font-bold tabular-nums text-teal"
                />
              </div>
            </div>
            <button
              type="button"
              className="btn-primary shadow-glow-accent"
              onClick={openCreate}
            >
              + Nueva organización
            </button>
          </>
        }
      />

      {/* Table */}
      <div className="reveal" style={{ animationDelay: "200ms" }}>
        <DataState
          loading={orgs.loading}
          error={orgs.error}
          onRetry={orgs.reload}
          isEmpty={items.length === 0}
          emptyMessage="Sin organizaciones todavía."
          skeleton={<SkeletonRows rows={6} />}
        >
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(o) => o.id}
            pageSize={20}
            emptyMessage="Sin organizaciones para los filtros actuales."
          />
        </DataState>
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={editing !== null}
        title={isCreate ? "Nueva organización" : "Editar organización"}
        onClose={closeModal}
        footer={
          <>
            <button
              type="button"
              className="btn-ghost focus-ring"
              onClick={closeModal}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary focus-ring"
              onClick={() => void onSubmit()}
              disabled={saving}
            >
              {saving ? "Guardando…" : isCreate ? "Crear" : "Guardar"}
            </button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
        >
          <div>
            <label className="field-label" htmlFor="org-name">
              Nombre
            </label>
            <input
              id="org-name"
              className="field-input focus-ring"
              value={form.name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Instituto Electoral…"
              autoFocus
            />
          </div>
          <div>
            <label className="field-label" htmlFor="org-slug">
              Slug
            </label>
            <input
              id="org-slug"
              className="field-input font-mono focus-ring"
              value={form.slug}
              onChange={(e) => onSlugChange(e.target.value)}
              placeholder="instituto-electoral"
            />
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Identificador único en minúsculas. Debe ser distinto al de otras
              organizaciones.
            </p>
          </div>
          {modalError && (
            <p className="text-xs text-state-critical" role="alert">
              {modalError}
            </p>
          )}
          {/* Allow Enter-to-submit without a visible submit button. */}
          <button type="submit" className="hidden" aria-hidden="true" />
        </form>
      </Modal>
    </AppLayout>
  );
}
