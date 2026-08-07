import { DetectionJobModel } from "../models/job.model";
import { inferQueue } from "../queues/infer.queue";
import { notificationQueue } from "../queues/notification.queue";

export async function findDetectionJobById(id: string) {
  return DetectionJobModel.findById(id);
}

export async function listDetectionJobs({ page = 1, limit = 50 }: { page?: number; limit?: number } = {}) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    DetectionJobModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    DetectionJobModel.countDocuments()
  ]);
  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export type CreateDetectionJobInput = {
  cameraId: string;
  selectedChecks: string[];
  frameId?: string;
  capturedAt?: string;
  imageUri?: string;
  imageBase64?: string;
  thresholds?: { conf: number; iou: number };
  metadata?: Record<string, unknown>;
};

export async function createAndQueueDetectionJob(input: CreateDetectionJobInput) {
  const detectionJob = await DetectionJobModel.create({
    cameraId: input.cameraId,
    selectedChecks: input.selectedChecks
  });

  await inferQueue.add("infer", {
    jobId: detectionJob.id,
    cameraId: detectionJob.cameraId,
    selectedChecks: detectionJob.selectedChecks,
    frameId: input.frameId,
    capturedAt: input.capturedAt,
    imageUri: input.imageUri,
    imageBase64: input.imageBase64,
    thresholds: input.thresholds,
    metadata: input.metadata
  });

  return detectionJob;
}

export async function getQueueStats() {
  const [inferCounts, notifCounts] = await Promise.all([
    inferQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
    notificationQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed")
  ]);

  return {
    infer: inferCounts,
    notification: notifCounts
  };
}
