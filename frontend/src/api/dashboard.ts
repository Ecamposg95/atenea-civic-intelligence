import { apiClient } from "./client";

export interface ExecutiveDashboardPromovidos {
  total: number;
  meta: number | null;
  pct: number | null;
}

export interface ExecutiveDashboardAfiliados {
  total: number;
  validados: number;
  meta: number | null;
}

export interface ExecutiveDashboardCasos {
  total: number;
  abiertos: number;
  sla_vencidos: number;
}

export interface ExecutiveDashboardCobertura {
  secciones: number;
  en_riesgo: number;
  al_dia: number;
  pct_global: number | null;
}

export interface ExecutiveDashboardTendenciaPoint {
  semana: string;
  promovidos: number;
}

export interface ExecutiveDashboardSeccionTop {
  seccion: string;
  promovidos: number;
}

export interface ExecutiveDashboardCasoEstado {
  estado: string;
  n: number;
}

export interface ExecutiveDashboardAlerta {
  seccion: string;
  faltan: number;
}

export interface ExecutiveDashboard {
  election_date: string | null;
  promovidos: ExecutiveDashboardPromovidos;
  afiliados: ExecutiveDashboardAfiliados;
  casos: ExecutiveDashboardCasos;
  cobertura: ExecutiveDashboardCobertura;
  tendencia: ExecutiveDashboardTendenciaPoint[];
  por_seccion_top: ExecutiveDashboardSeccionTop[];
  casos_por_estado: ExecutiveDashboardCasoEstado[];
  alertas: ExecutiveDashboardAlerta[];
}

/** Campaign-scoped executive briefing (coordinador+). */
export async function getExecutiveDashboard(): Promise<ExecutiveDashboard> {
  const { data } = await apiClient.get<ExecutiveDashboard>("/dashboard/executive");
  return data;
}
