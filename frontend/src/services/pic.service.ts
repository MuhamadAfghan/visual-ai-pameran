import { apiClient, unwrap } from "./api-client";
import type { Pic } from "../types/pic.types";

export type PicPayload = {
  name?: string;
  email?: string;
  subscribedChecks?: string[];
  isActive?: boolean;
};

export async function getPics(): Promise<Pic[]> {
  const res = await apiClient.get<{ success: boolean; data: Pic[] }>("/pics");
  return unwrap(res);
}

export async function getPicById(id: string): Promise<Pic> {
  const res = await apiClient.get<{ success: boolean; data: Pic }>(`/pics/${id}`);
  return unwrap(res);
}

export async function createPic(payload: PicPayload): Promise<Pic & { plainPassword?: string }> {
  const res = await apiClient.post<{ success: boolean; data: Pic & { plainPassword?: string } }>("/pics", payload);
  return unwrap(res);
}

export async function resetPicPassword(id: string): Promise<{ plainPassword: string }> {
  const res = await apiClient.post<{ success: boolean; data: { plainPassword: string } }>(
    `/pics/${id}/reset-password`
  );
  return unwrap(res);
}

export async function updatePic(id: string, payload: PicPayload): Promise<Pic> {
  const res = await apiClient.put<{ success: boolean; data: Pic }>(`/pics/${id}`, payload);
  return unwrap(res);
}

export async function deletePic(id: string): Promise<void> {
  await apiClient.delete(`/pics/${id}`);
}
