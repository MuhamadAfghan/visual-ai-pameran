import { Router } from "express";
import mongoose from "mongoose";
import { sendSuccess } from "../utils/apiResponse";
import { pingAi } from "../plugins/aiGrpcClient";
import { redis } from "../config/redis";
import { inferQueue } from "../queues/infer.queue";
import { getCaptureHubsSnapshot } from "../plugins/cameraStreamHub";
import { authRouter } from "./auth.routes";
import { userRouter } from "./user.routes";
import { auditRouter } from "./audit.routes";
import { areaRouter } from "./area.routes";
import { sectionRouter } from "./section.routes";
import { cameraRouter } from "./camera.routes";
import { cameraMappingRouter, allMappingsRouter } from "./cameraMapping.routes";
import { aiModelRouter } from "./aiModel.routes";
import { picRouter } from "./pic.routes";
import { jobRouter } from "./job.routes";
import { dashboardRouter } from "./dashboard.routes";
import { eventRouter } from "./event.routes";
import { settingsRouter } from "./settings.routes";
import { roleRouter } from "./role.routes";
import { systemRouter } from "./system.routes";

export const apiRouter = Router();

function raceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms))
  ]);
}

type CheckStatus = "ok" | "down" | "no_workers" | "degraded";

function settled(r: PromiseSettledResult<CheckStatus>): CheckStatus {
  return r.status === "fulfilled" ? r.value : "down";
}

apiRouter.get("/health", async (_req, res) => {
  const [mongoRes, redisRes, aiRes, inferWorkerRes] = await Promise.allSettled([
    Promise.resolve<CheckStatus>(mongoose.connection.readyState === 1 ? "ok" : "down"),
    raceTimeout(
      redis.ping().then((p): CheckStatus => (p === "PONG" ? "ok" : "down")),
      3_000, "redis"
    ),
    raceTimeout(
      pingAi().then((): CheckStatus => "ok"),
      5_000, "ai_grpc"
    ),
    raceTimeout(
      inferQueue.getWorkers().then((ws): CheckStatus => (ws.length > 0 ? "ok" : "no_workers")),
      3_000, "infer_worker"
    )
  ]);

  const mongo        = settled(mongoRes);
  const redisStatus  = settled(redisRes);
  const aiGrpc       = settled(aiRes);
  const inferWorker  = settled(inferWorkerRes);
  const captureHubs  = getCaptureHubsSnapshot();

  // Core health: DB + Redis must be up; workers, AI, and capture hubs are informational
  const healthy = mongo === "ok" && redisStatus === "ok";

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      service: "backend-web",
      uptime: Math.floor(process.uptime()),
      mongodb: mongo,
      redis: redisStatus,
      ai_grpc: aiGrpc,
      infer_worker: inferWorker,
      capture_hubs_monitoring: captureHubs.monitoring,
      capture_hubs_reconnecting: captureHubs.reconnecting
    }
  });
});

apiRouter.get("/health/ai", async (_req, res) => {
  try {
    const status = await pingAi();
    sendSuccess(res, { ai_grpc: status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ success: false, error: "ai_unreachable", detail: msg });
  }
});

apiRouter.use("/api/v1/auth", authRouter);
apiRouter.use("/api/v1/users", userRouter);
apiRouter.use("/api/v1/audit-logs", auditRouter);
apiRouter.use("/api/v1/areas", areaRouter);
apiRouter.use("/api/v1/sections", sectionRouter);
apiRouter.use("/api/v1/cameras", cameraRouter);
apiRouter.use("/api/v1/camera-mappings", allMappingsRouter);
apiRouter.use("/api/v1/cameras/:cameraId/mappings", cameraMappingRouter);
apiRouter.use("/api/v1/ai-models", aiModelRouter);
apiRouter.use("/api/v1/pics", picRouter);
apiRouter.use("/api/v1/detection-jobs", jobRouter);
apiRouter.use("/api/v1/dashboard", dashboardRouter);
apiRouter.use("/api/v1/events", eventRouter);
apiRouter.use("/api/v1/settings", settingsRouter);
apiRouter.use("/api/v1/roles", roleRouter);
apiRouter.use("/api/v1/system", systemRouter);
