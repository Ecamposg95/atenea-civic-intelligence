// frontend/src/modules/organizaciones/OrgsPage.tsx
// Gestión de Organizaciones — superadmin multi-tenant control surface.
// Lists real organizations from the API and lets a superadmin create or edit
// tenants (name + slug). Slug collisions surface the backend 409 inline.
import { useMemo, useState } from "react";

import {
  createOrganization,
  listOrganizations,
  updateOrganization,
} from "@/api/organizations";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { Modal } from "@/components/ui/Modal";
import { DatabaseIcon, SettingsIcon, ShieldIcon } from "@/components/ui/icons";
import { useAsync } from "@/hooks/useAsync";
import type { Organization } from "@/types/organizations";

type Editing = { mode: "create" } | { mode: "edit"; org: Organization };

interface FormState {
  name: string;
  slug: string;
}

const EMPTY_FORM: FormState = { name: "", slug: "" };

/** Lowercase, hyphenated, ascii-safe slug derived from a name. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`pill ${
        active
          ? "border-teal/30 bg-teal/10 text-teal"
          : "border-line bg-bg-sunken text-ink-faint"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-teal" : "bg-ink-faint"}`}
        aria-hidden="true"
      />
      {active ? "Activa" : "Inactiva"}
    </span>
  );
}

export function OrgsPage() {
  const orgs = useAsync(() => listOrganizations(), []);
  const items = orgs.data?.items ?? [];

  const [editing, setEditing] = useState<Editing | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Tracks whether the user manually edited the slug, so we stop auto-deriving.
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const active = items.filter((o) => o.is_active).length;
    return { total: items.length, active, inactive: items.length - active };
  }, [items]);

  function openCreate(): void {
    setEditing({ mode: "create" });
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setError(null);
  }

  function openEdit(org: Organization): void {
    setEditing({ mode: "edit", org });
    setForm({ name: org.name, slug: org.slug });
    setSlugTouched(true);
    setError(null);
  }

  function closeModal(): void {
    if (saving) return;
    setEditing(null);
    setError(null);
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
      setError("Nombre y slug son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
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
        setError("Ese slug ya está en uso. Elige otro.");
      } else if (status === 403) {
        setError("No tienes permisos para esta operación.");
      } else {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    } finally {
      setSaving(false);
    }
  }

  const isCreate = editing?.mode === "create";

  return (
    <AppLayout title="Organizaciones" crumb="Administración · Multi-tenant">
      <PageHeader
        eyebrow="Administración"
        title="Gestión de"
        accent="Organizaciones"
        subtitle="Alta y edición de instituciones (tenants) de la plataforma."
        actions={
          <button type="button" className="btn-primary" onClick={openCreate}>
            Nueva organización
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Organizaciones"
          value={String(counts.total)}
          tone="accent"
          icon={<DatabaseIcon width={18} height={18} />}
          delay={0}
        />
        <MetricCard
          label="Activas"
          value={String(counts.active)}
          tone="teal"
          icon={<ShieldIcon width={18} height={18} />}
          delay={80}
        />
        <MetricCard
          label="Inactivas"
          value={String(counts.inactive)}
          tone="warning"
          icon={<SettingsIcon width={18} height={18} />}
          delay={160}
        />
      </div>

      <div className="reveal mt-5" style={{ animationDelay: "200ms" }}>
        <Card
          title="Tenants"
          accentDot
          className="!p-0 overflow-hidden"
          action={
            <span className="pill border-line text-ink-faint">
              {counts.total} {counts.total === 1 ? "registro" : "registros"}
            </span>
          }
        >
          <DataState
            loading={orgs.loading}
            error={orgs.error}
            isEmpty={items.length === 0}
            onRetry={orgs.reload}
            emptyMessage="Sin organizaciones todavía."
            skeleton={
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-10 animate-pulse rounded-md bg-panel-hover"
                  />
                ))}
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg-sunken/60 text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((org) => (
                    <tr
                      key={org.id}
                      className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-hover/50"
                    >
                      <td className="px-4 py-3 font-medium text-ink">
                        {org.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-accent">
                        {org.slug}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill active={org.is_active} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="btn-ghost px-3 py-1.5 text-xs"
                          onClick={() => openEdit(org)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataState>
        </Card>
      </div>

      <Modal
        open={editing !== null}
        title={isCreate ? "Nueva organización" : "Editar organización"}
        onClose={closeModal}
        footer={
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={closeModal}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
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
              className="field-input"
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
              className="field-input font-mono"
              value={form.slug}
              onChange={(e) => onSlugChange(e.target.value)}
              placeholder="instituto-electoral"
            />
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Identificador único en minúsculas. Debe ser distinto al de otras
              organizaciones.
            </p>
          </div>
          {error && (
            <p className="text-xs text-state-critical" role="alert">
              {error}
            </p>
          )}
          {/* Allow Enter-to-submit without a visible submit button. */}
          <button type="submit" className="hidden" aria-hidden="true" />
        </form>
      </Modal>
    </AppLayout>
  );
}
