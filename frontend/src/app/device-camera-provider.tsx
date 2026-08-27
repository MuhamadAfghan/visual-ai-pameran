/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCameras, pushFrame } from "../services/camera.service";
import type { Camera } from "../types/camera.types";
import { publishClientLog } from "../stores/client-log.store";
import { useAuth } from "./auth-provider";
import { usePermission } from "../hooks/use-permission";

type DeviceCameraContextValue = {
  stream: MediaStream | null;
  activeCameraId: string | null;
  lastCapture: Date | null;
  capturePending: boolean;
  error: string | null;
  /** All active device cameras configured in the system (refreshed periodically). */
  availableDeviceCameras: Camera[];
  startCapture: (cameraId: string, intervalSec: number) => Promise<void>;
  stopCapture: () => void;
};

const DeviceCameraContext = createContext<DeviceCameraContextValue | undefined>(undefined);

const LOG = "[DeviceCamera]";
const RETRY_WHEN_NOT_READY_MS = 2_000;
const CAMERA_LIST_REFRESH_MS = 60_000;
// Even with no configured floor (minCaptureGapSeconds=0 → "as fast as
// possible"), don't tick faster than this. Pushes now fire on a fixed
// interval regardless of whether the previous one has responded yet, so
// without a floor a 0-configured camera would fire as fast as the JS event
// loop allows — far beyond what a webcam actually decodes new frames at,
// just re-encoding near-duplicates and burning CPU/network for no benefit.
const MIN_TICK_MS = 100;
// Safety backpressure, not a normal-operation limit: if the AI service
// stalls, in-flight pushes would otherwise pile up unboundedly in the tab
// (each holding an encoded frame + pending promise) since nothing here waits
// for a response anymore. High enough to never engage during normal parallel
// operation — it only skips a tick once this many pushes are genuinely stuck.
const MAX_IN_FLIGHT = 8;

