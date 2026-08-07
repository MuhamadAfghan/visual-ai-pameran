import { EventEmitter } from "node:events";
import type { Request, Response, NextFunction } from "express";
import { collectSystemSnapshot, toLite, type SnapshotLite, type SystemSnapshot } from "../services/systemHealth.service";
import { publishLog, logEmitter, logHistory, type LogEntry } from "../plugins/logStream";
import { sendSuccess } from "../utils/apiResponse";

const TICK_MS = 3_000;
const HISTORY_SIZE = 60;

const systemEmitter = new EventEmitter();
systemEmitter.setMaxListeners(200);

let lastSnapshot: SystemSnapshot | null = null;
const history: SnapshotLite[] = [];
let tickerStarted = false;

function pushHistory(snap: SystemSnapshot): void {
  history.push(toLite(snap));
  if (history.length > HISTORY_SIZE) history.shift();
}

function detectChanges(prev: SystemSnapshot, curr: SystemSnapshot): void {
  // Component status transitions
  for (const key of ["mongodb", "redis", "aiGrpc"] as const) {
    const pStatus = prev.components[key].status;
    const cStatus = curr.components[key].status;
    if (pStatus !== cStatus) {
      publishLog({
        ts: curr.ts,
        level: cStatus === "down" ? "error" : "info",
        source: "system",
        msg: `${key}: ${pStatus} → ${cStatus}`,
        meta: { component: key, latencyMs: curr.components[key].latencyMs }
      });
    }
  }

  // Capture-hub reconnect transitions (monitoring hubs going down / recovering)
  if (curr.captureHubs.reconnecting !== prev.captureHubs.reconnecting) {
    publishLog({
      ts: curr.ts,
      level: curr.captureHubs.reconnecting > prev.captureHubs.reconnecting ? "warn" : "info",
      source: "system",
      msg: `capture hubs reconnecting: ${prev.captureHubs.reconnecting} → ${curr.captureHubs.reconnecting} (of ${curr.captureHubs.monitoring} monitored)`,
      meta: { reconnecting: curr.captureHubs.reconnecting, monitoring: curr.captureHubs.monitoring }
    });
  }

  // Worker status transitions
  for (const key of ["infer", "notification"] as const) {
    const pW = prev.workers[key];
    const cW = curr.workers[key];
    if (pW.status !== cW.status) {
      publishLog({
        ts: curr.ts,
        level: cW.status === "no_workers" ? "warn" : "info",
        source: "system",
        msg: `worker/${key}: ${pW.count} → ${cW.count} (${cW.status})`,
        meta: { worker: key, count: cW.count }
      });
    }
  }

  // Queue waiting spike ≥20 jobs in one tick
  for (const key of ["infer", "notification"] as const) {
    const delta = curr.queues[key].waiting - prev.queues[key].waiting;
    if (delta >= 20) {
      publishLog({
        ts: curr.ts,
        level: "warn",
        source: "system",
        msg: `queue/${key}: waiting spike +${delta} (now ${curr.queues[key].waiting})`,
        meta: { queue: key, waiting: curr.queues[key].waiting, delta }
      });
    }
  }
}

function startTicker(): void {
  if (tickerStarted) return;
  tickerStarted = true;

  const tick = async (): Promise<void> => {
    try {
      const snap = await collectSystemSnapshot();
      if (lastSnapshot) detectChanges(lastSnapshot, snap);
      lastSnapshot = snap;
      pushHistory(snap);
      systemEmitter.emit("snapshot", snap);
    } catch {
      // swallow — next tick will retry
    }
  };

  void tick();
  setInterval(() => void tick(), TICK_MS);
}

export async function getSystemHealthController(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const snap = await collectSystemSnapshot();
    sendSuccess(res, snap);
  } catch (err) {
    next(err);
  }
}

export function systemStreamController(req: Request, res: Response): void {
  startTicker();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now(), history, logHistory })}\n\n`);

  if (lastSnapshot) {
    res.write(`event: snapshot\ndata: ${JSON.stringify(lastSnapshot)}\n\n`);
  }

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 25_000);

  const snapshotHandler = (snap: SystemSnapshot): void => {
    res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
  };

  const logHandler = (entry: LogEntry): void => {
    res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
  };

  systemEmitter.on("snapshot", snapshotHandler);
  logEmitter.on("log", logHandler);

  req.on("close", () => {
    clearInterval(heartbeat);
    systemEmitter.off("snapshot", snapshotHandler);
    logEmitter.off("log", logHandler);
  });
}
