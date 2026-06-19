import { apiClient } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type IngestStatus = "running" | "success" | "partial" | "failed";

export interface IngestRun {
  id: string;
  dataset: string;
  file_name: string;
  status: IngestStatus;
  rows_read: number | null;
  rows_inserted: number | null;
  rows_skipped: number | null;
  rows_failed: number | null;
  error_summary: string | null;
  started_at: string;
  finished_at: string | null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function listIngestRuns(): Promise<IngestRun[]> {
  const { data } = await apiClient.get<IngestRun[]>("/ingest/runs");
  return data;
}

export async function getIngestRun(id: string): Promise<IngestRun> {
  const { data } = await apiClient.get<IngestRun>(`/ingest/runs/${id}`);
  return data;
}

export async function listIngestDatasets(): Promise<string[]> {
  const { data } = await apiClient.get<string[]>("/ingest/datasets");
  return data;
}

export async function uploadIngest(
  dataset: string,
  file: File,
  params: { anio?: number } = {},
): Promise<IngestRun> {
  const form = new FormData();
  form.append("file", file);

  const queryParams: Record<string, string> = {};
  if (params.anio !== undefined) {
    queryParams.anio = String(params.anio);
  }

  const { data } = await apiClient.post<IngestRun>(
    `/ingest/${dataset}`,
    form,
    { params: queryParams },
  );
  return data;
}
