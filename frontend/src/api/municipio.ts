import { apiClient } from "./client";

export interface HistoricoElectoral {
  anio: number;
  lista_nominal: number | null;
  votos_totales: number | null;
  participacion: number | null;
  margen_votos: number | null;
  margen_pp: number | null;
}

export interface VotoPartido {
  partido: string;
  votos: number;
}

export interface SeccionRow {
  seccion: string;
  lista_nominal: number;
  votos: number;
  participacion: number;
  coalicion: number;
  morena: number;
  margen: number;
  prioridad: string;
}

export interface SeccionesResumen {
  total: number;
  morena: number | null;
  coalicion: number | null;
  persuadibles: number | null;
  participacion_prom: number | null;
  casillas: number | null;
  votos_2024: number | null;
  margen_2024: number | null;
  margen_pp_2024: number | null;
  participacion_2024: number | null;
}

export interface MunicipioPanorama {
  municipio: { code: string; name: string };
  socio: Record<string, number>;
  historico: HistoricoElectoral[];
  voto2024: VotoPartido[];
  coalicion_ganadora_votos: number | null;
  secciones_resumen: SeccionesResumen;
  secciones: SeccionRow[];
}

export async function getMunicipioPanorama(code: string): Promise<MunicipioPanorama> {
  return (await apiClient.get(`/municipio/${code}/panorama`)).data;
}
