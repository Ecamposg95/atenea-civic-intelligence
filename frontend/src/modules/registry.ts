import { lazy, type ComponentType, type LazyExoticComponent } from "react";

import type { UserRole } from "@/types/auth";
import {
  AiIcon,
  AlertIcon,
  AnalyticsIcon,
  DashboardIcon,
  DatabaseIcon,
  LayersIcon,
  MapIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
  VotersIcon,
} from "@/components/ui/icons";

export type ModuleState = "active" | "preview" | "soon";
export type ModuleSection = "operacion" | "inteligencia" | "administracion";

export interface SoonCopy {
  summary: string;
  features: string[];
  dataSource: string;
}

export interface ModuleDef {
  key: string;
  path: string;
  label: string;
  section: ModuleSection;
  icon: ComponentType<{ width?: number; height?: number; className?: string }>;
  state: ModuleState;
  /** Restrict to roles; omit = any authenticated user. */
  roles?: UserRole[];
  /** Component for active/preview modules. soon → ComingSoonPage. */
  element?: LazyExoticComponent<ComponentType>;
  /** End-match for the index route. */
  end?: boolean;
  soon?: SoonCopy;
}

// ── Default-deny role constants ──────────────────────────────────────────────
const ALL: UserRole[] = [
  "superadmin", "admin", "coordinador", "lider",
  "activista", "capturista", "analyst", "viewer", "consulta",
];
// Broad intelligence library (reference datasets, analytics, search). A
// COORDINADOR is a campaign/territory operator, NOT an intelligence viewer, so
// she is intentionally excluded here.
const INTEL: UserRole[] = ["superadmin", "admin", "lider", "analyst", "viewer"];
// Territory/operational intel a coordinador DOES keep (San Mateo Atenco panorama).
const INTEL_TERRITORY: UserRole[] = ["superadmin", "admin", "coordinador", "lider", "analyst", "viewer"];
// Analyst-tier intelligence library (Mapa, Territorios) — national-scope GIS
// tools misaimed for an operator; coordinador/lider are excluded (UX-4 A).
const INTEL_ANALYST: UserRole[] = ["superadmin", "admin", "analyst", "viewer"];
// Generic console tier (e.g. Participación) — coordinador excluded.
const CONSOLE: UserRole[] = ["superadmin", "admin", "lider"];
// Activist console a coordinador owns (dashboard, registros).
const CONSOLE_COORD: UserRole[] = ["superadmin", "admin", "coordinador", "lider"];
// Militante capture — coordinador tier + the field roles that actually affiliate people.
const CONSOLE_CAPTURA: UserRole[] = [
  "superadmin", "admin", "coordinador", "lider", "activista", "capturista",
];
const ADMINY: UserRole[] = ["superadmin", "admin"];
const REPORTS: UserRole[] = ["superadmin", "admin", "coordinador", "lider", "analyst", "viewer", "consulta"];
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

export const SECTION_LABELS: Record<ModuleSection, string> = {
  operacion: "Operación",
  inteligencia: "Inteligencia Electoral",
  administracion: "Administración",
};

export const SECTION_ORDER: ModuleSection[] = [
  "operacion",
  "inteligencia",
  "administracion",
];

