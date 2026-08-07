import { apiClient, unwrap } from "./api-client";
import type { SystemSnapshot, SnapshotLite, LogEntry } from "../types/system-health.types";

export async function getSystemHealth(): Promise<SystemSnapshot> {
  const res = await apiClient.get<{ success: boolean; data: SystemSnapshot }>("/system/health");
  return unwrap(res);
}

export type StreamHandlers = {
  onConnected?: (history: SnapshotLite[], logHistory: LogEntry[]) => void;
  onSnapshot: (snap: SystemSnapshot) => void;
  onLog?: (entry: LogEntry) => void;
  onError?: (err: Event) => void;
};

export function openSystemStream(handlers: StreamHandlers): EventSource {
  const base = import.meta.env.VITE_API_URL ?? "";
  const url = `${base}/api/v1/system/stream`;

  const es = new EventSource(url);

  es.addEventListener("connected", (e) => {
    try {
      const payload = JSON.parse((e as MessageEvent).data) as {
        history?: SnapshotLite[];
        logHistory?: LogEntry[];
      };
      handlers.onConnected?.(payload.history ?? [], payload.logHistory ?? []);
    } catch {
      handlers.onConnected?.([], []);
    }
  });

  es.addEventListener("snapshot", (e) => {
    try {
      const snap = JSON.parse((e as MessageEvent).data) as SystemSnapshot;
      handlers.onSnapshot(snap);
    } catch {
      // ignore malformed
    }
  });

  es.addEventListener("log", (e) => {
    try {
      const entry = JSON.parse((e as MessageEvent).data) as LogEntry;
      handlers.onLog?.(entry);
    } catch {
      // ignore malformed
    }
  });

  if (handlers.onError) {
    es.onerror = handlers.onError;
  }

  return es;
}
