import { apiClient } from "./client";
import type { AreasResponse } from "@/types/maps";

export async function getAreas(level?: string): Promise<AreasResponse> {
  const { data } = await apiClient.get<AreasResponse>("/maps/areas", {
    params: level ? { level } : undefined,
  });
  return data;
}