const Dashboard = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const PlatformDashboard = lazy(() =>
  import("@/pages/PlatformDashboardPage").then((m) => ({
    default: m.PlatformDashboardPage,
  })),
);
const MapExplorer = lazy(() =>
  import("@/pages/MapExplorerPage").then((m) => ({ default: m.MapExplorerPage })),
);
const Analytics = lazy(() =>
  import("@/pages/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);
const Sources = lazy(() =>
  import("@/pages/SourcesPage").then((m) => ({ default: m.SourcesPage })),
);
const Users = lazy(() =>
  import("@/pages/UsersPage").then((m) => ({ default: m.UsersPage })),
);
const Organization = lazy(() =>
  import("@/pages/OrganizationSettingsPage").then((m) => ({
    default: m.OrganizationSettingsPage,
  })),
);
const Resultados = lazy(() =>
  import("@/modules/resultados/ResultadosPage").then((m) => ({
    default: m.ResultadosPage,
  })),
);
const Padron = lazy(() =>
  import("@/modules/padron/PadronPage").then((m) => ({ default: m.PadronPage })),
);
const AiAnalyst = lazy(() =>
  import("@/modules/ai-analyst/AiAnalystPage").then((m) => ({
    default: m.AiAnalystPage,
  })),
);
const Auditoria = lazy(() =>
  import("@/modules/auditoria/AuditoriaPage").then((m) => ({
    default: m.AuditoriaPage,
  })),
);
const Territorios = lazy(() =>
  import("@/modules/territorios/TerritoriosPage").then((m) => ({
    default: m.TerritoriosPage,
  })),
);
const Ieem = lazy(() =>
  import("@/modules/ieem/IeemPage").then((m) => ({ default: m.IeemPage })),
);
const WorldBank = lazy(() =>
  import("@/modules/worldbank/WorldBankPage").then((m) => ({
    default: m.WorldBankPage,
  })),
);
const Economia = lazy(() =>
  import("@/modules/economia/EconomiaPage").then((m) => ({ default: m.EconomiaPage })),
);
const Banxico = lazy(() =>
  import("@/modules/banxico/BanxicoPage").then((m) => ({ default: m.BanxicoPage })),
);
const Denue = lazy(() =>
  import("@/modules/denue/DenuePage").then((m) => ({ default: m.DenuePage })),
);
const Demografia = lazy(() =>
  import("@/modules/demografia/DemografiaPage").then((m) => ({
    default: m.DemografiaPage,
  })),
);
const Indice = lazy(() =>
  import("@/modules/indice/IndicePage").then((m) => ({ default: m.IndicePage })),
);
const Reportes = lazy(() =>
  import("@/modules/reportes/ReportesPage").then((m) => ({ default: m.ReportesPage })),
);
const Configuracion = lazy(() =>
  import("@/modules/configuracion/ConfiguracionPage").then((m) => ({
    default: m.ConfiguracionPage,
  })),
);
const Organizaciones = lazy(() =>
  import("@/modules/organizaciones/OrgsPage").then((m) => ({ default: m.OrgsPage })),
);
const Campaigns = lazy(() =>
  import("@/modules/campaigns/CampaignsPage").then((m) => ({
    default: m.CampaignsPage,
  })),
);
const Busqueda = lazy(() =>
  import("@/modules/busqueda/BusquedaPage").then((m) => ({ default: m.BusquedaPage })),
);
const Historial = lazy(() =>
  import("@/modules/historial/HistorialPage").then((m) => ({ default: m.HistorialPage })),
);
const Captura = lazy(() =>
  import("@/modules/captura/CapturaPage").then((m) => ({ default: m.CapturaPage })),
);
const CapturaRapida = lazy(() =>
  import("@/modules/captura/CapturaRapidaPage").then((m) => ({ default: m.CapturaRapidaPage })),
);
const ImportarPromovidos = lazy(() =>
  import("@/modules/promovidos/ImportarPromovidosPage").then((m) => ({ default: m.ImportarPromovidosPage })),
);
const AdminDashboard = lazy(() =>
  import("@/modules/admin/AdminDashboardPage").then((m) => ({
    default: m.AdminDashboardPage,
  })),
);
const AdminRegistros = lazy(() =>
  import("@/modules/admin/AdminRegistrosPage").then((m) => ({
    default: m.AdminRegistrosPage,
  })),
);
const AdminEstructura = lazy(() =>
  import("@/modules/admin/AdminEstructuraPage").then((m) => ({
    default: m.AdminEstructuraPage,
  })),
);
const Promovidos = lazy(() =>
  import("@/modules/promovidos/PromovidosPage").then((m) => ({ default: m.PromovidosPage })),
);
const CapturaMilitante = lazy(() =>
  import("@/modules/militantes/CapturaMilitantePage"),
);
const PanoramaMilitantes = lazy(() =>
  import("@/modules/militantes/PanoramaMilitantesPage"),
);
const MilitantesList = lazy(() =>
  import("@/modules/militantes/MilitantesListPage").then((m) => ({
    default: m.MilitantesListPage,
  })),
);
const PanoramaAtencion = lazy(() =>
  import("@/modules/atencion/PanoramaAtencionPage"),
);
const CasosAtencion = lazy(() =>
  import("@/modules/atencion/CasosPage"),
);
const CapturaAtencion = lazy(() =>
  import("@/modules/atencion/CapturaAtencionPage"),
);
const FormBuilder = lazy(() =>
  import("@/modules/atencion/FormBuilderPage"),
);
const PanoramaMunicipio = lazy(() =>
  import("@/modules/municipio/PanoramaMunicipioPage"),
);
const PlanTerritorial = lazy(() =>
  import("@/modules/operacion/PlanTerritorialPage"),
);
const WarRoom = lazy(() =>
  import("@/modules/operacion/WarRoomPage"),
);
const MinutasList = lazy(() =>
  import("@/modules/minutas/MinutasListPage"),
);
const MisAcuerdos = lazy(() =>
  import("@/modules/minutas/MisAcuerdosPage"),
);
// Scrum/PM board — /workitems/:id has no dedicated route: WorkItemDetail
// renders as an in-page drawer from Tablero/Backlog instead (see
// modules/scrum/WorkItemDetail.tsx), so all three scrum pages are plain
// nav-visible routes here, unlike the minutas param routes in App.tsx.
const Tablero = lazy(() => import("@/modules/scrum/TableroPage"));
const Backlog = lazy(() => import("@/modules/scrum/BacklogPage"));
const Sprints = lazy(() => import("@/modules/scrum/SprintsPage"));

export const MODULES: ModuleDef[] = [
  // Inicio (rendered as a loose item above the sections in Sidebar.tsx —
  // section value below is unused for grouping but must be a valid ModuleSection).
  { key: "dashboard", path: "/", label: "Inicio", section: "operacion", icon: DashboardIcon, state: "active", element: Dashboard, end: true, roles: ALL },

  // Inteligencia Electoral (ex-plataforma data/analysis tools + existing intel datasets)
  { key: "maps", path: "/maps", label: "Mapa", section: "inteligencia", icon: MapIcon, state: "active", element: MapExplorer, roles: INTEL_ANALYST },
  { key: "analytics", path: "/analytics", label: "Analítica", section: "inteligencia", icon: AnalyticsIcon, state: "active", element: Analytics, roles: INTEL },
  { key: "sources", path: "/sources", label: "Fuentes", section: "inteligencia", icon: DatabaseIcon, state: "active", element: Sources, roles: ["superadmin", "admin", "analyst"] },
  { key: "busqueda", path: "/busqueda", label: "Búsqueda", section: "inteligencia", icon: SearchIcon, state: "active", element: Busqueda, roles: INTEL },
  { key: "resultados", path: "/resultados", label: "Resultados", section: "inteligencia", icon: AnalyticsIcon, state: "preview", element: Resultados, roles: INTEL },
  { key: "padron", path: "/padron", label: "Padrón", section: "inteligencia", icon: VotersIcon, state: "preview", element: Padron, roles: ["superadmin", "admin", "analyst"] },
  {
    key: "candidaturas", path: "/candidaturas", label: "Candidaturas", section: "inteligencia", icon: UserIcon, state: "soon", roles: INTEL,
    soon: {
      summary: "Registro y seguimiento de candidaturas por cargo, partido y territorio.",
      features: ["Directorio de candidaturas por elección", "Filtros por partido, cargo y entidad", "Fichas con trayectoria y vínculos"],
      dataSource: "Candidaturas MX (apielectoral.mx) — ya integrada en el backend.",
    },
  },
  { key: "municipio-panorama", path: "/municipio", label: "San Mateo Atenco", section: "inteligencia", icon: AnalyticsIcon, state: "active", element: PanoramaMunicipio, roles: INTEL_TERRITORY },
  { key: "territorios", path: "/territorios", label: "Territorios", section: "inteligencia", icon: LayersIcon, state: "active", element: Territorios, roles: INTEL_ANALYST },
  { key: "ieem", path: "/ieem", label: "IEEM", section: "inteligencia", icon: AnalyticsIcon, state: "active", element: Ieem, roles: INTEL },
  { key: "worldbank", path: "/indicadores", label: "Indicadores", section: "inteligencia", icon: AnalyticsIcon, state: "active", element: WorldBank, roles: INTEL },
  { key: "economia", path: "/economia", label: "Economía", section: "inteligencia", icon: DatabaseIcon, state: "preview", element: Economia, roles: INTEL },
  { key: "denue", path: "/unidades-economicas", label: "Denue", section: "inteligencia", icon: DatabaseIcon, state: "preview", element: Denue, roles: INTEL },
  { key: "banxico", path: "/banxico", label: "Banxico", section: "inteligencia", icon: AnalyticsIcon, state: "preview", element: Banxico, roles: INTEL },

  // Operación (ex-ciudadanía)
  { key: "captura-rapida", path: "/captura-rapida", label: "Captura rápida", section: "operacion", icon: VotersIcon, state: "active", element: CapturaRapida, roles: CONSOLE_CAPTURA },
  { key: "promovidos-importar", path: "/promovidos/importar", label: "Importar", section: "operacion", icon: DatabaseIcon, state: "active", element: ImportarPromovidos, roles: ["superadmin", "admin", "coordinador"] },
  { key: "captura", path: "/captura", label: "Activistas", section: "operacion", icon: VotersIcon, state: "active", element: Captura, roles: ["superadmin", "admin", "lider", "activista", "capturista"] },
  { key: "plan-territorial", path: "/plan-territorial", label: "Plan Territorial", section: "operacion", icon: LayersIcon, state: "active", element: PlanTerritorial, roles: CONSOLE_COORD },
  { key: "war-room", path: "/war-room", label: "War Room", section: "operacion", icon: AnalyticsIcon, state: "active", element: WarRoom, roles: CONSOLE_COORD },
  // Minutas & Acuerdos — only the two non-parameterized routes are nav items;
  // /minutas/nueva, /minutas/:id and /minutas/:id/editar are registered
  // directly in App.tsx (param routes must not appear as Sidebar links).
  { key: "minutas", path: "/minutas", label: "Minutas", section: "operacion", icon: AnalyticsIcon, state: "active", element: MinutasList, roles: MINUTAS_READ },
  { key: "acuerdos", path: "/acuerdos", label: "Acuerdos", section: "operacion", icon: UserIcon, state: "active", element: MisAcuerdos, roles: MINUTAS_READ },
  // Scrum/PM — tablero/backlog/sprints. Read tier mirrors minutas (activista/
  // capturista can view); create/estimate/assign/activar/cerrar is gated
  // in-page to SCRUM_GOV (coordinador/admin), mover-tarjeta is open to the
  // whole read tier with ownership enforced server-side.
  { key: "scrum-tablero", path: "/tablero", label: "Tablero", section: "operacion", icon: LayersIcon, state: "active", element: Tablero, roles: MINUTAS_READ },
  { key: "scrum-backlog", path: "/backlog", label: "Pendientes", section: "operacion", icon: DatabaseIcon, state: "active", element: Backlog, roles: MINUTAS_READ },
  { key: "scrum-sprints", path: "/sprints", label: "Ciclos", section: "operacion", icon: AnalyticsIcon, state: "active", element: Sprints, roles: MINUTAS_READ },
  { key: "promovidos", path: "/promovidos", label: "Promovidos", section: "operacion", icon: VotersIcon, state: "active", element: Promovidos, roles: ["superadmin", "admin", "coordinador", "lider"] },
  { key: "militantes-captura", path: "/militantes/captura", label: "Afiliar militante", section: "operacion", icon: VotersIcon, state: "active", element: CapturaMilitante, roles: CONSOLE_CAPTURA },
  { key: "militantes", path: "/militantes", label: "Afiliación", section: "operacion", icon: VotersIcon, state: "active", element: PanoramaMilitantes, roles: ["superadmin", "admin", "coordinador"], end: true },
  { key: "militantes-lista", path: "/militantes/lista", label: "Militantes", section: "operacion", icon: VotersIcon, state: "active", element: MilitantesList, roles: CONSOLE_COORD },
  { key: "atencion", path: "/atencion", label: "Panorama", section: "operacion", icon: UserIcon, state: "active", element: PanoramaAtencion, roles: ["superadmin", "admin", "coordinador"], end: true },
  { key: "atencion-casos", path: "/atencion/casos", label: "Casos", section: "operacion", icon: UserIcon, state: "active", element: CasosAtencion, roles: CONSOLE_COORD },
  { key: "atencion-captura", path: "/atencion/captura", label: "Atender", section: "operacion", icon: UserIcon, state: "active", element: CapturaAtencion, roles: CONSOLE_CAPTURA },
  { key: "atencion-formularios", path: "/atencion/formularios", label: "Formularios", section: "operacion", icon: SettingsIcon, state: "active", element: FormBuilder, roles: ["superadmin", "admin", "coordinador"] },
  { key: "ai-analyst", path: "/ai-analyst", label: "Copiloto", section: "operacion", icon: AiIcon, state: "preview", element: AiAnalyst, roles: ["superadmin", "admin", "coordinador", "analyst"] },
  { key: "demografia", path: "/demografia", label: "Censo", section: "operacion", icon: VotersIcon, state: "preview", element: Demografia, roles: INTEL },
  {
    key: "sentimiento", path: "/sentimiento", label: "Sentimiento", section: "operacion", icon: AnalyticsIcon, state: "soon", roles: INTEL,
    soon: {
      summary: "Escucha social y de medios sobre temas y actores cívicos.",
      features: ["Tendencias de conversación", "Análisis de sentimiento por tema", "Alertas de picos de actividad"],
      dataSource: "APIs de redes/medios (pendiente de contratar).",
    },
  },
  {
    key: "participacion", path: "/participacion", label: "Participación", section: "operacion", icon: VotersIcon, state: "soon", roles: CONSOLE,
    soon: {
      summary: "Consultas, peticiones y encuestas ciudadanas gobernadas.",
      features: ["Consultas y peticiones", "Encuestas con resultados auditables", "Tablero de participación"],
      dataSource: "Módulo propio de captación (por construir).",
    },
  },
  {
    key: "riesgo", path: "/riesgo", label: "Alertas", section: "operacion", icon: AlertIcon, state: "soon", roles: INTEL,
    soon: {
      summary: "Detección de anomalías y monitoreo de riesgo en territorio.",
      features: ["Anomalías estadísticas en resultados", "Mapa de zonas de riesgo", "Alertas configurables"],
      dataSource: "Modelos sobre PREP/cómputos + señales territoriales.",
    },
  },

  // Administración (ex-gobernanza + ex-administracion)
  { key: "auditoria", path: "/auditoria", label: "Auditoría", section: "administracion", icon: ShieldIcon, state: "active", element: Auditoria, roles: ADMINY },
  { key: "indice", path: "/indice", label: "Índice Cívico", section: "administracion", icon: AnalyticsIcon, state: "preview", element: Indice, roles: INTEL },
  { key: "historial", path: "/historial", label: "Ingestas", section: "administracion", icon: DatabaseIcon, state: "active", element: Historial, roles: ADMINY },
  { key: "reportes", path: "/reportes", label: "Reportes", section: "administracion", icon: DatabaseIcon, state: "active", element: Reportes, roles: REPORTS },

  // Admin console (role-gated, active)
  { key: "admin-dashboard", path: "/admin", label: "Consola", section: "administracion", icon: AnalyticsIcon, state: "active", element: AdminDashboard, roles: CONSOLE_COORD },
  { key: "admin-registros", path: "/admin/registros", label: "Registros", section: "administracion", icon: VotersIcon, state: "active", element: AdminRegistros, roles: CONSOLE_COORD },
  { key: "admin-estructura", path: "/admin/estructura", label: "Estructura", section: "administracion", icon: UserIcon, state: "active", element: AdminEstructura, roles: ["superadmin", "admin", "coordinador"] },

  // Administración (role-gated, active)
  { key: "users", path: "/users", label: "Usuarios", section: "administracion", icon: UserIcon, state: "active", element: Users, roles: ADMINY },
  { key: "organization", path: "/organization", label: "Organización", section: "administracion", icon: SettingsIcon, state: "active", element: Organization, roles: ADMINY },
  { key: "configuracion", path: "/configuracion", label: "Configuración", section: "administracion", icon: SettingsIcon, state: "active", element: Configuracion, roles: ADMINY },
  { key: "organizaciones", path: "/organizaciones", label: "Organizaciones", section: "administracion", icon: ShieldIcon, state: "active", element: Organizaciones, roles: ["superadmin"] },
  { key: "campaigns", path: "/campaigns", label: "Campañas", section: "administracion", icon: AnalyticsIcon, state: "active", element: Campaigns, roles: ADMINY },
  { key: "plataforma", path: "/plataforma", label: "Plataforma", section: "administracion", icon: DatabaseIcon, state: "active", element: PlatformDashboard, roles: ["superadmin", "admin"] },
];
