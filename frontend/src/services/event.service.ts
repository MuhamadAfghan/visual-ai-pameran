import { apiClient, unwrap } from "./api-client";
import type { DetectionEvent, PaginatedResponse } from "../types/event.types";

export type EventFilters = {
  cameraId?: string;
  aiModelId?: string;
  status?: string;
  isViolation?: boolean;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

export async function getEvents(
  filters?: EventFilters
): Promise<PaginatedResponse<DetectionEvent>> {
  const q = new URLSearchParams();
  if (filters?.cameraId) q.set("cameraId", filters.cameraId);
  if (filters?.aiModelId) q.set("aiModelId", filters.aiModelId);
  if (filters?.status) q.set("status", filters.status);
  if (filters?.isViolation !== undefined) q.set("isViolation", String(filters.isViolation));
  if (filters?.from) q.set("from", filters.from);
  if (filters?.to) q.set("to", filters.to);
  if (filters?.page) q.set("page", String(filters.page));
  if (filters?.limit) q.set("limit", String(filters.limit));
  const res = await apiClient.get<{ success: boolean; data: PaginatedResponse<DetectionEvent> }>(
    `/events?${q}`
  );
  return unwrap(res);
}

export async function getEventById(id: string): Promise<DetectionEvent> {
  const res = await apiClient.get<{ success: boolean; data: DetectionEvent }>(`/events/${id}`);
  return unwrap(res);
}

export async function acknowledgeEvent(id: string): Promise<void> {
  await apiClient.patch(`/events/${id}/acknowledge`);
}

export async function acknowledgeAllEvents(): Promise<{ acknowledged: number }> {
  const res = await apiClient.post<{ success: boolean; data: { acknowledged: number } }>(
    "/events/acknowledge-all"
  );
  return unwrap(res);
}

export async function markFalsePositive(id: string): Promise<void> {
  await apiClient.patch(`/events/${id}/false-positive`);
}

export async function deleteEvent(id: string): Promise<void> {
  await apiClient.delete(`/events/${id}`);
}

export async function exportEvents(
  filters?: Omit<EventFilters, "page" | "limit">
): Promise<void> {
  const q = new URLSearchParams();
  if (filters?.cameraId) q.set("cameraId", filters.cameraId);
  if (filters?.aiModelId) q.set("aiModelId", filters.aiModelId);
  if (filters?.status) q.set("status", filters.status);
  if (filters?.isViolation !== undefined) q.set("isViolation", String(filters.isViolation));
  if (filters?.from) q.set("from", filters.from);
  if (filters?.to) q.set("to", filters.to);
  const res = await apiClient.get(`/events/export?${q}`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `events_${Date.now()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
