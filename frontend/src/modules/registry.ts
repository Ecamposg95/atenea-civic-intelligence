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
export type ModuleSection =
  | "plataforma"
  | "inteligencia"
  | "ciudadania"
  | "gobernanza"
  | "administracion";

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
// Territory/operational intel a coordinador DOES keep (Map Explorer, Territorios).
const INTEL_TERRITORY: UserRole[] = ["superadmin", "admin", "coordinador", "lider", "analyst", "viewer"];
// Generic console tier (e.g. Participación) — coordinador excluded.
const CONSOLE: UserRole[] = ["superadmin", "admin", "lider"];
// Activist console a coordinador owns (dashboard, registros).
const CONSOLE_COORD: UserRole[] = ["superadmin", "admin", "coordinador", "lider"];
const ADMINY: UserRole[] = ["superadmin", "admin"];
const REPORTS: UserRole[] = ["superadmin", "admin", "coordinador", "lider", "analyst", "viewer", "consulta"];

export const SECTION_LABELS: Record<ModuleSection, string> = {
  plataforma: "Plataforma",
  inteligencia: "Inteligencia Electoral",
  ciudadania: "Ciudadanía",
  gobernanza: "Gobernanza",
  administracion: "Administración",
};

export const SECTION_ORDER: ModuleSection[] = [
  "plataforma",
  "inteligencia",
  "ciudadania",
  "gobernanza",
  "administracion",
];

const Dashboard = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
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

