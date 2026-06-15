import { useEffect, useState } from "react";

import { getMyOrganization } from "@/api/organizations";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import type { Organization } from "@/types/organizations";

export function OrganizationSettingsPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyOrganization()
      .then(setOrg)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
    <div className="flex items-center justify-between border-b border-line/60 py-3 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className={`text-sm text-ink ${mono ? "font-mono text-xs text-ink-faint" : ""}`}>
        {value}
      </span>
    </div>
  );

  return (
    <AppLayout title="Organización" crumb="Administración · Ajustes">
      <PageHeader
        eyebrow="Administración"
        title="Ajustes de"
        accent="organización"
        subtitle="Datos de tu institución (tenant). La edición se habilitará en una siguiente fase."
      />

      {error && (
        <div className="reveal mb-4 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
        <Card title="Identidad" accentDot className="h-full">
          {loading ? (
            <div className="h-32 animate-pulse rounded-lg bg-panel-hover" />
          ) : org ? (
            <div>
              <Row label="Nombre" value={org.name} />
              <Row label="Slug" value={org.slug} mono />
              <Row label="Estado" value={org.is_active ? "Activa" : "Inactiva"} />
              <Row label="ID" value={org.id} mono />
            </div>
          ) : (
            <p className="text-sm text-ink-faint">Sin organización asociada.</p>
          )}
        </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "200ms" }}>
        <Card title="Gobernanza de datos" accentDot className="h-full">
          <ul className="space-y-2.5 text-sm text-ink-muted">
            <li className="flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-panel-hover">
              <span>Aislamiento por tenant</span>
              <span className="pill border-teal/30 bg-teal/10 text-teal">Activo</span>
            </li>
            <li className="flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-panel-hover">
              <span>Bitácora de auditoría</span>
              <span className="pill border-teal/30 bg-teal/10 text-teal">Activa</span>
            </li>
            <li className="flex items-center justify-between rounded-lg border border-line bg-bg-sunken px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-panel-hover">
              <span>Privacy-by-design</span>
              <span className="pill border-accent/30 bg-accent/10 text-accent">Por diseño</span>
            </li>
          </ul>
        </Card>
        </div>
      </div>
    </AppLayout>
  );
}
