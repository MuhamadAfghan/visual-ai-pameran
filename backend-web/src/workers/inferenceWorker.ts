import { Worker } from "bullmq";
import pino from "pino";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { DetectionJobModel } from "../models/job.model";
import { inferViaGrpc, type InferRequest } from "../plugins/aiGrpcClient";
import type { InferJobPayload } from "../queues/infer.queue";

const logger = pino({ name: "inference-worker" });

function buildRequest(payload: InferJobPayload): InferRequest {
  if (!payload.imageUri && !payload.imageBase64) {
    throw new Error("inference job must include imageUri or imageBase64");
  }
  return {
    camera_id: payload.cameraId,
    frame_id: payload.frameId ?? `frame-${Date.now()}`,
    timestamp_utc: payload.capturedAt ?? new Date().toISOString(),
    image_uri: payload.imageUri,
    image_base64: payload.imageBase64,
    selected_checks: payload.selectedChecks,
    thresholds: payload.thresholds,
    rules: payload.rules,
    metadata_json: payload.metadata ? JSON.stringify(payload.metadata) : undefined
  };
}

export function registerInferenceWorker(): Worker<InferJobPayload> {
  const worker = new Worker<InferJobPayload>(
    env.INFER_QUEUE_NAME,
    async (job) => {
      const { jobId } = job.data;
      await DetectionJobModel.findByIdAndUpdate(jobId, { status: "processing" });

      try {
        const result = await inferViaGrpc(buildRequest(job.data));
        await DetectionJobModel.findByIdAndUpdate(jobId, { status: "done", result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        await DetectionJobModel.findByIdAndUpdate(jobId, { status: "failed", error: message });
        throw error;
      }
    },
    { connection: redis, concurrency: 5 }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "Inference job failed");
  });

  worker.on("error", (err) => {
    logger.error({ err: err.message }, "Worker error");
  });

  logger.info("Inference worker registered");
  return worker;
}
