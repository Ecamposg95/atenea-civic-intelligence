// frontend/src/modules/campaigns/CampaignsPage.tsx
// Campaign management — list and create campaigns (admin/superadmin only).
import { useState } from "react";

import {
  createCampaign,
  listMyCampaigns,
  type CampaignCreatePayload,
} from "@/api/campaigns";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { DataState } from "@/components/ui/DataState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { SkeletonRows } from "@/components/ui/SkeletonCard";
import { AnalyticsIcon, ShieldIcon } from "@/components/ui/icons";
import { TONE_BADGE } from "@/constants/ui";
import { useAsync } from "@/hooks/useAsync";
import { useCampaignStore, type Campaign } from "@/store/campaignStore";

// ─── Static columns ────────────────────────────────────────────────────────────

const CAMPAIGN_COLUMNS: Column<Campaign>[] = [
  {
    key: "name",
    header: "Nombre",
    sortValue: (c) => c.name,
    render: (c) => <span className="font-medium text-ink">{c.name}</span>,
  },
  {
    key: "cycle",
    header: "Ciclo",
    sortValue: (c) => c.cycle,
    render: (c) => (
      <span className="font-mono text-xs text-accent">{c.cycle}</span>
    ),
  },
  {
    key: "status",
    header: "Estado",
    sortValue: (c) => c.status,
    render: (c) => {
      const isActive = c.status === "active";
      return (
        <span
          className={`pill ${isActive ? TONE_BADGE.ok : TONE_BADGE.neutral}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-teal" : "bg-ink-faint"}`}
            aria-hidden="true"
          />
          {isActive ? "Activa" : c.status}
        </span>
      );
    },
  },
  {
    key: "license_tier",
    header: "Licencia",
    render: (c) => (
      <span className={`pill ${TONE_BADGE.info}`}>{c.license_tier}</span>
    ),
  },
];

// ─── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  cycle: string;
}

const EMPTY_FORM: FormState = { name: "", cycle: "" };

// ─── Page component ────────────────────────────────────────────────────────────

export function CampaignsPage() {
  const setCampaigns = useCampaignStore((s) => s.setCampaigns);
  const campaigns = useAsync(() => listMyCampaigns(), []);
  const items = campaigns.data ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function openCreate(): void {
    setForm(EMPTY_FORM);
    setModalError(null);
    setModalOpen(true);
  }

  function closeModal(): void {
    if (saving) return;
    setModalOpen(false);
    setModalError(null);
  }

  async function onSubmit(): Promise<void> {
    const name = form.name.trim();
    const cycle = form.cycle.trim();
    if (!name || !cycle) {
      setModalError("Nombre y ciclo son obligatorios.");
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      const payload: CampaignCreatePayload = { name, cycle };
      await createCampaign(payload);
      setModalOpen(false);
      campaigns.reload();
      // Refresh the switcher store with updated list
      const updated = await listMyCampaigns();
      setCampaigns(updated);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 403) {
        setModalError("No tienes permisos para crear campañas.");
      } else if (status === 409) {
        setModalError("Ya existe una campaña con ese nombre y ciclo.");
      } else {
        setModalError(e instanceof Error ? e.message : "No se pudo crear la campaña.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="Campañas" crumb="Administración · Campañas electorales">
      <PageHeader
        eyebrow="Administración"
        title="Gestión de"
        accent="Campañas"
        subtitle="Crea y administra las campañas electorales de la plataforma."
        actions={
          <>
            <div className="card-premium px-4 py-3">
              <div className="eyebrow mb-1.5">Campañas</div>
              <div className="flex items-center gap-2">
                <AnalyticsIcon className="h-5 w-5 text-accent" />
                <AnimatedNumber
                  value={items.length}
                  className="font-display text-2xl font-bold tabular-nums text-ink"
                />
              </div>
            </div>
            <div className="card-premium px-4 py-3">
              <div className="eyebrow mb-1.5">Activas</div>
              <div className="flex items-center gap-2">
                <ShieldIcon className="h-5 w-5 text-teal" />
                <AnimatedNumber
                  value={items.filter((c) => c.status === "active").length}
                  className="font-display text-2xl font-bold tabular-nums text-teal"
                />
              </div>
            </div>
            <button
              type="button"
              className="btn-primary shadow-glow-accent"
              onClick={openCreate}
            >
              + Nueva campaña
            </button>
          </>
        }
      />

      {/* Table */}
      <div className="reveal" style={{ animationDelay: "200ms" }}>
        <DataState
          loading={campaigns.loading}
          error={campaigns.error}
          onRetry={campaigns.reload}
          isEmpty={items.length === 0}
          emptyMessage="Sin campañas todavía. Crea la primera."
          skeleton={<SkeletonRows rows={4} />}
        >
          <DataTable
            columns={CAMPAIGN_COLUMNS}
            rows={items}
            rowKey={(c) => c.id}
            pageSize={20}
            emptyMessage="Sin campañas para los filtros actuales."
          />
        </DataState>
      </div>

      {/* Create modal */}
      <Modal
        open={modalOpen}
        title="Nueva campaña"
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
              {saving ? "Creando…" : "Crear"}
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
            <label className="field-label" htmlFor="campaign-name">
              Nombre
            </label>
            <input
              id="campaign-name"
              className="field-input focus-ring"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Campaña Elecciones 2027…"
              autoFocus
            />
          </div>
          <div>
            <label className="field-label" htmlFor="campaign-cycle">
              Ciclo
            </label>
            <input
              id="campaign-cycle"
              className="field-input focus-ring"
              value={form.cycle}
              onChange={(e) =>
                setForm((f) => ({ ...f, cycle: e.target.value }))
              }
              placeholder="2027"
            />
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Año o identificador del ciclo electoral (p. ej. 2027).
            </p>
          </div>
          {modalError && (
            <p className="text-xs text-state-critical" role="alert">
              {modalError}
            </p>
          )}
          <button type="submit" className="hidden" aria-hidden="true" />
        </form>
      </Modal>
    </AppLayout>
  );
}
