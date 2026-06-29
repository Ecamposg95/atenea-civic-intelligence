export type UserRole = "superadmin" | "admin" | "analyst" | "viewer" | "lider" | "activista";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  organization_id: string | null;
  is_active: boolean;
  phone?: string | null;
  must_change_password?: boolean;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export type UsersResponse = Paginated<User>;
