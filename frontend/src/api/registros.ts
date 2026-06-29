import { apiClient } from "./client";

export interface Registro {
  id: string;
  nombre_completo: string;
  seccion: string | null;
  direccion: string | null;
  colonia: string | null;
  telefono: string | null;
  area: string | null;
  clave_masked: string | null;
  consentimiento: boolean;
  created_at: string;
}

export interface RegistroList {
  items: Registro[];
  total: number;
  limit: number;
  offset: number;
}

export interface RegistroCreate {
  nombre_completo: string;
  seccion?: string;
  direccion?: string;
  colonia?: string;
  telefono?: string;
  area?: string;
  clave_elector?: string;
  consentimiento: boolean;
  client_uuid?: string;
}

export interface Perfil {
  id: string;
  full_name: string;
  role: string;
  seccion: string | null;
  lider_id: string | null;
  lider_nombre: string | null;
  organization_id: string | null;
}

export async function getPerfil(): Promise<Perfil> {
  const { data } = await apiClient.get<Perfil>("/perfil");
  return data;
}

export async function listMisRegistros(q?: string): Promise<RegistroList> {
  const { data } = await apiClient.get<RegistroList>("/registros/mios", {
    params: q ? { q } : {},
  });
  return data;
}

export async function createRegistro(payload: RegistroCreate): Promise<Registro> {
  const { data } = await apiClient.post<Registro>("/registros", payload);
  return data;
}

export async function deleteRegistro(id: string): Promise<void> {
  await apiClient.delete(`/registros/${id}`);
}
