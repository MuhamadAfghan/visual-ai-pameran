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

export type QueueName = "infer" | "notification";

export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  id: string;
  ts: number;
  level: LogLevel;
  source: "system" | "http" | "capture";
  msg: string;
  meta?: Record<string, unknown>;
};
