import type { Alerta, Categoria, Severidad } from "@/api/alertas";
import type { UserRole } from "@/types/auth";

/** Espejo de require_roles(ADMIN, COORDINADOR) en GET /alertas (+ superadmin). */
export const ALERTAS_READ: UserRole[] = ["superadmin", "admin", "coordinador"];

export type FiltroCategoria = "todas" | Categoria;

export const SEVERIDAD: Record<Severidad, { label: string; color: string; pill: "crit" | "warn" }> = {
  critica: { label: "Crítica", color: "rgb(var(--c-critical))", pill: "crit" },
  alta: { label: "Alta", color: "rgb(var(--c-amber))", pill: "warn" },
  media: { label: "Media", color: "rgb(var(--c-warning))", pill: "warn" },
};

export function filtrarAlertas(
  items: Alerta[],
  categoria: FiltroCategoria,
  seccion: string | null,
): Alerta[] {
  return items.filter(
    (a) =>
      (categoria === "todas" || a.categoria === categoria) &&
      (seccion === null || a.seccion === seccion),
  );
}

export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const min = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "evaluado hace un momento";
  if (min < 60) return `evaluado hace ${min} min`;
  return `evaluado hace ${Math.round(min / 60)} h`;
}
