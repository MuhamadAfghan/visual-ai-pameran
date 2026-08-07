import { apiClient, unwrap } from "./api-client";

export type DetectionJob = {
  _id: string;
  cameraId: string;
  selectedChecks: string[];
  status: "queued" | "processing" | "done" | "failed";
  result: unknown;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QueueCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

export type QueueStats = {
  infer: QueueCounts;
  notification: QueueCounts;
};

export type DetectionJobsPage = {
  items: DetectionJob[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export async function getDetectionJobs(page = 1, limit = 50): Promise<DetectionJobsPage> {
  const res = await apiClient.get<{ success: boolean; data: DetectionJobsPage }>(
    `/detection-jobs?page=${page}&limit=${limit}`
  );
  return unwrap(res);
}

export async function getQueueStats(): Promise<QueueStats> {
  const res = await apiClient.get<{ success: boolean; data: QueueStats }>("/detection-jobs/queue/stats");
  return unwrap(res);
}
