import { type ComponentType } from "react";

import { lazyPreload, type PreloadableComponent } from "@/lib/lazyPreload";

import type { UserRole } from "@/types/auth";
import { ALERTAS_READ } from "@/modules/alertas/logic";
import {
  AlertIcon,
  AnalyticsIcon,
  DashboardIcon,
  MapIcon,
  DatabaseIcon,
  LayersIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
  VotersIcon,
} from "@/components/ui/icons";

export type ModuleState = "active" | "preview";
export type ModuleSection = "operacion" | "administracion";

export interface ModuleDef {
  key: string;
  path: string;
  label: string;
  section: ModuleSection;
  icon: ComponentType<{ width?: number; height?: number; className?: string }>;
  state: ModuleState;
  /** Restrict to roles; omit = any authenticated user. */
  roles?: UserRole[];
  element: PreloadableComponent<ComponentType>;
  /** End-match for the index route. */
  end?: boolean;
  /** Nav group: the sidebar shows ONE entry per group and AppLayout renders the
   * group's modules as tabs. Omit for a standalone sidebar entry. */
  group?: ModuleGroupKey;
  /** Routed but never shown in the sidebar or tabs. */
  hidden?: boolean;
}

// ── Default-deny role constants ──────────────────────────────────────────────
const ALL: UserRole[] = [
  "superadmin", "admin", "coordinador", "lider",
  "activista", "capturista", "analyst", "viewer", "consulta",
];
// Territory/operational intel a coordinador DOES keep (San Mateo Atenco panorama).
const INTEL_TERRITORY: UserRole[] = ["superadmin", "admin", "coordinador", "lider", "analyst", "viewer"];
// Activist console a coordinador owns (dashboard, registros).
const CONSOLE_COORD: UserRole[] = ["superadmin", "admin", "coordinador", "lider"];
// Militante capture — coordinador tier + the field roles that actually affiliate people.
const CONSOLE_CAPTURA: UserRole[] = [
  "superadmin", "admin", "coordinador", "lider", "activista", "capturista",
];
const ADMINY: UserRole[] = ["superadmin", "admin"];
// Minutas & Acuerdos — read tier (list/detail/mis-acuerdos) also reaches
// activista/capturista, who attend reuniones but don't create/edit actas.
export const MINUTAS_READ: UserRole[] = [
  "superadmin", "admin", "coordinador", "lider", "activista", "capturista",
];
// Minutas & Acuerdos — write tier (crear/editar/publicar/cambiar estado de
// acuerdo). Mirrors CONSOLE_COORD; exported so App.tsx/MinutasListPage/
// MinutaDetailPage share one definition instead of hand-copying the array.
export const MINUTAS_WRITE: UserRole[] = [
  "superadmin", "admin", "coordinador", "lider",
];
// Scrum/PM — governance tier (crear/estimar/asignar/mover-a-sprint workitems,
// sprint CRUD/activar/cerrar, agregar tareas). Mirrors the backend's
// scrum.py `_GOV` dependency (ADMIN+COORDINADOR) — narrower than MINUTAS_WRITE
// since lider is read/move-tier only here (she can still move cards and
// toggle tareas she's responsable for; the service enforces that, not RBAC).
export const SCRUM_GOV: UserRole[] = ["superadmin", "admin", "coordinador"];


export type ModuleGroupKey =
  | "territorio" | "personas" | "militantes" | "atencion" | "reuniones" | "tareas" | "sistema";

export interface ModuleGroup {
  key: ModuleGroupKey;
  label: string;
  section: ModuleSection;
  icon: ComponentType<{ width?: number; height?: number; className?: string }>;
}

export const SECTION_LABELS: Record<ModuleSection, string> = {
  operacion: "Operación",
  administracion: "Administración",
};

export const SECTION_ORDER: ModuleSection[] = [
  "operacion",
  "administracion",
];

