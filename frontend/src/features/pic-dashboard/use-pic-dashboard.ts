import { useQuery } from "@tanstack/react-query";
import { getDashboardStats, getPicPerformance } from "../../services/dashboard.service";
import { getCameras } from "../../services/camera.service";
import { getEvents } from "../../services/event.service";

const POLL = 30_000;
const STALE = 25_000;

export function usePicDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: getDashboardStats,
    staleTime: STALE,
    refetchInterval: POLL,
    refetchOnWindowFocus: false,
  });
}

export function usePicCameras() {
  return useQuery({
    queryKey: ["cameras", "pic"],
    queryFn: () => getCameras(),
    staleTime: STALE,
    refetchInterval: POLL,
    refetchOnWindowFocus: false,
  });
}

export function usePicRecentEvents() {
  return useQuery({
    queryKey: ["events", "pic-recent"],
    queryFn: () => getEvents({ limit: 10, status: "unacknowledged" }),
    staleTime: STALE,
    refetchInterval: POLL,
    refetchOnWindowFocus: false,
  });
}

export function usePicPerformance(days = 7) {
  return useQuery({
    queryKey: ["dashboard", "pic-performance", days],
    queryFn: () => getPicPerformance(days),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
  });
}
