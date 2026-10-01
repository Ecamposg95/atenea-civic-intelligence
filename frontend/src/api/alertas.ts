import { apiClient } from "./client";

export type Severidad = "critica" | "alta" | "media";
export type Categoria = "territorial" | "operativa";

export interface Alerta {
  clave: string;
  regla: string;
  categoria: Categoria;
  severidad: Severidad;
  titulo: string;
  detalle: string;
  seccion: string | null;
  valor: number | null;
  umbral: number | null;
  enlace: string;
}

export interface SeccionSeveridad {
  seccion: string;
  severidad_max: Severidad | null;
}

export interface AlertasResponse {
  resumen: {
    critica: number;
    alta: number;
    media: number;
    territorial: number;
    operativa: number;
    secciones_afectadas: number;
    secciones_total: number;
  };
  secciones: SeccionSeveridad[];
  items: Alerta[];
  evaluado_en: string;
}

export async function getAlertas(): Promise<AlertasResponse> {
  return (await apiClient.get("/alertas")).data;
}
