import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../app/auth-provider";
import {
  openLiveCameraStream,
  pollLiveDetections,
  type LiveCheckResult,
  type LiveStreamResult,
  type LiveViolation
} from "../../services/camera.service";
import type { Detection } from "../../types/event.types";

const MAX_RECONNECT_DELAY = 30_000;
// No longer needs to be aggressive — unlike the old poll loop, this fallback
// isn't what keeps the server's capture cycle warm (it's always-on now), it's
// purely a degrade-mode safety net while SSE is unavailable.
const POLL_FALLBACK_MS = 1_500;

export type LiveCameraStreamStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "not_monitored"
  | "error";

export type LiveCameraStreamState = {
  status: LiveCameraStreamStatus;
  seq: number;
  /** Exact frame the AI analyzed for this result (base64 JPEG) — the live
   *  view renders this directly instead of a separately-paced video feed, so
   *  it and `detections` are always in sync. */
  frame: string | null;
  width: number | null;
  height: number | null;
  detections: Detection[];
  checkResults: LiveCheckResult[];
  violations: LiveViolation[];
  /** ms epoch of the last applied result — drives the consumer's stale-overlay fade. */
  lastUpdatedAt: number | null;
  error: string | null;
};

const EMPTY_RESULT = {
  seq: 0,
  frame: null as string | null,
  width: null,
  height: null,
  detections: [] as Detection[],
  checkResults: [] as LiveCheckResult[],
  violations: [] as LiveViolation[]
};

function idleState(): LiveCameraStreamState {
  return { status: "connecting", lastUpdatedAt: null, error: null, ...EMPTY_RESULT };
}

/**
 * Drives the unified live view's detection-overlay channel: SSE first
 * (openLiveCameraStream), falling back to short-polling (pollLiveDetections)
 * after 3 consecutive SSE failures — mirrors useSystemHealth's reconnect/
 * fallback shape. `enabled` should reflect camera.isActive: a paused camera
 * has no monitoring hub to connect to.
 */
export function useLiveCameraStream(
  cameraId: string | undefined,
  enabled: boolean
): LiveCameraStreamState {
  const { token } = useAuth();
  const [state, setState] = useState<LiveCameraStreamState>(idleState);

  const errorCountRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const fallbackActiveRef = useRef(false);
  const lastSeqRef = useRef(0);

  useEffect(() => {
    if (!enabled || !cameraId || !token) {
      setState(idleState());
      return;
    }

    // Narrowed once here — TS can't see the early-return guard's narrowing
    // persist into the closures declared below.
    const cid: string = cameraId;

    let disposed = false;
    lastSeqRef.current = 0;
    setState(idleState());

    function applyResult(r: LiveStreamResult): void {
      // Device-camera pushes fire in parallel now (see device-camera-provider),
      // so results can arrive out of capture order — a slow request can settle
      // after a later, faster one already displayed. seq is assigned at push
      // arrival (not completion), so a stale/late result always has a seq <=
      // what's already shown here; drop it instead of regressing the view.
      if (r.seq <= lastSeqRef.current) return;
      lastSeqRef.current = r.seq;
      setState({
        status: "live",
        seq: r.seq,
        frame: r.frame,
        width: r.width,
        height: r.height,
        detections: r.detections,
        checkResults: r.checkResults ?? [],
        violations: r.violations ?? [],
        lastUpdatedAt: Date.now(),
        error: null
      });
    }

    async function startPollFallback(): Promise<void> {
      if (fallbackActiveRef.current || disposed) return;
      fallbackActiveRef.current = true;

      const poll = async (): Promise<void> => {
        if (disposed) return;
        try {
          const r = await pollLiveDetections(cid, lastSeqRef.current);
          if (disposed) return;
          if (!r.monitored) {
            setState((s) => ({ ...s, status: "not_monitored", error: null }));
          } else if (!r.unchanged) {
            applyResult(r);
          }
        } catch (err) {
          if (disposed) return;
          // 403 = role lacks cameras:stream. Retrying can't fix it — stop
          // guessing and surface a clear message instead of looping forever.
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 403) {
            setState((s) => ({
              ...s,
              status: "error",
              error: "Anda tidak punya akses live stream untuk kamera ini."
            }));
            return;
          }
          // Other errors (network / AI hiccup) — transient, keep retrying.
        }
        if (!disposed) {
          pollTimerRef.current = window.setTimeout(() => void poll(), POLL_FALLBACK_MS);
        }
      };

      void poll();
    }

    function connect(): void {
      if (disposed) return;

      const es = openLiveCameraStream(cid, token, {
        onConnected: () => {
          if (disposed) return;
          errorCountRef.current = 0;
        },
        onResult: (payload) => {
          if (disposed) return;
          applyResult(payload);
        },
        onNotMonitored: () => {
          if (disposed) return;
          setState((s) => ({ ...s, status: "not_monitored", error: null }));
        },
        onError: () => {
          if (disposed) return;
          errorCountRef.current += 1;

          es.close();
          esRef.current = null;

          if (errorCountRef.current >= 3) {
            void startPollFallback();
            return;
          }

          setState((s) => (s.status === "live" ? { ...s, status: "reconnecting" } : s));
          const delay = Math.min(1_000 * 2 ** errorCountRef.current, MAX_RECONNECT_DELAY);
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        }
      });

      esRef.current = es;
    }

    connect();

    return () => {
      disposed = true;
      esRef.current?.close();
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
    };
  }, [cameraId, enabled, token]);

  return state;
}
