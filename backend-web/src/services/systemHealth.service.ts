import mongoose from "mongoose";
import { performance } from "node:perf_hooks";
import type { Queue } from "bullmq";
import { redis } from "../config/redis";
import { pingAi } from "../plugins/aiGrpcClient";
import { inferQueue } from "../queues/infer.queue";
import { notificationQueue } from "../queues/notification.queue";
import { CameraModel } from "../models/camera.model";
import { DetectionEventModel } from "../models/detectionEvent.model";
import { getCaptureHubsSnapshot } from "../plugins/cameraStreamHub";

export type ComponentStatus = "ok" | "down";
export type WorkerStatus = "ok" | "no_workers";

export type QueueStats = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

export type SystemSnapshot = {
  ts: number;
  uptime: number;
  components: {
    mongodb: { status: ComponentStatus; latencyMs: number | null };
    redis: { status: ComponentStatus; latencyMs: number | null };
    aiGrpc: { status: ComponentStatus; latencyMs: number | null };
  };
  workers: {
    infer: { count: number; status: WorkerStatus };
    notification: { count: number; status: WorkerStatus };
  };
  queues: {
    infer: QueueStats;
    notification: QueueStats;
  };
  cameras: {
    online: number;
    offline: number;
    maintenance: number;
    processingNow: number;
  };
  captureHubs: {
    monitoring: number;
    reconnecting: number;
    longestDownMs: number | null;
  };
  events: {
    last1m: { processed: number; violations: number };
    last5m: { processed: number; violations: number };
    lastEventAt: number | null;
  };
};

export type SnapshotLite = {
  ts: number;
  processed1m: number;
  violations1m: number;
  processingNow: number;
  inferWaiting: number;
  inferActive: number;
};

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

async function probe<T>(fn: () => Promise<T>, timeoutMs: number): Promise<{ ok: boolean; latencyMs: number | null }> {
  const start = performance.now();
  try {
    await raceTimeout(fn(), timeoutMs);
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, latencyMs: null };
  }
}

async function getQueueStats(queue: Queue): Promise<QueueStats> {
  try {
    const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0
    };
  } catch {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }
}

async function getWorkerCount(queue: Queue): Promise<number> {
  try {
    const workers = await queue.getWorkers();
    return workers.length;
  } catch {
    return 0;
  }
}

// "processingNow" = cameras whose monitoring hub captured a frame in the last 60s.
// This is the most accurate live signal because the hub's throttled heartbeat
// updates lastCaptureAt on every online capture cycle.
async function getCameraCounts(): Promise<{ online: number; offline: number; maintenance: number; processingNow: number }> {
  const recentCutoff = new Date(Date.now() - 60_000);
  try {
    const [agg, processingCount] = await Promise.all([
      CameraModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      CameraModel.countDocuments({ lastCaptureAt: { $gte: recentCutoff } })
    ]);

    const counts = { online: 0, offline: 0, maintenance: 0, processingNow: processingCount };
    for (const row of agg) {
      if (row._id === "online") counts.online = row.count;
      else if (row._id === "offline") counts.offline = row.count;
      else if (row._id === "maintenance") counts.maintenance = row.count;
    }
    return counts;
  } catch {
    return { online: 0, offline: 0, maintenance: 0, processingNow: 0 };
  }
}

async function getEventThroughput(): Promise<SystemSnapshot["events"]> {
  const now = Date.now();
  const cutoff1m = new Date(now - 60_000);
  const cutoff5m = new Date(now - 5 * 60_000);

  try {
    const [processed1m, violations1m, processed5m, violations5m, lastDoc] = await Promise.all([
      DetectionEventModel.countDocuments({ detectedAt: { $gte: cutoff1m } }),
      DetectionEventModel.countDocuments({ detectedAt: { $gte: cutoff1m }, isViolation: true }),
      DetectionEventModel.countDocuments({ detectedAt: { $gte: cutoff5m } }),
      DetectionEventModel.countDocuments({ detectedAt: { $gte: cutoff5m }, isViolation: true }),
      DetectionEventModel.findOne({}, { detectedAt: 1 }).sort({ detectedAt: -1 }).lean()
    ]);

    return {
      last1m: { processed: processed1m, violations: violations1m },
      last5m: { processed: processed5m, violations: violations5m },
      lastEventAt: lastDoc?.detectedAt ? new Date(lastDoc.detectedAt).getTime() : null
    };
  } catch {
    return {
      last1m: { processed: 0, violations: 0 },
      last5m: { processed: 0, violations: 0 },
      lastEventAt: null
    };
  }
}

export async function collectSystemSnapshot(): Promise<SystemSnapshot> {
  const [mongoRes, redisRes, aiRes, inferWorkers, notificationWorkers, inferStats, notificationStats, cameras, events] = await Promise.all([
    probe(async () => {
      if (mongoose.connection.readyState !== 1) throw new Error("not connected");
      await mongoose.connection.db?.admin().ping();
    }, 3_000),
    probe(async () => {
      const pong = await redis.ping();
      if (pong !== "PONG") throw new Error("bad pong");
    }, 3_000),
    probe(() => pingAi(), 5_000),
    getWorkerCount(inferQueue),
    getWorkerCount(notificationQueue),
    getQueueStats(inferQueue),
    getQueueStats(notificationQueue),
    getCameraCounts(),
    getEventThroughput()
  ]);

  return {
    ts: Date.now(),
    uptime: Math.floor(process.uptime()),
    components: {
      mongodb: { status: mongoRes.ok ? "ok" : "down", latencyMs: mongoRes.latencyMs },
      redis: { status: redisRes.ok ? "ok" : "down", latencyMs: redisRes.latencyMs },
      aiGrpc: { status: aiRes.ok ? "ok" : "down", latencyMs: aiRes.latencyMs }
    },
    workers: {
      infer: { count: inferWorkers, status: inferWorkers > 0 ? "ok" : "no_workers" },
      notification: { count: notificationWorkers, status: notificationWorkers > 0 ? "ok" : "no_workers" }
    },
    queues: {
      infer: inferStats,
      notification: notificationStats
    },
    cameras,
    captureHubs: getCaptureHubsSnapshot(),
    events
  };
}

export function toLite(s: SystemSnapshot): SnapshotLite {
  return {
    ts: s.ts,
    processed1m: s.events.last1m.processed,
    violations1m: s.events.last1m.violations,
    processingNow: s.cameras.processingNow,
    inferWaiting: s.queues.infer.waiting,
    inferActive: s.queues.infer.active
  };
}
