import { apiClient } from "./client";
import type { Campaign } from "@/store/campaignStore";

export interface Contest {
  id: string;
  cargo_id: string;
  territory_id?: string | null;
  election_date?: string | null;
}

export interface Cargo {
  id: string;
  key: string;
  label: string;
}

export interface CampaignCreatePayload {
  name: string;
  cycle: string;
}

export interface ContestCreatePayload {
  cargo_id: string;
  territory_id?: string;
  election_date?: string;
}

export async function listMyCampaigns(): Promise<Campaign[]> {
  const { data } = await apiClient.get<Campaign[]>("/campaigns/mine");
  return data;
}

export async function createCampaign(
  payload: CampaignCreatePayload,
): Promise<Campaign> {
  const { data } = await apiClient.post<Campaign>("/campaigns", payload);
  return data;
}

export async function getCampaignContests(id: string): Promise<Contest[]> {
  const { data } = await apiClient.get<Contest[]>(`/campaigns/${id}/contests`);
  return data;
}

export async function createContest(
  campaignId: string,
  payload: ContestCreatePayload,
): Promise<Contest> {
  const { data } = await apiClient.post<Contest>(
    `/campaigns/${campaignId}/contests`,
    payload,
  );
  return data;
}

export async function listCargos(): Promise<Cargo[]> {
  const { data } = await apiClient.get<Cargo[]>("/catalogs/cargos");
  return data;
}
