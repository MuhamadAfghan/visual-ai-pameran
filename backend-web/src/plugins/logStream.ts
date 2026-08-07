import { EventEmitter } from "node:events";
import { Writable } from "node:stream";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  source: "system" | "http";
  msg: string;
  meta?: Record<string, unknown>;
}

export const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(300);

export const logHistory: LogEntry[] = [];
const LOG_HISTORY_SIZE = 300;

let logSeq = 0;

export function publishLog(entry: Omit<LogEntry, "id" | "ts"> & { ts?: number }): void {
  const full: LogEntry = {
    id: String(++logSeq),
    ts: entry.ts ?? Date.now(),
    level: entry.level,
    source: entry.source,
    msg: entry.msg,
    ...(entry.meta !== undefined ? { meta: entry.meta } : {})
  };
  logHistory.push(full);
  if (logHistory.length > LOG_HISTORY_SIZE) logHistory.shift();
  logEmitter.emit("log", full);
}

// Writable stream that captures pino-http JSON lines and surfaces
// only 4xx/5xx HTTP responses as structured log entries.
export function createPinoHttpStream(): Writable {
  let buf = "";
  return new Writable({
    write(chunk: Buffer | string, _enc: BufferEncoding, cb: () => void) {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const raw = JSON.parse(line) as Record<string, unknown>;
          const res = raw["res"] as Record<string, unknown> | undefined;
          const req = raw["req"] as Record<string, unknown> | undefined;
          const statusCode = typeof res?.statusCode === "number" ? res.statusCode : undefined;
          if (statusCode !== undefined && statusCode >= 400) {
            publishLog({
              ts: typeof raw["time"] === "number" ? raw["time"] : Date.now(),
              level: statusCode >= 500 ? "error" : "warn",
              source: "http",
              msg: `${String(req?.method ?? "?")} ${String(req?.url ?? "?")} → ${statusCode}`,
              meta: {
                statusCode,
                responseTime: raw["responseTime"],
                ...(req?.id !== undefined ? { reqId: req.id } : {})
              }
            });
          }
        } catch {
          // non-JSON line (e.g. pino-pretty in dev) — ignore
        }
      }
      cb();
    }
  });
}
