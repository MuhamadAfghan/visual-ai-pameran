import { useEffect, useRef, useState } from "react";

export type LiveViolation = {
  id: string;
  cameraId: string;
  violations: { check: string; confidence: number }[];
  snapshotUrl: string | null;
  detectedAt: string;
};

export type SseStatus = "connecting" | "connected" | "disconnected";

const TOKEN_KEY = "cctv_token";
const MAX_EVENTS = 20;
const RECONNECT_DELAY_MS = 5_000;

export function useLiveViolations() {
  const [events, setEvents] = useState<LiveViolation[]>([]);
  const [status, setStatus] = useState<SseStatus>("connecting");
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    function connect() {
      if (!active) return;

      const token = localStorage.getItem(TOKEN_KEY);
      const base = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
      const url = `${base}/api/v1/events/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`;

      const es = new EventSource(url);
      esRef.current = es;
      setStatus("connecting");

      es.addEventListener("connected", () => {
        if (active) setStatus("connected");
      });

      es.addEventListener("violation", (e: MessageEvent) => {
        if (!active) return;
        try {
          const data = JSON.parse(e.data) as {
            eventId: string;
            cameraId: string;
            violations: { check: string; confidence: number }[];
            snapshotUrl: string | null;
            detectedAt: string;
          };
          setEvents((prev) =>
            [
              {
                id: data.eventId,
                cameraId: data.cameraId,
                violations: data.violations ?? [],
                snapshotUrl: data.snapshotUrl,
                detectedAt: data.detectedAt
              },
              ...prev
            ].slice(0, MAX_EVENTS)
          );
        } catch {
          // ignore malformed SSE messages
        }
      });

      es.onerror = () => {
        if (!active) return;
        es.close();
        esRef.current = null;
        setStatus("disconnected");
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    }

    connect();

    return () => {
      active = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  return { events, status };
}
