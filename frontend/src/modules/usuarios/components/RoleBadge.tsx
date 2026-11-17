import type { UserRole } from "@/types/auth";

import { ROLE_DOT, roleLabel } from "../roles";

/** Role badge: label in full-contrast ink, role colour only on the dot. */
export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-pill border border-line-strong bg-panel-raised px-2.5 py-1 text-[13px] font-medium text-ink">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: ROLE_DOT[role] }}
        aria-hidden="true"
      />
      {roleLabel(role)}
    </span>
  );
}

export type StatusKind = "activo" | "inactivo" | "eliminado";

const STATUS_STYLE: Record<StatusKind, { label: string; dot: string }> = {
  activo: { label: "Activo", dot: "rgb(var(--c-ok))" },
  inactivo: { label: "Inactivo", dot: "rgb(var(--c-warning))" },
  eliminado: { label: "Eliminado", dot: "rgb(var(--c-critical))" },
};

export function StatusBadge({ kind, pending }: { kind: StatusKind; pending?: boolean }) {
  const s = STATUS_STYLE[kind];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: s.dot }} aria-hidden="true" />
        {s.label}
      </span>
      {pending && kind === "activo" && (
        <span className="text-ink-muted">Debe cambiar contraseña</span>
      )}
    </span>
  );
}
