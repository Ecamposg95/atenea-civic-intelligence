import { apiClient } from "./client";

/** Paper structure Líder → Activistas → Promovidos — `GET /captura/estructura`.
 * Mirrors `EstructuraPage` in backend/app/schemas/captura_sma.py. Names,
 * secciones and counts only (never clave/CURP). */

export interface EstructuraPersona {
  id: string;
  nombre_completo: string;
  seccion: string | null;
}

export interface EstructuraActivista extends EstructuraPersona {
  promovidos: EstructuraPersona[];
}

export interface EstructuraLider extends EstructuraPersona {
  activistas: EstructuraActivista[];
  total_promovidos: number;
  familias_completas: number;
}

export interface EstructuraResumen {
  lideres: number;
  activistas: number;
  promovidos: number;
  familias_completas: number;
  lideres_completos: number;
}

export interface EstructuraPage {
  items: EstructuraLider[];
  total: number;
  limit: number;
  offset: number;
  meta_activistas: number;
  meta_promovidos: number;
  resumen: EstructuraResumen;
}

export interface EstructuraFiltros {
  q?: string;
  seccion?: string;
  limit?: number;
  offset?: number;
}

const RESUMEN_VACIO: EstructuraResumen = {
  lideres: 0, activistas: 0, promovidos: 0, familias_completas: 0, lideres_completos: 0,
};

export async function getEstructura(f: EstructuraFiltros = {}): Promise<EstructuraPage> {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") params[k] = v;
  const { data } = await apiClient.get<EstructuraPage>("/captura/estructura", { params });
  // Defensive: a partial payload never crashes the tree.
  return {
    ...data,
    items: (data.items ?? []).map((l) => ({
      ...l,
      activistas: (l.activistas ?? []).map((a) => ({ ...a, promovidos: a.promovidos ?? [] })),
    })),
    meta_activistas: data.meta_activistas || 10,
    meta_promovidos: data.meta_promovidos || 7,
    resumen: data.resumen ?? RESUMEN_VACIO,
  };
}
