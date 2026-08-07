import { apiClient, unwrap } from "./api-client";
import type { Section } from "../types/section.types";

export type SectionPayload = {
  areaId?: string;
  code?: string;
  name?: string;
  description?: string;
  isActive?: boolean;
  location?: { lat: number; lng: number } | null;
};

export async function getSections(params?: { areaId?: string; isActive?: boolean }): Promise<Section[]> {
  const q = new URLSearchParams();
  if (params?.areaId) q.set("areaId", params.areaId);
  if (params?.isActive !== undefined) q.set("isActive", String(params.isActive));
  const res = await apiClient.get<{ success: boolean; data: Section[] }>(`/sections?${q}`);
  return unwrap(res);
}

export async function createSection(payload: SectionPayload): Promise<Section> {
  const res = await apiClient.post<{ success: boolean; data: Section }>("/sections", payload);
  return unwrap(res);
}

export async function updateSection(id: string, payload: SectionPayload): Promise<Section> {
  const res = await apiClient.put<{ success: boolean; data: Section }>(`/sections/${id}`, payload);
  return unwrap(res);
}

export async function deleteSection(id: string): Promise<void> {
  await apiClient.delete(`/sections/${id}`);
}
