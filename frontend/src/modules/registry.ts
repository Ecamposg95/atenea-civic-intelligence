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

export const MODULES: ModuleDef[] = [
  // Plataforma (active)
  { key: "dashboard", path: "/", label: "Command Center", section: "plataforma", icon: DashboardIcon, state: "active", element: Dashboard, end: true },
  { key: "maps", path: "/maps", label: "Map Explorer", section: "plataforma", icon: MapIcon, state: "active", element: MapExplorer },
  { key: "analytics", path: "/analytics", label: "Activity Analytics", section: "plataforma", icon: AnalyticsIcon, state: "active", element: Analytics },
  { key: "sources", path: "/sources", label: "Fuentes de datos", section: "plataforma", icon: DatabaseIcon, state: "active", element: Sources },

  // Inteligencia Electoral
  { key: "resultados", path: "/resultados", label: "Resultados Electorales", section: "inteligencia", icon: AnalyticsIcon, state: "preview", element: Resultados },
  { key: "padron", path: "/padron", label: "Padrón / Lista Nominal", section: "inteligencia", icon: VotersIcon, state: "preview", element: Padron },
  {
    key: "candidaturas", path: "/candidaturas", label: "Candidaturas", section: "inteligencia", icon: UserIcon, state: "soon",
    soon: {
      summary: "Registro y seguimiento de candidaturas por cargo, partido y territorio.",
      features: ["Directorio de candidaturas por elección", "Filtros por partido, cargo y entidad", "Fichas con trayectoria y vínculos"],
      dataSource: "Candidaturas MX (apielectoral.mx) — ya integrada en el backend.",
    },
  },
  { key: "territorios", path: "/territorios", label: "Territorios & Secciones", section: "inteligencia", icon: LayersIcon, state: "active", element: Territorios },

  // Ciudadanía
  { key: "ai-analyst", path: "/ai-analyst", label: "AI Analyst / Copiloto", section: "ciudadania", icon: AiIcon, state: "preview", element: AiAnalyst },
  {
    key: "sentimiento", path: "/sentimiento", label: "Sentimiento Ciudadano", section: "ciudadania", icon: AnalyticsIcon, state: "soon",
    soon: {
      summary: "Escucha social y de medios sobre temas y actores cívicos.",
      features: ["Tendencias de conversación", "Análisis de sentimiento por tema", "Alertas de picos de actividad"],
      dataSource: "APIs de redes/medios (pendiente de contratar).",
    },
  },
  {
    key: "participacion", path: "/participacion", label: "Participación Ciudadana", section: "ciudadania", icon: VotersIcon, state: "soon",
    soon: {
      summary: "Consultas, peticiones y encuestas ciudadanas gobernadas.",
      features: ["Consultas y peticiones", "Encuestas con resultados auditables", "Tablero de participación"],
      dataSource: "Módulo propio de captación (por construir).",
    },
  },
  {
    key: "riesgo", path: "/riesgo", label: "Alertas & Riesgo Electoral", section: "ciudadania", icon: AlertIcon, state: "soon",
    soon: {
      summary: "Detección de anomalías y monitoreo de riesgo en territorio.",
      features: ["Anomalías estadísticas en resultados", "Mapa de zonas de riesgo", "Alertas configurables"],
      dataSource: "Modelos sobre PREP/cómputos + señales territoriales.",
    },
  },

  // Gobernanza
  { key: "auditoria", path: "/auditoria", label: "Auditoría & Cumplimiento", section: "gobernanza", icon: ShieldIcon, state: "active", element: Auditoria, roles: ["superadmin", "admin"] },
  {
    key: "reportes", path: "/reportes", label: "Reportes Ejecutivos", section: "gobernanza", icon: DatabaseIcon, state: "soon",
    soon: {
      summary: "Briefings ejecutivos generados y exportables (PDF/CSV).",
      features: ["Plantillas de briefing", "Exportación programada", "Distribución por rol"],
      dataSource: "Composición sobre módulos activos de la plataforma.",
    },
  },

  // Administración (role-gated, active)
  { key: "users", path: "/users", label: "Usuarios", section: "administracion", icon: UserIcon, state: "active", element: Users, roles: ["superadmin", "admin"] },
  { key: "organization", path: "/organization", label: "Organización", section: "administracion", icon: SettingsIcon, state: "active", element: Organization, roles: ["superadmin", "admin"] },
];
