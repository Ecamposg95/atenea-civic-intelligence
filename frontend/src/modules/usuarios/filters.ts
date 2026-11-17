/**
 * Pure helpers for the users screen: filter → query params, form validation
 * and API-error translation. Kept free of React so they're unit-testable.
 */
import type { User, UserRole } from "@/types/auth";
import type { ListUsersParams } from "@/types/users";

import { structureFields } from "./roles";

/** A user row as the admin screen sees it (UserRead + lifecycle fields). */
export type ManagedUser = User & {
  coordinador_id?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type StatusFilter = "activos" | "inactivos" | "eliminados" | "todos";

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "activos", label: "Activos" },
  { value: "inactivos", label: "Inactivos" },
  { value: "eliminados", label: "Eliminados" },
];

export type SortKey = "recientes" | "nombre" | "email" | "rol";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recientes", label: "Más recientes" },
  { value: "nombre", label: "Nombre (A–Z)" },
  { value: "email", label: "Correo (A–Z)" },
  { value: "rol", label: "Rol" },
];

export interface UserFilters {
  q: string;
  role: UserRole | null;
  status: StatusFilter;
  sort: SortKey;
  page: number; // 0-based
}

export const DEFAULT_FILTERS: UserFilters = {
  q: "",
  role: null,
  status: "todos",
  sort: "recientes",
  page: 0,
};

export type ListParams = ListUsersParams & { deleted_only?: boolean };

const SORTS: Record<SortKey, Pick<ListUsersParams, "sort" | "order">> = {
  recientes: { sort: "created_at", order: "desc" },
  nombre: { sort: "full_name", order: "asc" },
  email: { sort: "email", order: "asc" },
  rol: { sort: "role", order: "asc" },
};

/** Translate the UI filter state into `/users` query params. */
export function toListParams(f: UserFilters, pageSize: number): ListParams {
  const params: ListParams = {
    ...SORTS[f.sort],
    limit: pageSize,
    offset: Math.max(0, f.page) * pageSize,
  };
  const q = f.q.trim();
  if (q) params.q = q;
  if (f.role) params.role = f.role;
  switch (f.status) {
    case "activos":
      params.is_active = true;
      break;
    case "inactivos":
      params.is_active = false;
      break;
    case "eliminados":
      params.deleted_only = true;
      break;
    case "todos": // every non-deleted account; deleted ones live under "eliminados"
      break;
  }
  return params;
}

