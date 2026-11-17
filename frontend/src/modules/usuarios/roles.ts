/**
 * Role vocabulary + permission matrix for the user-administration screen.
 *
 * Mirrors the backend rules in `backend/app/services/users_service.py`
 * (`_assert_can_assign_role`, `_enforce_actor_scope`, `_assert_can_manage`).
 * The backend stays the authority — this only shapes what the UI offers so
 * people aren't shown options that would come back as a 403.
 */
import type { User, UserRole } from "@/types/auth";

/** Hierarchy order: used for chips, selects and sorting. */
export const ROLE_ORDER: UserRole[] = [
  "superadmin",
  "admin",
  "coordinador",
  "lider",
  "activista",
  "capturista",
  "analyst",
  "viewer",
  "consulta",
];

export const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador",
  coordinador: "Coordinadora/Coordinador",
  lider: "Líder",
  activista: "Activista",
  capturista: "Capturista",
  analyst: "Analista",
  viewer: "Lectura",
  consulta: "Consulta",
};

/** Short plural used on the filter chips. */
export const ROLE_PLURAL: Record<UserRole, string> = {
  superadmin: "Superadministradores",
  admin: "Administradores",
  coordinador: "Coordinación",
  lider: "Líderes",
  activista: "Activistas",
  capturista: "Capturistas",
  analyst: "Analistas",
  viewer: "Lectura",
  consulta: "Consulta",
};

/** One line that tells the admin what the role can do. */
export const ROLE_HINT: Record<UserRole, string> = {
  superadmin: "Control total de la plataforma.",
  admin: "Administra la campaña y crea usuarios.",
  coordinador: "Ve toda la campaña: mapa, promovidos y reportes.",
  lider: "Coordina a sus activistas en territorio.",
  activista: "Registra a las personas que contacta.",
  capturista: "Captura las hojas de papel.",
  analyst: "Consulta tableros y reportes para análisis.",
  viewer: "Solo puede ver la información.",
  consulta: "Acceso de consulta limitado.",
};

/**
 * Marker colour per role (CSS colour, uses the theme's RGB channel vars).
 * Only used for a small dot next to the label — the label text itself is
 * always `text-ink`, so contrast never depends on these hues.
 */
export const ROLE_DOT: Record<UserRole, string> = {
  superadmin: "rgb(var(--c-critical))",
  admin: "rgb(var(--c-accent))",
  coordinador: "rgb(var(--c-amber))",
  lider: "rgb(var(--c-teal))",
  activista: "rgb(var(--c-warm))",
  capturista: "rgb(var(--c-accent-strong))",
  analyst: "rgb(var(--c-info))",
  viewer: "rgb(var(--c-ink-faint))",
  consulta: "rgb(var(--c-ink-muted))",
};

export function roleLabel(role: UserRole | string | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABEL[role as UserRole] ?? String(role);
}

/** Roles the actor may grant when creating or editing a user. */
export function assignableRoles(actor: UserRole | null | undefined): UserRole[] {
  switch (actor) {
    case "superadmin":
      return [...ROLE_ORDER];
    case "admin":
      return ROLE_ORDER.filter((r) => r !== "superadmin");
    case "coordinador":
      return ["lider", "activista"];
    case "lider":
      return ["activista"];
    default:
      return [];
  }
}

/** Roles that can be shown in the filter chips (admins never see superadmins). */
export function visibleRoles(actor: UserRole | null | undefined): UserRole[] {
  return actor === "superadmin" ? [...ROLE_ORDER] : ROLE_ORDER.filter((r) => r !== "superadmin");
}

/** Account lifecycle (activate, reset password, delete, restore) is ADMIN+. */
export function canManageLifecycle(actor: UserRole | null | undefined): boolean {
  return actor === "superadmin" || actor === "admin";
}

export interface Capabilities {
  edit: boolean;
  changeRole: boolean;
  toggleActive: boolean;
  resetPassword: boolean;
  remove: boolean;
  restore: boolean;
}

const NONE: Capabilities = {
  edit: false,
  changeRole: false,
  toggleActive: false,
  resetPassword: false,
  remove: false,
  restore: false,
};

/** What the actor can do to a specific target user. */
export function capabilitiesFor(
  actor: Pick<User, "id" | "role"> | null | undefined,
  target: Pick<User, "id" | "role"> & { deleted?: boolean },
): Capabilities {
  if (!actor) return NONE;
  const isSelf = actor.id === target.id;
  const isSuper = actor.role === "superadmin";
  if (target.role === "superadmin" && !isSuper) return NONE;

  const lifecycle = canManageLifecycle(actor.role);
  if (target.deleted) {
    return { ...NONE, restore: lifecycle };
  }
  const canTouchRole = assignableRoles(actor.role).includes(target.role);
  return {
    edit: canTouchRole,
    changeRole: canTouchRole && !isSelf,
    toggleActive: lifecycle && !isSelf,
    resetPassword: lifecycle,
    remove: lifecycle && !isSelf,
    restore: false,
  };
}

/** Which structure fields make sense for a role. */
export function structureFields(role: UserRole): {
  seccion: boolean;
  lider: boolean;
  coordinador: boolean;
} {
  return {
    seccion: ["coordinador", "lider", "activista", "capturista"].includes(role),
    lider: role === "activista",
    coordinador: role === "lider",
  };
}