const Dashboard = lazyPreload(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const PlatformDashboard = lazyPreload(() =>
  import("@/pages/PlatformDashboardPage").then((m) => ({
    default: m.PlatformDashboardPage,
  })),
);
const Users = lazyPreload(() =>
  import("@/pages/UsersPage").then((m) => ({ default: m.UsersPage })),
);
const Organization = lazyPreload(() =>
  import("@/pages/OrganizationSettingsPage").then((m) => ({
    default: m.OrganizationSettingsPage,
  })),
);
const Auditoria = lazyPreload(() =>
  import("@/modules/auditoria/AuditoriaPage").then((m) => ({
    default: m.AuditoriaPage,
  })),
);
const Configuracion = lazyPreload(() =>
  import("@/modules/configuracion/ConfiguracionPage").then((m) => ({
    default: m.ConfiguracionPage,
  })),
);
const Organizaciones = lazyPreload(() =>
  import("@/modules/organizaciones/OrgsPage").then((m) => ({ default: m.OrgsPage })),
);
const Campaigns = lazyPreload(() =>
  import("@/modules/campaigns/CampaignsPage").then((m) => ({
    default: m.CampaignsPage,
  })),
);
const Historial = lazyPreload(() =>
  import("@/modules/historial/HistorialPage").then((m) => ({ default: m.HistorialPage })),
);
const MapaSma = lazyPreload(() =>
  import("@/modules/mapa/MapaSmaPage").then((m) => ({ default: m.MapaSmaPage })),
);
const CapturaHojas = lazyPreload(() =>
  import("@/modules/captura/CapturaHojasPage").then((m) => ({ default: m.CapturaHojasPage })),
);
const ImportarPromovidos = lazyPreload(() =>
  import("@/modules/promovidos/ImportarPromovidosPage").then((m) => ({ default: m.ImportarPromovidosPage })),
);
const Estructura = lazyPreload(() =>
  import("@/modules/promovidos/EstructuraPage").then((m) => ({
    default: m.EstructuraPage,
  })),
);
const Promovidos = lazyPreload(() =>
  import("@/modules/promovidos/PromovidosPage").then((m) => ({ default: m.PromovidosPage })),
);
const CapturaMilitante = lazyPreload(() =>
  import("@/modules/militantes/CapturaMilitantePage"),
);
const PanoramaMilitantes = lazyPreload(() =>
  import("@/modules/militantes/PanoramaMilitantesPage"),
);
const MilitantesList = lazyPreload(() =>
  import("@/modules/militantes/MilitantesListPage").then((m) => ({
    default: m.MilitantesListPage,
  })),
);
const PanoramaAtencion = lazyPreload(() =>
  import("@/modules/atencion/PanoramaAtencionPage"),
);
const CasosAtencion = lazyPreload(() =>
  import("@/modules/atencion/CasosPage"),
);
const CapturaAtencion = lazyPreload(() =>
  import("@/modules/atencion/CapturaAtencionPage"),
);
const FormBuilder = lazyPreload(() =>
  import("@/modules/atencion/FormBuilderPage"),
);
const PanoramaMunicipio = lazyPreload(() =>
  import("@/modules/municipio/PanoramaMunicipioPage"),
);
const PlanTerritorial = lazyPreload(() =>
  import("@/modules/operacion/PlanTerritorialPage"),
);
const Alertas = lazyPreload(() =>
  import("@/modules/alertas/AlertasPage"),
);
const WarRoom = lazyPreload(() =>
  import("@/modules/operacion/WarRoomPage"),
);
const MinutasList = lazyPreload(() =>
  import("@/modules/minutas/MinutasListPage"),
);
const MisAcuerdos = lazyPreload(() =>
  import("@/modules/minutas/MisAcuerdosPage"),
);
// Scrum/PM board — /workitems/:id has no dedicated route: WorkItemDetail
// renders as an in-page drawer from Tablero/Backlog instead (see
// modules/scrum/WorkItemDetail.tsx), so all three scrum pages are plain
// nav-visible routes here, unlike the minutas param routes in App.tsx.
const Tablero = lazyPreload(() => import("@/modules/scrum/TableroPage"));
const Backlog = lazyPreload(() => import("@/modules/scrum/BacklogPage"));
const Sprints = lazyPreload(() => import("@/modules/scrum/SprintsPage"));

export const GROUPS: ModuleGroup[] = [
  { key: "territorio", label: "Mapa SMA", section: "operacion", icon: MapIcon },
  { key: "personas", label: "Personas", section: "operacion", icon: VotersIcon },
  { key: "militantes", label: "Militantes", section: "operacion", icon: UserIcon },
  { key: "atencion", label: "Atención", section: "operacion", icon: ShieldIcon },
  { key: "reuniones", label: "Reuniones", section: "operacion", icon: AnalyticsIcon },
  { key: "tareas", label: "Tareas", section: "operacion", icon: LayersIcon },
  { key: "sistema", label: "Sistema", section: "administracion", icon: SettingsIcon },
];

export const MODULES: ModuleDef[] = [
  // Inicio (rendered as a loose item above the sections in Sidebar.tsx —
  // section value below is unused for grouping but must be a valid ModuleSection).
  { key: "dashboard", path: "/", label: "Inicio", section: "operacion", icon: DashboardIcon, state: "active", element: Dashboard, end: true, roles: ALL },
  { key: "captura", path: "/captura", label: "Captura de hojas", section: "operacion", icon: VotersIcon, state: "active", element: CapturaHojas, roles: ["superadmin", "admin", "coordinador", "capturista"] },
  { key: "mapa", path: "/mapa", label: "Mapa", group: "territorio", section: "operacion", icon: MapIcon, state: "active", element: MapaSma, roles: ["superadmin", "admin", "coordinador", "lider", "analyst"] },

  { key: "municipio-panorama", path: "/municipio", label: "Panorama", group: "territorio", section: "operacion", icon: AnalyticsIcon, state: "active", element: PanoramaMunicipio, roles: INTEL_TERRITORY },

  // Operación (ex-ciudadanía)
  { key: "plan-territorial", path: "/plan-territorial", label: "Plan", group: "territorio", section: "operacion", icon: LayersIcon, state: "active", element: PlanTerritorial, roles: CONSOLE_COORD },
  { key: "war-room", path: "/war-room", label: "War Room", group: "territorio", section: "operacion", icon: AnalyticsIcon, state: "active", element: WarRoom, roles: CONSOLE_COORD },
  // Minutas & Acuerdos — only the two non-parameterized routes are nav items;
  // /minutas/nueva, /minutas/:id and /minutas/:id/editar are registered
  // directly in App.tsx (param routes must not appear as Sidebar links).
  { key: "minutas", path: "/minutas", label: "Minutas", group: "reuniones", section: "operacion", icon: AnalyticsIcon, state: "active", element: MinutasList, roles: MINUTAS_READ },
  { key: "acuerdos", path: "/acuerdos", label: "Acuerdos", group: "reuniones", section: "operacion", icon: UserIcon, state: "active", element: MisAcuerdos, roles: MINUTAS_READ },
  // Scrum/PM — tablero/backlog/sprints. Read tier mirrors minutas (activista/
  // capturista can view); create/estimate/assign/activar/cerrar is gated
  // in-page to SCRUM_GOV (coordinador/admin), mover-tarjeta is open to the
  // whole read tier with ownership enforced server-side.
  { key: "scrum-tablero", path: "/tablero", label: "Tablero", group: "tareas", section: "operacion", icon: LayersIcon, state: "active", element: Tablero, roles: MINUTAS_READ },
  { key: "scrum-backlog", path: "/backlog", label: "Pendientes", group: "tareas", section: "operacion", icon: DatabaseIcon, state: "active", element: Backlog, roles: MINUTAS_READ },
  { key: "scrum-sprints", path: "/sprints", label: "Ciclos", group: "tareas", section: "operacion", icon: AnalyticsIcon, state: "active", element: Sprints, roles: MINUTAS_READ },
  { key: "promovidos", path: "/promovidos", label: "Lista", group: "personas", section: "operacion", icon: VotersIcon, state: "active", element: Promovidos, roles: ["superadmin", "admin", "coordinador", "lider"] },
  { key: "militantes-captura", path: "/militantes/captura", label: "Afiliar", group: "militantes", section: "operacion", icon: VotersIcon, state: "active", element: CapturaMilitante, roles: CONSOLE_CAPTURA },
  { key: "militantes", path: "/militantes", label: "Panorama", group: "militantes", section: "operacion", icon: VotersIcon, state: "active", element: PanoramaMilitantes, roles: ["superadmin", "admin", "coordinador"], end: true },
  { key: "militantes-lista", path: "/militantes/lista", label: "Lista", group: "militantes", section: "operacion", icon: VotersIcon, state: "active", element: MilitantesList, roles: CONSOLE_COORD },
  { key: "atencion", path: "/atencion", label: "Panorama", group: "atencion", section: "operacion", icon: UserIcon, state: "active", element: PanoramaAtencion, roles: ["superadmin", "admin", "coordinador"], end: true },
  { key: "atencion-casos", path: "/atencion/casos", label: "Casos", group: "atencion", section: "operacion", icon: UserIcon, state: "active", element: CasosAtencion, roles: CONSOLE_COORD },
  { key: "atencion-captura", path: "/atencion/captura", label: "Atender", group: "atencion", section: "operacion", icon: UserIcon, state: "active", element: CapturaAtencion, roles: CONSOLE_CAPTURA },
  { key: "atencion-formularios", path: "/atencion/formularios", label: "Formularios", group: "atencion", section: "operacion", icon: SettingsIcon, state: "active", element: FormBuilder, roles: ["superadmin", "admin", "coordinador"] },
  { key: "riesgo", path: "/riesgo", label: "Alertas", group: "territorio", section: "operacion", icon: AlertIcon, state: "active", element: Alertas, roles: ALERTAS_READ },

  // Administración (ex-gobernanza + ex-administracion)
  { key: "auditoria", path: "/auditoria", label: "Auditoría", group: "sistema", section: "administracion", icon: ShieldIcon, state: "active", element: Auditoria, roles: ADMINY },
  { key: "historial", path: "/historial", label: "Ingestas", group: "sistema", section: "administracion", icon: DatabaseIcon, state: "active", element: Historial, roles: ADMINY },

  // Personas: Lista (above) → Estructura (paper tree; path kept for alert links) → Importar
  { key: "admin-estructura", path: "/admin/estructura", label: "Estructura", group: "personas", section: "operacion", icon: UserIcon, state: "active", element: Estructura, roles: CONSOLE_COORD },
  { key: "promovidos-importar", path: "/promovidos/importar", label: "Importar", group: "personas", section: "operacion", icon: DatabaseIcon, state: "active", element: ImportarPromovidos, roles: ["superadmin", "admin", "coordinador"] },

  // Administración (role-gated, active)
  { key: "users", path: "/users", label: "Usuarios", section: "administracion", icon: UserIcon, state: "active", element: Users, roles: ADMINY },
  { key: "organization", path: "/organization", label: "Organización", group: "sistema", section: "administracion", icon: SettingsIcon, state: "active", element: Organization, roles: ADMINY },
  { key: "configuracion", path: "/configuracion", label: "Configuración", group: "sistema", section: "administracion", icon: SettingsIcon, state: "active", element: Configuracion, roles: ADMINY },
  { key: "organizaciones", path: "/organizaciones", label: "Organizaciones", group: "sistema", section: "administracion", icon: ShieldIcon, state: "active", element: Organizaciones, roles: ["superadmin"] },
  { key: "campaigns", path: "/campaigns", label: "Campañas", group: "sistema", section: "administracion", icon: AnalyticsIcon, state: "active", element: Campaigns, roles: ADMINY },
  { key: "plataforma", path: "/plataforma", label: "Plataforma", group: "sistema", section: "administracion", icon: DatabaseIcon, state: "active", element: PlatformDashboard, roles: ["superadmin", "admin"] },
];

// ── Nav helpers (Sidebar + group tabs) ───────────────────────────────────────
export function visibleFor(role: string | undefined, m: ModuleDef): boolean {
  if (m.hidden) return false;
  if (!m.roles) return true;
  if (!role) return false;
  return m.roles.includes(role as UserRole);
}

/** Modules of a group the role can see, in registry order (= tab order). */
export function groupModules(group: ModuleGroupKey, role: string | undefined): ModuleDef[] {
  return MODULES.filter((m) => m.group === group && visibleFor(role, m));
}

function matchesPath(m: ModuleDef, pathname: string): boolean {
  if (m.path === "/") return pathname === "/";
  return pathname === m.path || pathname.startsWith(m.path + "/");
}

/** The module owning ``pathname`` (longest matching path wins). */
export function moduleForPath(pathname: string): ModuleDef | undefined {
  let best: ModuleDef | undefined;
  for (const m of MODULES) {
    if (matchesPath(m, pathname) && (!best || m.path.length > best.path.length)) best = m;
  }
  return best;
}


/** Fetch the route chunk for `path` ahead of time (hover/focus on a nav link). */
export function preloadPath(pathname: string): void {
  void moduleForPath(pathname)?.element.preload().catch(() => undefined);
}

/**
 * Warm every module chunk the role can open, one at a time when the browser is
 * idle, so switching modules never waits on the network. Skipped on
 * data-saver connections (capturistas on prepaid mobile data).
 */
export function preloadModulesFor(role: string | undefined): () => void {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return () => undefined;
  const queue = MODULES.filter(
    (m) => !m.roles || (role !== undefined && m.roles.includes(role as UserRole)),
  );
  let cancelled = false;
  type IdleWin = Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  const w = window as IdleWin;
  const schedule = (cb: () => void) =>
    w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 2000 }) : window.setTimeout(cb, 300);
  const next = () => {
    if (cancelled) return;
    const m = queue.shift();
    if (!m) return;
    m.element
      .preload()
      .catch(() => undefined)
      .finally(() => schedule(next));
  };
  schedule(next);
  return () => {
    cancelled = true;
  };
}
