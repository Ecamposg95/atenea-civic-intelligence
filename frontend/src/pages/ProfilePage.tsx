import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { updateMe } from "@/api/users";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ShieldIcon } from "@/components/ui/icons";
import { useAuthStore } from "@/store/authStore";

/** Build up-to-two-letter initials from a display name. */
function initials(name: string | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const ROLE_BADGE: Record<string, string> = {
  superadmin: "border-accent/30 bg-accent/10 text-accent",
  admin: "border-teal/30 bg-teal/10 text-teal",
  analyst: "border-state-warning/30 bg-state-warning/10 text-state-warning",
  viewer: "border-line text-ink-muted",
};

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const loadCurrentUser = useAuthStore((s) => s.loadCurrentUser);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setPhone(user.phone ?? "");
    }
  }, [user]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateMe({ full_name: fullName, phone: phone || null });
      await loadCurrentUser(true);
      setMessage("Perfil actualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el perfil");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout title="Mi perfil" crumb="Cuenta">
      <PageHeader
        eyebrow="Cuenta"
        title="Mi"
        accent="perfil"
        subtitle="Tus datos personales, rol y configuración de seguridad."
        actions={
          <div className="card-premium flex items-center gap-3 px-4 py-3">
            <span className="metric-chip h-11 w-11 shrink-0 font-display text-base font-bold text-accent shadow-glow-accent">
              {initials(user?.full_name)}
            </span>
            <div className="min-w-0">
              <div className="truncate font-display text-sm font-semibold text-ink">
                {user?.full_name ?? "—"}
              </div>
              <div className="truncate font-mono text-[11px] text-ink-faint">
                {user?.email ?? "—"}
              </div>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="reveal lg:col-span-2" style={{ animationDelay: "120ms" }}>
        <Card title="Datos personales" accentDot className="h-full">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="field-label">Nombre completo</label>
              <input
                className="field-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Email</label>
                <input className="field-input opacity-60" value={user?.email ?? ""} disabled />
              </div>
              <div>
                <label className="field-label">Teléfono</label>
                <input
                  className="field-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="opcional"
                />
              </div>
            </div>

            {message && (
              <div className="rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 text-sm text-teal">
                {message}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </form>
        </Card>
        </div>

        <div className="reveal space-y-4" style={{ animationDelay: "200ms" }}>
          <Card title="Rol y acceso" accentDot>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Rol</span>
                <span className={`pill ${ROLE_BADGE[user?.role ?? "viewer"]}`}>
                  {user?.role ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Estado</span>
                <span className="pill border-teal/30 bg-teal/10 text-teal">
                  {user?.is_active ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Organización</span>
                <span className="font-mono text-xs text-ink-faint">
                  {user?.organization_id ?? "—"}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Seguridad" accentDot>
            <p className="flex items-start gap-2 text-sm text-ink-muted">
              <ShieldIcon width={16} height={16} className="mt-0.5 shrink-0 text-teal" />
              Mantén tu cuenta segura cambiando tu contraseña periódicamente.
            </p>
            <Link to="/change-password" className="btn-ghost mt-4 inline-flex">
              Cambiar contraseña
            </Link>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
