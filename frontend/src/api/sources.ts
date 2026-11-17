import { apiClient } from "./client";
import type {
  DatasetSummary,
  SourceInfo,
} from "@/types/sources";

export async function getSources(): Promise<SourceInfo[]> {
  const { data } = await apiClient.get<SourceInfo[]>("/sources");
  return data;
}

export async function searchDatasets(
  q: string,
  ineOnly = true,
): Promise<DatasetSummary[]> {
  const { data } = await apiClient.get<DatasetSummary[]>("/sources/datasets", {
    params: { q, ine_only: ineOnly, rows: 20 },
  });
  return data;
}
