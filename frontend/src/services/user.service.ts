import { apiClient, unwrap } from "./api-client";
import type { User } from "../types/user.types";
import type { UserRole } from "../types/auth.types";

export type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  roleId?: string;
  isActive?: boolean;
};

export type UpdateUserPayload = {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  roleId?: string | null;
  isActive?: boolean;
};

export async function getUsers(): Promise<User[]> {
  const res = await apiClient.get<{ success: boolean; data: User[] }>("/users");
  return unwrap(res);
}

export async function getUserById(id: string): Promise<User> {
  const res = await apiClient.get<{ success: boolean; data: User }>(`/users/${id}`);
  return unwrap(res);
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const res = await apiClient.post<{ success: boolean; data: User }>("/users", payload);
  return unwrap(res);
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<User> {
  const res = await apiClient.patch<{ success: boolean; data: User }>(`/users/${id}`, payload);
  return unwrap(res);
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/users/${id}`);
}

export async function toggleUserActivation(id: string, isActive: boolean): Promise<User> {
  const res = await apiClient.patch<{ success: boolean; data: User }>(
    `/users/${id}/activation`,
    { isActive }
  );
  return unwrap(res);
}