export function DeviceCameraProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermission();
  // Push-frame endpoint requires `cameras:capture` — a narrower permission than
  // cameras:update (which also covers editing camera config/RTSP settings), so
  // a viewer-tier account (including the guest session) can supply a device
  // camera's webcam without gaining any camera-editing rights. Without it the
  // backend returns 403 on every push, spamming the system log.
  const canPushFrames = can("cameras", "capture");

  /*
   * Off-screen video for canvas capture.
   * Must NOT be display:none — Chrome won't decode MediaStream frames for invisible elements,
   * keeping videoWidth=0 permanently. Off-screen + opacity:0 keeps decoding active.
   */
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  // Holds either the startup readiness-poll's setTimeout or the steady-state
  // setInterval — clearTimeout/clearInterval are interchangeable on a timer
  // ID in browsers, so one ref/clear function covers both phases.
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Count of pushes currently in flight, not a single-slot gate — captures
  // now fire on a fixed interval without waiting for the previous push's
  // response, so more than one can be outstanding at once. Drives the
  // exposed `capturePending` boolean and the MAX_IN_FLIGHT backpressure check.
  const inFlightCountRef = useRef(0);
  const cameraIdRef = useRef<string | null>(null);
  const intervalSecRef = useRef<number>(0);
  const tickCountRef = useRef(0);
  const skipCountRef = useRef(0);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [lastCapture, setLastCapture] = useState<Date | null>(null);
  const [capturePending, setCapturePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableDeviceCameras, setAvailableDeviceCameras] = useState<Camera[]>([]);

  // Attach stream to hidden video whenever it changes
  useEffect(() => {
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  // ── Timer helpers ────────────────────────────────────────────────────────────

  const clearCaptureTimer = useCallback(() => {
    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
  }, []);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // ── Capture loop ─────────────────────────────────────────────────────────────

  // Startup-only: right after getUserMedia resolves, the hidden <video> may
  // not have decoded its first frame yet. Poll quickly until it has —
  // independent of the configured capture interval, which could be much
  // longer — then hand off to the fixed-cadence steady-state loop below.
  // Once ready, an active MediaStream's video doesn't regress to not-ready,
  // so this phase only ever runs once per startCapture() call.
  const waitForVideoReadyThenLoop = useCallback(() => {
    if (!cameraIdRef.current) return;
    const video = hiddenVideoRef.current;
    const ready = video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
    if (!ready) {
      captureTimerRef.current = setTimeout(waitForVideoReadyThenLoop, RETRY_WHEN_NOT_READY_MS);
      return;
    }
    const tickMs = Math.max(MIN_TICK_MS, intervalSecRef.current * 1_000);
    captureTimerRef.current = setInterval(() => void doCapture(), tickMs);
    // doCapture is a stable plain function defined inside the component (like
    // startCapture/refreshDeviceCameraList above) — it only ever reads current
    // ref values, so omitting it here doesn't risk a stale closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCaptureLoop = useCallback(() => {
    clearCaptureTimer();
    if (!cameraIdRef.current) return;
    waitForVideoReadyThenLoop();
  }, [clearCaptureTimer, waitForVideoReadyThenLoop]);

  async function doCapture() {
    const cameraId = cameraIdRef.current;
    const video = hiddenVideoRef.current;
    if (!cameraId || !video) return;

    // Defensive only — waitForVideoReadyThenLoop already guarantees the video
    // is decoding before the steady-state interval ever starts calling this.
    // No special reschedule on a miss: the regular interval retries next tick.
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      skipCountRef.current += 1;
      console.warn(
        `${LOG} video not ready (readyState=${video.readyState}, ${video.videoWidth}x${video.videoHeight}) — skipping this tick`
      );
      publishClientLog("warn", "Video not ready → skipping this tick", {
        cameraId,
        readyState: video.readyState,
        resolution: `${video.videoWidth}x${video.videoHeight}`,
        skipCount: skipCountRef.current
      });
      return;
    }

    // Backpressure, not normal-path throttling: fires in parallel on every
    // tick regardless of whether earlier pushes have responded yet, so this
    // only engages if pushes are genuinely piling up (AI service stalled).
    if (inFlightCountRef.current >= MAX_IN_FLIGHT) {
      console.warn(`${LOG} ${inFlightCountRef.current} pushes already in flight — skipping this tick`);
      publishClientLog("warn", `Skipping tick — ${inFlightCountRef.current} pushes already in flight`, {
        cameraId,
        inFlight: inFlightCountRef.current
      });
      return;
    }

    tickCountRef.current += 1;
    inFlightCountRef.current += 1;
    setCapturePending(true);

    const frameNum = tickCountRef.current;
    const startedAt = performance.now();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Flip horizontally to produce a non-mirrored frame for backend inference
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
    }
    const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];

    publishClientLog("info", `⟳ Sending frame #${frameNum} → cameraId=${cameraId}`, {
      frame: frameNum,
      cameraId,
      resolution: `${canvas.width}x${canvas.height}`
    });

    try {
      await pushFrame(cameraId, base64);
      const elapsed = Math.round(performance.now() - startedAt);
      setLastCapture(new Date());
      console.info(
        `${LOG} ✓ frame #${frameNum} captured (${canvas.width}x${canvas.height}, ${elapsed}ms) → cameraId=${cameraId}`
      );
      publishClientLog("info", `✓ Frame #${frameNum} OK — ${elapsed}ms → cameraId=${cameraId}`, {
        frame: frameNum,
        cameraId,
        elapsed,
        resolution: `${canvas.width}x${canvas.height}`,
        interval: `${intervalSecRef.current}s`
      });
      queryClient.invalidateQueries({ queryKey: ["events", { cameraId, limit: 10 }] });
      queryClient.invalidateQueries({ queryKey: ["cameras", cameraId] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`${LOG} pushFrame failed:`, err);
      publishClientLog("error", `✗ Frame #${frameNum} failed — ${msg}`, {
        frame: frameNum,
        cameraId,
        reason: msg
      });
    } finally {
      inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
      setCapturePending(inFlightCountRef.current > 0);
      // No reschedule here — the steady-state setInterval keeps ticking on
      // its own fixed cadence regardless of how long this push took.
    }
  }

  // ── Public actions ───────────────────────────────────────────────────────────

  async function startCapture(cameraId: string, intervalSec: number) {
    // Guard: user must have cameras:capture to push frames, otherwise every tick → 403
    if (!canPushFrames) {
      console.info(`${LOG} startCapture skipped — current role lacks cameras:capture permission`);
      publishClientLog(
        "warn",
        `Capture skipped → cameraId=${cameraId}: role tidak punya permission cameras:capture`,
        { cameraId, reason: "missing_permission" }
      );
      return;
    }

    // Already running for this camera — the steady-state timer is a fixed
    // setInterval established once at its current tick rate, so a changed
    // interval needs an actual restart to take effect, not just a ref update.
    if (cameraIdRef.current === cameraId && captureTimerRef.current !== null) {
      if (intervalSecRef.current !== intervalSec) {
        intervalSecRef.current = intervalSec;
        startCaptureLoop();
        console.info(`${LOG} already capturing cameraId=${cameraId} — restarted at new interval=${intervalSec}s`);
        publishClientLog("info", `Capture interval changed → cameraId=${cameraId} interval=${intervalSec}s`);
      } else {
        console.info(`${LOG} already capturing cameraId=${cameraId} (interval=${intervalSec}s) — no-op`);
        publishClientLog("info", `Already capturing cameraId=${cameraId} interval=${intervalSec}s (no-op)`);
      }
      return;
    }

    setError(null);
    publishClientLog("info", `Requesting camera access → cameraId=${cameraId} interval=${intervalSec}s...`);
    console.info(`${LOG} requesting getUserMedia for cameraId=${cameraId} (interval=${intervalSec}s)…`);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });

      cameraIdRef.current = cameraId;
      intervalSecRef.current = intervalSec;
      tickCountRef.current = 0;
      skipCountRef.current = 0;
      setStream(mediaStream);
      setActiveCameraId(cameraId);
      setLastCapture(null);

      const track = mediaStream.getVideoTracks()[0];
      const settings = track?.getSettings();
      const resolution = `${settings?.width ?? "?"}x${settings?.height ?? "?"}`;
      const deviceLabel = track?.label ?? "unknown";
      console.info(
        `${LOG} ▶ capture started cameraId=${cameraId} interval=${intervalSec}s device="${deviceLabel}" (${resolution})`
      );
      publishClientLog("info", `▶ Capture started — cameraId=${cameraId} interval=${intervalSec}s`, {
        cameraId,
        interval: `${intervalSec}s`,
        device: deviceLabel,
        resolution
      });

      // Kick off the loop — waits for the video to actually be decoding
      // before starting the fixed-cadence steady-state interval.
      startCaptureLoop();
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Izin kamera ditolak. Izinkan akses kamera di browser."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "Tidak ada kamera yang terdeteksi."
            : "Gagal mengakses kamera device.";
      const reason = err instanceof DOMException ? err.name : err instanceof Error ? err.message : String(err);
      console.warn(`${LOG} getUserMedia failed:`, err);
      publishClientLog("error", `Camera access failed — ${msg}`, { cameraId, reason });
      setError(msg);
    }
  }

  function stopCapture() {
    if (cameraIdRef.current) {
      console.info(
        `${LOG} ■ capture stopped cameraId=${cameraIdRef.current} (frames=${tickCountRef.current}, skips=${skipCountRef.current})`
      );
      publishClientLog("info", `■ Capture stopped — cameraId=${cameraIdRef.current}`, {
        cameraId: cameraIdRef.current,
        frames: tickCountRef.current,
        skips: skipCountRef.current
      });
    }
    clearCaptureTimer();
    cameraIdRef.current = null;
    setStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
    setActiveCameraId(null);
    setLastCapture(null);
    inFlightCountRef.current = 0;
    setCapturePending(false);
    setError(null);
    if (hiddenVideoRef.current) hiddenVideoRef.current.srcObject = null;
  }

  // ── Camera list polling — pick up newly-added device cameras ─────────────────

  const refreshDeviceCameraList = useCallback(async () => {
    try {
      const cameras = await getCameras({ isActive: true });
      const deviceCams = cameras.filter((c) => c.sourceType === "device");
      setAvailableDeviceCameras(deviceCams);

      const activeId = cameraIdRef.current;
      const activeLabel = activeId
        ? deviceCams.find((c) => c._id === activeId)?.name ?? activeId
        : "none";
      console.info(
        `${LOG} device cameras configured: ${deviceCams.length} | currently capturing: ${activeId ? `"${activeLabel}"` : "none"}`
      );
      publishClientLog("info", `Camera list refreshed — ${deviceCams.length} device camera(s)`, {
        count: deviceCams.length,
        capturing: activeId ? activeLabel : "none"
      });
      if (deviceCams.length > 1) {
        console.info(
          `${LOG} note: ${deviceCams.length} device cameras exist but only 1 can stream per browser tab.`
        );
        publishClientLog("warn", `${deviceCams.length} device cameras found — only 1 can stream per tab`, {
          cameras: deviceCams.map((c) => c.name).join(", ")
        });
      }

      // Auto-start first device camera if nothing is running
      if (!activeId && deviceCams.length > 0) {
        const first = deviceCams[0];
        publishClientLog("info", `Auto-starting capture → "${first.name}" (${first._id})`, {
          cameraId: first._id,
          interval: `${first.minCaptureGapSeconds ?? 0}s`
        });
        void startCapture(first._id, first.minCaptureGapSeconds ?? 0);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`${LOG} failed to fetch camera list:`, err);
      publishClientLog("error", `Failed to refresh camera list — ${msg}`);
    }
    // startCapture is a stable plain function defined inside the component — adding it
    // to deps would re-create this callback on every render; the current behavior is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-start / auto-stop based on auth + permission ────────────────────────
  // The device-camera capture loop posts to /push-frame which requires
  // `cameras:capture` (admin/viewer/pic all have it by default — see
  // defaultPermissions.ts — so a guest/kiosk session can supply its own
  // webcam too). Any role/custom permission set lacking it must never start
  // the loop — otherwise every interval tick produces a 403 and floods the
  // system log.

  useEffect(() => {
    if (!user || !canPushFrames) {
      stopCapture();
      clearRefreshTimer();
      setAvailableDeviceCameras([]);
      return;
    }

    void refreshDeviceCameraList();
    refreshTimerRef.current = setInterval(() => void refreshDeviceCameraList(), CAMERA_LIST_REFRESH_MS);

    return () => clearRefreshTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, canPushFrames]);

  // ── Tab visibility — log so user can correlate gaps ──────────────────────────

  useEffect(() => {
    function onVisibility() {
      if (!cameraIdRef.current) return;
      if (document.hidden) {
        console.info(`${LOG} tab hidden — browser may throttle capture interval`);
        publishClientLog("warn", `Tab hidden — capture may be throttled`, { cameraId: cameraIdRef.current });
      } else {
        console.info(`${LOG} tab visible — resuming normal capture cadence`);
        publishClientLog("info", `Tab visible — resuming capture`, { cameraId: cameraIdRef.current });
        // Bonus immediate capture on return — the regular interval keeps
        // ticking on its own cadence regardless, this just avoids waiting out
        // a full tick after a potentially-long tab-hidden gap.
        void doCapture();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // doCapture is a stable plain function defined inside the component (like
    // startCapture/refreshDeviceCameraList above) — it only ever reads current
    // ref values, so omitting it here doesn't risk a stale closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DeviceCameraContext.Provider
      value={{
        stream,
        activeCameraId,
        lastCapture,
        capturePending,
        error,
        availableDeviceCameras,
        startCapture,
        stopCapture
      }}
    >
      <video
        ref={hiddenVideoRef}
        autoPlay
        playsInline
        muted
        aria-hidden="true"
        style={{ position: "fixed", top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
      {children}
    </DeviceCameraContext.Provider>
  );
}

export function useDeviceCamera(): DeviceCameraContextValue {
  const ctx = useContext(DeviceCameraContext);
  if (!ctx) throw new Error("useDeviceCamera must be used inside DeviceCameraProvider");
  return ctx;
}
