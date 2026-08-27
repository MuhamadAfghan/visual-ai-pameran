/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth-provider";
import { useUiStore } from "../store/ui.store";
import { playChime, speakViolation, unlockAudio } from "../utils/violationAudio";
import { getViolationAlertConfig } from "../services/settings.service";

export type LiveViolationItem = {
  check: string;
  confidence: number;
  severity: string | null;
  label: string;
};

export type LiveViolation = {
  id: string;
  cameraId: string;
  cameraName: string;
  violations: LiveViolationItem[];
  snapshotUrl: string | null;
  detectedAt: string;
};

export type SseStatus = "connecting" | "connected" | "disconnected";

type ViolationStreamContextValue = {
  events: LiveViolation[];
  status: SseStatus;
};

const ViolationStreamContext = createContext<ViolationStreamContextValue | undefined>(undefined);

const MAX_EVENTS = 20;
const RECONNECT_DELAY_MS = 5_000;

// Kept short on purpose (this also feeds the toast, not just TTS) — long enough
// to say what + where, short enough that "Pelanggaran" up front is the one word
// guaranteed to land before anyone half-listening tunes back in.
function buildSpokenSentence(event: Pick<LiveViolation, "cameraName" | "violations">): string {
  const labels = event.violations.map((v) => v.label).filter(Boolean);
  if (labels.length === 0) return `Pelanggaran terdeteksi di ${event.cameraName}.`;
  const summary = labels.length === 1 ? labels[0] : `${labels[0]} dan ${labels.length - 1} lainnya`;
  return `Pelanggaran: ${summary}, ${event.cameraName}.`;
}

/**
 * Single app-wide owner of the violation SSE connection (`/api/v1/events/stream`).
 * Mounted once at the app root so every authenticated route — including
 * /guest/* — shares one connection and reacts to the same live violation feed
 * with a chime + spoken (id-ID) announcement + toast.
 */
export function ViolationAlertProvider({ children }: PropsWithChildren) {
  const { user, token } = useAuth();
  const violationAudioEnabled = useUiStore((s) => s.violationAudioEnabled);
  const addToast = useUiStore((s) => s.addToast);
  const audioEnabledRef = useRef(violationAudioEnabled);
  audioEnabledRef.current = violationAudioEnabled;

  // System-wide policy (super_admin-configured) for what the alert actually
  // plays. Read via a ref so changing it never tears down the SSE connection.
  const { data: alertConfig } = useQuery({
    queryKey: ["violation-alert-config"],
    queryFn: getViolationAlertConfig,
    staleTime: 60_000,
    enabled: !!user
  });
  const alertConfigRef = useRef(alertConfig);
  alertConfigRef.current = alertConfig;

  const [events, setEvents] = useState<LiveViolation[]>([]);
  const [status, setStatus] = useState<SseStatus>("connecting");
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || !token) {
      setEvents([]);
      return;
    }

    let active = true;

    function connect() {
      if (!active) return;

      const base = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
      const url = `${base}/api/v1/events/stream?token=${encodeURIComponent(token as string)}`;

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
            eventId: string | null;
            cameraId: string;
            cameraName?: string;
            isRepeat?: boolean;
            violations: LiveViolationItem[];
            snapshotUrl: string | null;
            detectedAt: string;
          };
          const isRepeat = data.isRepeat === true;
          const violation: LiveViolation = {
            id: data.eventId ?? `repeat-${data.cameraId}-${data.detectedAt}`,
            cameraId: data.cameraId,
            cameraName: data.cameraName ?? data.cameraId,
            violations: data.violations ?? [],
            snapshotUrl: data.snapshotUrl,
            detectedAt: data.detectedAt
          };

          const sentence = buildSpokenSentence(violation);

          // A repeat ping re-announces an already-ongoing violation — no fresh
          // DetectionEvent exists for it, so it doesn't belong in the feed list
          // or as a new toast (that would spam the UI every repeatIntervalSeconds).
          // It still gets to re-trigger the audio below.
          if (!isRepeat) {
            setEvents((prev) => [violation, ...prev].slice(0, MAX_EVENTS));

            const hasHighSeverity = violation.violations.some((v) => v.severity === "high");
            addToast({ type: hasHighSeverity ? "error" : "info", message: sentence });
          }

          if (audioEnabledRef.current) {
            playChime();
            if ((alertConfigRef.current?.audioStyle ?? "beep_speech") === "beep_speech") {
              speakViolation(sentence);
            }
          }
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
    // `user` is intentionally read via closure, not listed here: AuthProvider
    // hands out a new `user` object reference on every 30s permission-refresh
    // poll, which would otherwise tear down and reopen this connection every
    // 30 seconds. `user?.id` is the stable proxy for "still the same login"
    // (same pattern as DeviceCameraProvider's auto-start effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token, addToast]);

  // One-time listener: primes AudioContext + speechSynthesis from a real user
  // gesture, for browsers that gate audio until one occurs.
  useEffect(() => {
    function onFirstGesture() {
      unlockAudio();
    }
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    window.addEventListener("keydown", onFirstGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, []);

  return <ViolationStreamContext.Provider value={{ events, status }}>{children}</ViolationStreamContext.Provider>;
}

export function useViolationStream(): ViolationStreamContextValue {
  const ctx = useContext(ViolationStreamContext);
  if (!ctx) throw new Error("useViolationStream must be used inside ViolationAlertProvider");
  return ctx;
}
