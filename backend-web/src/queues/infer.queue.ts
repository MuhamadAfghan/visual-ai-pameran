import { Queue } from "bullmq";
import { env } from "../config/env";
import { redis } from "../config/redis";
import type { CameraRules } from "../plugins/aiGrpcClient";

export type InferJobPayload = {
  jobId: string;
  cameraId: string;
  frameId?: string;
  capturedAt?: string;
  imageUri?: string;
  imageBase64?: string;
  selectedChecks: string[];
  thresholds?: { conf: number; iou: number };
  rules?: CameraRules;
  metadata?: Record<string, unknown>;
};

export const inferQueue = new Queue<InferJobPayload>(env.INFER_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});
