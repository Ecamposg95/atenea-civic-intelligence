export interface SourceInfo {
  id: string;
  name: string;
  kind: "api" | "wms" | "download" | "portal";
  base_url: string;
  formats: string[];
  auth_required: boolean;
  notes: string;
}

export interface DatasetSummary {
  id: string;
  title: string;
  organization: string | null;
  formats: string[];
  url: string | null;
}
