import type { LogEntry, LogLevel } from "../types/system-health.types";

type ClientLogListener = (entry: LogEntry) => void;

const listeners: ClientLogListener[] = [];
let seq = 0;

export const clientLogHistory: LogEntry[] = [];
const CLIENT_LOG_MAX = 300;

export function publishClientLog(
  level: LogLevel,
  msg: string,
  meta?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    id: `c-${++seq}`,
    ts: Date.now(),
    level,
    source: "capture",
    msg,
    ...(meta !== undefined ? { meta } : {})
  };
  clientLogHistory.push(entry);
  if (clientLogHistory.length > CLIENT_LOG_MAX) clientLogHistory.shift();
  for (const fn of listeners) fn(entry);
}

export function subscribeClientLog(listener: ClientLogListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}
