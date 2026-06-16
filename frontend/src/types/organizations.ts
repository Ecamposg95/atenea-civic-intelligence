import type { Paginated } from "./auth";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type OrganizationsResponse = Paginated<Organization>;

export interface OrgCreatePayload {
  name: string;
  slug: string;
}

export interface OrgUpdatePayload {
  name?: string;
  slug?: string;
  is_active?: boolean;
}
