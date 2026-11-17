import type { User } from "@/types/auth";

import { initials, isDeleted, type ManagedUser, type StatusFilter } from "../filters";
import { capabilitiesFor } from "../roles";
import { BTN, FOCUS } from "../ui";
import { RoleBadge, StatusBadge, type StatusKind } from "./RoleBadge";

interface Props {
  rows: ManagedUser[];
  status: StatusFilter;
  actor: Pick<User, "id" | "role"> | null;
  names: Record<string, string>;
  busyId: string | null;
  onEdit: (u: ManagedUser) => void;
  onToggleActive: (u: ManagedUser, next: boolean) => void;
  onRestore: (u: ManagedUser) => void;
}

function kindOf(u: ManagedUser, status: StatusFilter): StatusKind {
  if (isDeleted(u, status)) return "eliminado";
  return u.is_active ? "activo" : "inactivo";
}

/** Accessible on/off switch with a 44px hit area. */
export function ActiveSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`${FOCUS} group inline-flex h-11 min-w-[44px] items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`relative h-6 w-11 rounded-full border transition-colors ${
          checked ? "border-transparent bg-state-ok" : "border-line-strong bg-bg-sunken"
        }`}
      >
        <span
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full shadow transition-transform ${
            checked ? "translate-x-[22px] bg-bg" : "translate-x-0.5 bg-ink-muted"
          }`}
        />
      </span>
    </button>
  );
}

function Avatar({ name, dim }: { name: string; dim?: boolean }) {
  return (
    <span
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line-strong bg-panel-raised font-display text-sm font-semibold ${
        dim ? "text-ink-muted" : "text-ink"
      }`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function Structure({ u, names }: { u: ManagedUser; names: Record<string, string> }) {
  const parts: string[] = [];
  if (u.seccion) parts.push(`Sección ${u.seccion}`);
  if (u.lider_id) parts.push(`Líder: ${names[u.lider_id] ?? "asignado"}`);
  if (u.coordinador_id) parts.push(`Coordina: ${names[u.coordinador_id] ?? "asignada"}`);
  if (parts.length === 0) return <span className="text-ink-muted">Sin asignar</span>;
  return (
    <span className="flex flex-col gap-0.5 text-ink">
      {parts.map((p) => (
        <span key={p}>{p}</span>
      ))}
    </span>
  );
}

function RowActions({ u, props }: { u: ManagedUser; props: Props }) {
  const deleted = isDeleted(u, props.status);
  const caps = capabilitiesFor(props.actor, { id: u.id, role: u.role, deleted });
  const busy = props.busyId === u.id;
  if (deleted) {
    return caps.restore ? (
      <button type="button" className={BTN.secondary} disabled={busy} onClick={() => props.onRestore(u)}>
        {busy ? "Restaurando…" : "Restaurar"}
      </button>
    ) : null;
  }
  return caps.edit || caps.toggleActive || caps.resetPassword ? (
    <button
      type="button"
      className={BTN.secondary}
      onClick={() => props.onEdit(u)}
      aria-label={`Editar a ${u.full_name}`}
    >
      Editar
    </button>
  ) : (
    <span className="text-sm text-ink-muted">Sin permisos</span>
  );
}

function SwitchCell({ u, props }: { u: ManagedUser; props: Props }) {
  const deleted = isDeleted(u, props.status);
  const caps = capabilitiesFor(props.actor, { id: u.id, role: u.role, deleted });
  if (deleted || !caps.toggleActive) return null;
  return (
    <ActiveSwitch
      checked={u.is_active}
      disabled={props.busyId === u.id}
      label={`Cuenta de ${u.full_name} ${u.is_active ? "activa" : "inactiva"}`}
      onChange={(next) => props.onToggleActive(u, next)}
    />
  );
}

export function UserList(props: Props) {
  const { rows, status, names, actor } = props;
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-panel md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Usuarios de la organización</caption>
          <thead className="border-b border-line bg-panel-raised text-[13px] text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Persona</th>
              <th scope="col" className="px-4 py-3 font-medium">Rol</th>
              <th scope="col" className="px-4 py-3 font-medium">Estructura</th>
              <th scope="col" className="px-4 py-3 font-medium">Estado</th>
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">Activa</span>
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((u) => {
              const kind = kindOf(u, status);
              return (
                <tr key={u.id} className="align-middle transition-colors hover:bg-panel-hover/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.full_name} dim={kind !== "activo"} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">
                          {u.full_name}
                          {actor?.id === u.id && <span className="ml-2 font-normal text-ink-muted">(tú)</span>}
                        </div>
                        <div className="truncate text-[13px] text-ink-muted">{u.email}</div>
                        {u.phone && <div className="text-[13px] text-ink-muted">{u.phone}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3 text-[13px]"><Structure u={u} names={names} /></td>
                  <td className="px-4 py-3">
                    <StatusBadge kind={kind} pending={u.must_change_password} />
                  </td>
                  <td className="px-2 py-1"><SwitchCell u={u} props={props} /></td>
                  <td className="px-4 py-3 text-right"><RowActions u={u} props={props} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 md:hidden" aria-label="Usuarios de la organización">
        {rows.map((u) => {
          const kind = kindOf(u, status);
          return (
            <li key={u.id} className="rounded-card border border-line bg-panel p-4">
              <div className="flex items-start gap-3">
                <Avatar name={u.full_name} dim={kind !== "activo"} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold leading-snug text-ink">
                    {u.full_name}
                    {actor?.id === u.id && <span className="ml-1.5 font-normal text-ink-muted">(tú)</span>}
                  </div>
                  <div className="break-all text-[13px] text-ink-muted">{u.email}</div>
                </div>
                <SwitchCell u={u} props={props} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <RoleBadge role={u.role} />
                <StatusBadge kind={kind} pending={u.must_change_password} />
              </div>
              <div className="mt-2 text-[13px]"><Structure u={u} names={names} /></div>
              <div className="mt-3 [&>button]:w-full"><RowActions u={u} props={props} /></div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
