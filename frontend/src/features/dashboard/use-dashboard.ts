import { useQuery } from "@tanstack/react-query";
import {
  getDashboardStats,
  getDashboardTrend,
  getDashboardByType,
  getDashboardByCamera
} from "../../services/dashboard.service";
import { getCameras, getCameraById } from "../../services/camera.service";
import { getEvents } from "../../services/event.service";

const POLL = 30_000;
const STALE = 25_000;

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: getDashboardStats,
    staleTime: STALE,
    refetchInterval: POLL,
    refetchOnWindowFocus: false
  });
}

export function useDashboardTrend(days = 7) {
  return useQuery({
    queryKey: ["dashboard", "trend", days],
    queryFn: () => getDashboardTrend(days),
    staleTime: STALE,
    refetchInterval: POLL,
    refetchOnWindowFocus: false
  });
}

export function useDashboardByType(days?: number) {
  return useQuery({
    queryKey: ["dashboard", "by-type", days],
    queryFn: () => getDashboardByType(days),
    staleTime: STALE,
    refetchInterval: POLL,
    refetchOnWindowFocus: false
  });
}

export function useDashboardByCamera(days?: number) {
  return useQuery({
    queryKey: ["dashboard", "by-camera", days],
    queryFn: () => getDashboardByCamera(days),
    staleTime: STALE,
    refetchInterval: POLL,
    refetchOnWindowFocus: false
  });
}

export function useCameraList() {
  return useQuery({
    queryKey: ["cameras"],
    queryFn: () => getCameras({ isActive: true }),
    staleTime: STALE,
    refetchInterval: POLL,
    refetchOnWindowFocus: false
  });
}

export function useCameraDetail(id: string | null) {
  return useQuery({
    queryKey: ["camera", id],
    queryFn: () => getCameraById(id!),
    enabled: !!id,
    staleTime: STALE
  });
}

export function useRecentAlerts() {
  return useQuery({
    queryKey: ["events", { limit: 20, isViolation: true }],
    queryFn: () => getEvents({ limit: 20, isViolation: true }),
    staleTime: STALE,
    refetchInterval: POLL,
    refetchOnWindowFocus: false
  });
}

export function useCameraEvents(cameraId: string | null) {
  return useQuery({
    queryKey: ["events", { cameraId, limit: 20 }],
    queryFn: () => getEvents({ cameraId: cameraId!, limit: 20 }),
    enabled: !!cameraId,
    staleTime: STALE,
    refetchInterval: POLL,
    refetchOnWindowFocus: false
  });
}
