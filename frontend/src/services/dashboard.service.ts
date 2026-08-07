import { apiClient, unwrap } from "./api-client";
import type { DashboardStats, TrendData, ByTypeData, ByCameraData, PicPerformance } from "../types/dashboard.types";

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await apiClient.get<{ success: boolean; data: DashboardStats }>("/dashboard/stats");
  return unwrap(res);
}

export async function getDashboardTrend(days = 7): Promise<TrendData> {
  const res = await apiClient.get<{ success: boolean; data: TrendData }>(
    `/dashboard/trend?days=${days}`
  );
  return unwrap(res);
}

export async function getDashboardByType(days?: number): Promise<ByTypeData> {
  const q = days ? `?days=${days}` : "";
  const res = await apiClient.get<{ success: boolean; data: ByTypeData }>(`/dashboard/by-type${q}`);
  return unwrap(res);
}

export async function getDashboardByCamera(days?: number): Promise<ByCameraData> {
  const q = days ? `?days=${days}` : "";
  const res = await apiClient.get<{ success: boolean; data: ByCameraData }>(
    `/dashboard/by-camera${q}`
  );
  return unwrap(res);
}

export async function getPicPerformance(days = 7): Promise<PicPerformance> {
  const res = await apiClient.get<{ success: boolean; data: PicPerformance }>(
    `/dashboard/pic/performance?days=${days}`
  );
  return unwrap(res);
}
