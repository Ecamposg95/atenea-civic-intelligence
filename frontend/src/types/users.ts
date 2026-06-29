import type { User, UserRole } from "./auth";

export interface ListUsersParams {
  q?: string;
  role?: UserRole | "";
  is_active?: boolean;
  include_deleted?: boolean;
  sort?: "created_at" | "full_name" | "email" | "role";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface UserCreatePayload {
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string | null;
  password?: string | null;
  lider_id?: string | null;
  seccion?: string | null;
}

export interface UserUpdatePayload {
  full_name?: string;
  role?: UserRole;
  phone?: string | null;
  is_active?: boolean;
  lider_id?: string | null;
  seccion?: string | null;
}

export interface UserCreatedResponse {
  user: User;
  temporary_password: string | null;
}

export interface PasswordResetResult {
  user_id: string;
  temporary_password: string;
}
