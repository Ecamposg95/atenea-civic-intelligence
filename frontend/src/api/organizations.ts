import { apiClient } from "./client";
import type {
  Organization,
  OrganizationsResponse,
  OrgCreatePayload,
  OrgUpdatePayload,
} from "@/types/organizations";

export async function listOrganizations(): Promise<OrganizationsResponse> {
  const { data } = await apiClient.get<OrganizationsResponse>("/organizations", {
    params: { limit: 50, offset: 0 },
  });
  return data;
}

export async function getMyOrganization(): Promise<Organization | null> {
  // Non-superadmins receive only their own org; superadmins receive all.
  const res = await listOrganizations();
  return res.items[0] ?? null;
}

export async function createOrganization(
  payload: OrgCreatePayload,
): Promise<Organization> {
  const { data } = await apiClient.post<Organization>("/organizations", payload);
  return data;
}

export async function updateOrganization(
  id: string,
  payload: OrgUpdatePayload,
): Promise<Organization> {
  const { data } = await apiClient.patch<Organization>(
    `/organizations/${id}`,
    payload,
  );
  return data;
}