export function isDeleted(u: ManagedUser, status: StatusFilter): boolean {
  return status === "eliminados" || Boolean(u.deleted_at);
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** "Mostrando 21–40 de 57". */
export function rangeLabel(page: number, pageSize: number, total: number): string {
  if (total === 0) return "Sin resultados";
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return `Mostrando ${from}–${to} de ${total}`;
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/* ------------------------------ Form ------------------------------------ */
export interface UserFormValues {
  full_name: string;
  email: string;
  role: UserRole;
  phone: string;
  seccion: string;
  lider_id: string;
  coordinador_id: string;
}

export type FormErrors = Partial<Record<keyof UserFormValues, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s-]{6,}$/;

export function validateUserForm(
  v: UserFormValues,
  opts: { mode: "create" | "edit"; allowedRoles: UserRole[] },
): FormErrors {
  const e: FormErrors = {};
  if (!v.full_name.trim()) e.full_name = "Escribe el nombre completo.";
  else if (v.full_name.trim().length > 255) e.full_name = "Máximo 255 caracteres.";
  if (opts.mode === "create") {
    if (!v.email.trim()) e.email = "Escribe el correo.";
    else if (!EMAIL_RE.test(v.email.trim())) e.email = "El correo no es válido.";
  }
  if (!opts.allowedRoles.includes(v.role)) e.role = "No puedes asignar este rol.";
  const phone = v.phone.trim();
  if (phone && (!PHONE_RE.test(phone) || phone.replace(/\D/g, "").length < 7)) {
    e.phone = "Usa solo dígitos, espacios o guiones (mínimo 7 dígitos).";
  } else if (phone.length > 40) e.phone = "Máximo 40 caracteres.";
  if (v.seccion.trim().length > 20) e.seccion = "Máximo 20 caracteres.";
  return e;
}

/** Normalise form values into an API payload (blank → null, irrelevant fields cleared). */
export function toPayload(v: UserFormValues) {
  const fields = structureFields(v.role);
  const blank = (s: string) => (s.trim() ? s.trim() : null);
  return {
    full_name: v.full_name.trim(),
    role: v.role,
    phone: blank(v.phone),
    seccion: fields.seccion ? blank(v.seccion) : null,
    lider_id: fields.lider ? blank(v.lider_id) : null,
    coordinador_id: fields.coordinador ? blank(v.coordinador_id) : null,
  };
}

/* --------------------------- API errors --------------------------------- */
const ERROR_ES: [RegExp, string][] = [
  [/email already registered/i, "Ese correo ya está registrado."],
  [/cannot manage a superadmin/i, "No puedes modificar a un superadministrador."],
  [/grant the superadmin role/i, "Solo un superadministrador puede otorgar ese rol."],
  [/grant the admin role/i, "No tienes permiso para otorgar el rol de administrador."],
  [/cannot change your own role/i, "No puedes cambiar tu propio rol."],
  [/cannot deactivate your own/i, "No puedes desactivar tu propia cuenta."],
  [/cannot delete your own/i, "No puedes eliminar tu propia cuenta."],
  [/lider_id must reference/i, "El líder elegido no es válido."],
  [/coordinador_id must reference/i, "La coordinación elegida no es válida."],
  [/own leader|own coordinator/i, "Una persona no puede ser su propio líder o coordinador."],
  [/user not found/i, "El usuario ya no existe o no pertenece a tu organización."],
  [/user is not deleted/i, "El usuario no está eliminado."],
  [/network error|timeout/i, "No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo."],
];

export function translateError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  for (const [re, es] of ERROR_ES) if (re.test(raw)) return es;
  return raw && !/^Request failed/i.test(raw) ? raw : fallback;
}

/** Edit payload: only what changed vs. the stored user (so nothing is cleared by accident). */
export function diffPayload(original: ManagedUser, v: UserFormValues) {
  const next = toPayload(v);
  const before: Record<keyof typeof next, unknown> = {
    full_name: original.full_name,
    role: original.role,
    phone: original.phone ?? null,
    seccion: original.seccion ?? null,
    lider_id: original.lider_id ?? null,
    coordinador_id: original.coordinador_id ?? null,
  };
  const out: Partial<typeof next> = {};
  (Object.keys(next) as (keyof typeof next)[]).forEach((k) => {
    if (next[k] !== before[k]) (out as Record<string, unknown>)[k] = next[k];
  });
  return out;
}

export function formFromUser(u: ManagedUser): UserFormValues {
  return {
    full_name: u.full_name,
    email: u.email,
    role: u.role,
    phone: u.phone ?? "",
    seccion: u.seccion ?? "",
    lider_id: u.lider_id ?? "",
    coordinador_id: u.coordinador_id ?? "",
  };
}

/** Blank create form; field roles default the hierarchy link to the actor. */
export function emptyForm(
  actor: Pick<User, "id" | "role"> | null | undefined,
  allowedRoles: UserRole[],
): UserFormValues {
  const preferred: UserRole = allowedRoles.includes("capturista")
    ? "capturista"
    : (allowedRoles[allowedRoles.length - 1] ?? "viewer");
  return {
    full_name: "",
    email: "",
    role: actor?.role === "coordinador" ? "lider" : preferred,
    phone: "",
    seccion: "",
    lider_id: actor?.role === "lider" ? actor.id : "",
    coordinador_id: actor?.role === "coordinador" ? actor.id : "",
  };
}
