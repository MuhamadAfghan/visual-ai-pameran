import { useEffect, useRef, useState } from "react";
import { getSystemHealth, openSystemStream } from "../../services/system-health.service";
import { clientLogHistory, subscribeClientLog } from "../../stores/client-log.store";
import type { LogEntry, SnapshotLite, SystemSnapshot } from "../../types/system-health.types";

const HISTORY_SIZE = 60;
const LOG_DISPLAY_MAX = 500;
const MAX_RECONNECT_DELAY = 30_000;
const POLL_FALLBACK_MS = 5_000;

type State = {
  snapshot: SystemSnapshot | null;
  history: SnapshotLite[];
  logs: LogEntry[];
  connected: boolean;
  error: string | null;
};

function toLite(s: SystemSnapshot): SnapshotLite {
  return {
    ts: s.ts,
    processed1m: s.events.last1m.processed,
    violations1m: s.events.last1m.violations,
    processingNow: s.cameras.processingNow,
    inferWaiting: s.queues.infer.waiting,
    inferActive: s.queues.infer.active
  };
}

export function useSystemHealth(): State {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [history, setHistory] = useState<SnapshotLite[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorCountRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const fallbackActiveRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    function pushSnapshot(snap: SystemSnapshot): void {
      setSnapshot(snap);
      setHistory((prev) => {
        const next = [...prev, toLite(snap)];
        if (next.length > HISTORY_SIZE) next.shift();
        return next;
      });
    }

    function pushLog(entry: LogEntry): void {
      setLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > LOG_DISPLAY_MAX) next.shift();
        return next;
      });
    }

    async function startPollFallback(): Promise<void> {
      if (fallbackActiveRef.current || disposed) return;
      fallbackActiveRef.current = true;

      const poll = async (): Promise<void> => {
        if (disposed) return;
        try {
          const snap = await getSystemHealth();
          pushSnapshot(snap);
          setConnected(true);
          setError(null);
        } catch (err) {
          setConnected(false);
          setError(err instanceof Error ? err.message : "Polling failed");
        }
      };

      void poll();
      pollTimerRef.current = window.setInterval(() => void poll(), POLL_FALLBACK_MS);
    }

    function connect(): void {
      if (disposed) return;

      const es = openSystemStream({
        onConnected: (hist, logHist) => {
          if (disposed) return;
          errorCountRef.current = 0;
          setHistory(hist);
          setLogs(logHist);
          setConnected(true);
          setError(null);
        },
        onSnapshot: (snap) => {
          if (disposed) return;
          pushSnapshot(snap);
          setConnected(true);
          setError(null);
        },
        onLog: (entry) => {
          if (disposed) return;
          pushLog(entry);
        },
        onError: () => {
          if (disposed) return;
          setConnected(false);
          errorCountRef.current += 1;

          es.close();
          esRef.current = null;

          if (errorCountRef.current >= 3) {
            setError("Realtime stream unavailable, falling back to polling");
            void startPollFallback();
            return;
          }

          const delay = Math.min(1_000 * 2 ** errorCountRef.current, MAX_RECONNECT_DELAY);
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        }
      });

      esRef.current = es;
    }

    connect();

    // Subscribe to browser-side capture logs (DeviceCameraProvider)
    // Seed with any entries already in the client log buffer, then subscribe to new ones
    setLogs((prev) => {
      const merged = [...clientLogHistory, ...prev];
      merged.sort((a, b) => a.ts - b.ts);
      return merged.slice(-LOG_DISPLAY_MAX);
    });
    const unsub = subscribeClientLog(pushLog);

    return () => {
      disposed = true;
      esRef.current?.close();
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
      unsub();
    };
  }, []);

  return { snapshot, history, logs, connected, error };
}