export const MODULES: ModuleDef[] = [
  // Plataforma (active)
  { key: "dashboard", path: "/", label: "Command Center", section: "plataforma", icon: DashboardIcon, state: "active", element: Dashboard, end: true, roles: ALL },
  { key: "maps", path: "/maps", label: "Map Explorer", section: "plataforma", icon: MapIcon, state: "active", element: MapExplorer, roles: INTEL_TERRITORY },
  { key: "analytics", path: "/analytics", label: "Activity Analytics", section: "plataforma", icon: AnalyticsIcon, state: "active", element: Analytics, roles: INTEL },
  { key: "sources", path: "/sources", label: "Fuentes de datos", section: "plataforma", icon: DatabaseIcon, state: "active", element: Sources, roles: ["superadmin", "admin", "analyst"] },
  { key: "busqueda", path: "/busqueda", label: "Búsqueda global", section: "plataforma", icon: SearchIcon, state: "active", element: Busqueda, roles: INTEL },

  // Inteligencia Electoral
  { key: "resultados", path: "/resultados", label: "Resultados Electorales", section: "inteligencia", icon: AnalyticsIcon, state: "preview", element: Resultados, roles: INTEL },
  { key: "padron", path: "/padron", label: "Padrón / Lista Nominal", section: "inteligencia", icon: VotersIcon, state: "preview", element: Padron, roles: ["superadmin", "admin", "analyst"] },
  {
    key: "candidaturas", path: "/candidaturas", label: "Candidaturas", section: "inteligencia", icon: UserIcon, state: "soon", roles: INTEL,
    soon: {
      summary: "Registro y seguimiento de candidaturas por cargo, partido y territorio.",
      features: ["Directorio de candidaturas por elección", "Filtros por partido, cargo y entidad", "Fichas con trayectoria y vínculos"],
      dataSource: "Candidaturas MX (apielectoral.mx) — ya integrada en el backend.",
    },
  },
  { key: "territorios", path: "/territorios", label: "Territorios & Secciones", section: "inteligencia", icon: LayersIcon, state: "active", element: Territorios, roles: INTEL_TERRITORY },
  { key: "ieem", path: "/ieem", label: "Estado de México (IEEM)", section: "inteligencia", icon: AnalyticsIcon, state: "active", element: Ieem, roles: INTEL },
  { key: "worldbank", path: "/indicadores", label: "Indicadores Nacionales", section: "inteligencia", icon: AnalyticsIcon, state: "active", element: WorldBank, roles: INTEL },
  { key: "economia", path: "/economia", label: "Economía Territorial", section: "inteligencia", icon: DatabaseIcon, state: "preview", element: Economia, roles: INTEL },
  { key: "denue", path: "/unidades-economicas", label: "Unidades Económicas", section: "inteligencia", icon: DatabaseIcon, state: "preview", element: Denue, roles: INTEL },
  { key: "banxico", path: "/banxico", label: "Macro-financiero (Banxico)", section: "inteligencia", icon: AnalyticsIcon, state: "preview", element: Banxico, roles: INTEL },

  // Ciudadanía
  { key: "captura", path: "/captura", label: "Captura de Activistas", section: "ciudadania", icon: VotersIcon, state: "active", element: Captura, roles: ["superadmin", "admin", "lider", "activista", "capturista"] },
  { key: "ai-analyst", path: "/ai-analyst", label: "AI Analyst / Copiloto", section: "ciudadania", icon: AiIcon, state: "preview", element: AiAnalyst, roles: ["superadmin", "admin", "coordinador", "analyst"] },
  { key: "demografia", path: "/demografia", label: "Demografía & Censo", section: "ciudadania", icon: VotersIcon, state: "preview", element: Demografia, roles: INTEL },
  {
    key: "sentimiento", path: "/sentimiento", label: "Sentimiento Ciudadano", section: "ciudadania", icon: AnalyticsIcon, state: "soon", roles: INTEL,
    soon: {
      summary: "Escucha social y de medios sobre temas y actores cívicos.",
      features: ["Tendencias de conversación", "Análisis de sentimiento por tema", "Alertas de picos de actividad"],
      dataSource: "APIs de redes/medios (pendiente de contratar).",
    },
  },
  {
    key: "participacion", path: "/participacion", label: "Participación Ciudadana", section: "ciudadania", icon: VotersIcon, state: "soon", roles: CONSOLE,
    soon: {
      summary: "Consultas, peticiones y encuestas ciudadanas gobernadas.",
      features: ["Consultas y peticiones", "Encuestas con resultados auditables", "Tablero de participación"],
      dataSource: "Módulo propio de captación (por construir).",
    },
  },
  {
    key: "riesgo", path: "/riesgo", label: "Alertas & Riesgo Electoral", section: "ciudadania", icon: AlertIcon, state: "soon", roles: INTEL,
    soon: {
      summary: "Detección de anomalías y monitoreo de riesgo en territorio.",
      features: ["Anomalías estadísticas en resultados", "Mapa de zonas de riesgo", "Alertas configurables"],
      dataSource: "Modelos sobre PREP/cómputos + señales territoriales.",
    },
  },

  // Gobernanza
  { key: "auditoria", path: "/auditoria", label: "Auditoría & Cumplimiento", section: "gobernanza", icon: ShieldIcon, state: "active", element: Auditoria, roles: ADMINY },
  { key: "indice", path: "/indice", label: "Índice Cívico-Territorial", section: "gobernanza", icon: AnalyticsIcon, state: "preview", element: Indice, roles: INTEL },
  { key: "historial", path: "/historial", label: "Historial de ingestas", section: "gobernanza", icon: DatabaseIcon, state: "active", element: Historial, roles: ADMINY },
  { key: "reportes", path: "/reportes", label: "Reportes Ejecutivos", section: "gobernanza", icon: DatabaseIcon, state: "active", element: Reportes, roles: REPORTS },

  // Gobernanza — Admin console (role-gated, active)
  { key: "admin-dashboard", path: "/admin", label: "Consola Activistas", section: "gobernanza", icon: AnalyticsIcon, state: "active", element: AdminDashboard, roles: CONSOLE_COORD },
  { key: "admin-registros", path: "/admin/registros", label: "Registros (Admin)", section: "gobernanza", icon: VotersIcon, state: "active", element: AdminRegistros, roles: CONSOLE_COORD },
  { key: "admin-estructura", path: "/admin/estructura", label: "Estructura", section: "administracion", icon: UserIcon, state: "active", element: AdminEstructura, roles: ["superadmin", "admin", "coordinador"] },

  // Administración (role-gated, active)
  { key: "users", path: "/users", label: "Usuarios", section: "administracion", icon: UserIcon, state: "active", element: Users, roles: ADMINY },
  { key: "organization", path: "/organization", label: "Organización", section: "administracion", icon: SettingsIcon, state: "active", element: Organization, roles: ADMINY },
  { key: "configuracion", path: "/configuracion", label: "Configuración", section: "administracion", icon: SettingsIcon, state: "active", element: Configuracion, roles: ADMINY },
  { key: "organizaciones", path: "/organizaciones", label: "Organizaciones", section: "administracion", icon: ShieldIcon, state: "active", element: Organizaciones, roles: ["superadmin"] },
  { key: "campaigns", path: "/campaigns", label: "Campañas", section: "administracion", icon: AnalyticsIcon, state: "active", element: Campaigns, roles: ADMINY },
];
