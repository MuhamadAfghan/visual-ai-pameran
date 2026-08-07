import { apiClient, unwrap } from "./api-client";
import type { Role } from "../types/role.types";
import type { ModulePermission } from "../types/auth.types";

export type CreateRolePayload = {
  name: string;
  description?: string;
  permissions: ModulePermission[];
};

export type UpdateRolePayload = Partial<CreateRolePayload>;

export async function getRolesApi(): Promise<Role[]> {
  const res = await apiClient.get<{ success: boolean; data: Role[] }>("/roles");
  return unwrap(res);
}

export async function getRoleByIdApi(id: string): Promise<Role> {
  const res = await apiClient.get<{ success: boolean; data: Role }>(`/roles/${id}`);
  return unwrap(res);
}

export async function createRoleApi(payload: CreateRolePayload): Promise<Role> {
  const res = await apiClient.post<{ success: boolean; data: Role }>("/roles", payload);
  return unwrap(res);
}

export async function updateRoleApi(id: string, payload: UpdateRolePayload): Promise<Role> {
  const res = await apiClient.put<{ success: boolean; data: Role }>(`/roles/${id}`, payload);
  return unwrap(res);
}

export async function deleteRoleApi(id: string): Promise<void> {
  await apiClient.delete(`/roles/${id}`);
}
