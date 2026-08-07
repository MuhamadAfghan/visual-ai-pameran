import { apiClient, unwrap } from "./api-client";
import type { Area } from "../types/area.types";

export type AreaPayload = {
  code?: string;
  name?: string;
  description?: string;
  location?: { lat: number; lng: number } | null;
  isActive?: boolean;
};

export async function getAreas(params?: { isActive?: boolean }): Promise<Area[]> {
  const q = new URLSearchParams();
  if (params?.isActive !== undefined) q.set("isActive", String(params.isActive));
  const res = await apiClient.get<{ success: boolean; data: Area[] }>(`/areas?${q}`);
  return unwrap(res);
}

export async function createArea(payload: AreaPayload): Promise<Area> {
  const res = await apiClient.post<{ success: boolean; data: Area }>("/areas", payload);
  return unwrap(res);
}

export async function updateArea(id: string, payload: AreaPayload): Promise<Area> {
  const res = await apiClient.put<{ success: boolean; data: Area }>(`/areas/${id}`, payload);
  return unwrap(res);
}

export async function deleteArea(id: string): Promise<void> {
  await apiClient.delete(`/areas/${id}`);
}
