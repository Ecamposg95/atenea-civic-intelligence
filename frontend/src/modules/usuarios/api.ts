/**
 * Data access for the users screen. Thin wrappers over `/users` (shared
 * `@/api/users` for lifecycle calls) plus defensive look-ups for selects.
 */
import { apiClient } from "@/api/client";
import type { Paginated, UserRole } from "@/types/auth";

import type { ListParams, ManagedUser } from "./filters";

function clean(params: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v !== undefined && v !== null) out[k] = v;
  });
  return out;
}

export async function fetchUsers(params: ListParams): Promise<Paginated<ManagedUser>> {
  const { data } = await apiClient.get<Paginated<ManagedUser>>("/users", {
    params: clean(params),
  });
  return data;
}

export interface UserWritePayload {
  full_name?: string;
  email?: string;
  role?: UserRole;
  phone?: string | null;
  seccion?: string | null;
  lider_id?: string | null;
  coordinador_id?: string | null;
}

export async function createManagedUser(
  payload: UserWritePayload & { email: string; full_name: string; role: UserRole },
): Promise<{ user: ManagedUser; temporary_password: string | null }> {
  const { data } = await apiClient.post("/users", payload);
  return data;
}

export async function updateManagedUser(
  id: string,
  payload: UserWritePayload,
): Promise<ManagedUser> {
  const { data } = await apiClient.patch<ManagedUser>(`/users/${id}`, payload);
  return data;
}

/** Count of active users per role (one tiny request per role, in parallel). */
export async function fetchRoleCounts(
  roles: UserRole[],
): Promise<Partial<Record<UserRole, number>>> {
  const results = await Promise.allSettled(
    roles.map((role) =>
      fetchUsers({ role, is_active: true, limit: 1, offset: 0 }).then((p) => p.total),
    ),
  );
  const out: Partial<Record<UserRole, number>> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") out[roles[i]] = r.value;
  });
  return out;
}

/** People that can be picked as líder / coordinación for a new user. */
export async function fetchPeopleByRole(role: UserRole): Promise<ManagedUser[]> {
  try {
    const page = await fetchUsers({ role, is_active: true, limit: 200, sort: "full_name", order: "asc" });
    return page.items;
  } catch {
    return [];
  }
}

export interface SeccionOption {
  seccion: string;
  barrio?: string;
}

/**
 * SMA secciones from the capture catalogue. Returns `null` when the catalogue
 * isn't reachable (no campaign selected, role without access, endpoint not
 * deployed) so the form falls back to a free-text field.
 */
export async function fetchSecciones(): Promise<SeccionOption[] | null> {
  try {
    const { data } = await apiClient.get<{ secciones?: SeccionOption[] }>("/captura/catalogo");
    const list = Array.isArray(data?.secciones) ? data.secciones : [];
    if (list.length === 0) return null;
    return [...list].sort((a, b) =>
      a.seccion.localeCompare(b.seccion, "es", { numeric: true }),
    );
  } catch {
    return null;
  }
}
