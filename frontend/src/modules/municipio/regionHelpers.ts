import type { Campaign } from "@/store/campaignStore";

export interface RegionMunicipio {
  code: string;
  name: string;
  es_campana: boolean;
  lista_nominal_2024?: number | null;
  participacion_2024?: number | null;
  margen_votos_2024?: number | null;
  margen_pp_2024?: number | null;
  secciones_total?: number | null;
  secciones_persuadibles?: number | null;
  poblacion?: number | null;
}

export interface RegionOut {
  region: string;
  municipios: RegionMunicipio[];
}

/** Municipio seleccionado por defecto: el de la campaña; si no, el marcado es_campana; si no, el primero. */
export function pickDefaultCode(region: RegionOut, campaignCode: string | null | undefined): string | null {
  if (campaignCode && region.municipios.some((m) => m.code === campaignCode)) return campaignCode;
  const flagged = region.municipios.find((m) => m.es_campana);
  return flagged?.code ?? region.municipios[0]?.code ?? null;
}

/** "Campaña · Candidato (Partido)" — null cuando la campaña no tiene candidato. */
export function campaignSubtitle(c: Campaign | undefined): string | null {
  if (!c?.candidato) return null;
  return c.partido ? `${c.name} · ${c.candidato} (${c.partido})` : `${c.name} · ${c.candidato}`;
}
